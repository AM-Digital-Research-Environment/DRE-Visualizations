/**
 * Browser suite (npm run test:browser): real ECharts, MapLibre and d3 in
 * Chromium against the fixture pages of tests/browser/fixtures.mjs.
 *
 *   - lifecycle: keyboard selection, network error and "Try again", repeated
 *     swaps and type cleanup (Compare); renderer disposal and detached-theme
 *     handling; lazy library loading (dashboards);
 *   - the shared interaction contract: no serious or critical axe violation on
 *     any fixture surface in light or dark; a visible focus outline in forced
 *     colours; no horizontal overflow at 320px; the fullscreen control and the
 *     translated map controls.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { FIXTURES } from './fixtures.mjs';

const GENERATION = '20261005T000000Z-aaaaaaaaaaaa';
const INDEX = [{ id: 1, name: 'Alpha', items: 2 }, { id: 2, name: 'Beta', items: 3 }];
const DASHBOARD = {
  totalItems: 3,
  types: [{ name: 'Book', value: 2 }, { name: 'Article', value: 1 }],
  languages: [{ name: 'English', value: 2 }, { name: 'French', value: 1 }],
  locations: [{ name: 'Bayreuth', lat: 49.94, lon: 11.58, value: 2, itemId: 7 }],
};
// What one side of a comparison loads: one chart's worth of data.
const COMPARE_SIDE = { totalItems: 2, types: [{ name: 'Book', value: 2 }] };
const SEMANTIC = {
  schemaVersion: 1,
  items: Array.from({ length: 24 }, (_, i) => ({
    id: i + 1, x: Math.cos(i) * (1 + i % 5), y: Math.sin(i) * (1 + i % 4),
    type: i % 2 ? 'podcasts' : 'publications', typeLabel: i % 2 ? 'Podcast' : 'Publication',
    cluster: i % 3, lowSignal: i % 11 === 0, title: `Public record ${i + 1}`,
  })),
};

/**
 * Stub the generated-data endpoint. `respond(path)` returns a JSON body, a
 * number (an HTTP error status), or undefined (404). Returns the request log.
 */
async function stubData(page, respond) {
  const requests = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  await page.route('**/s/test/dre-data/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('current.json')) return route.fulfill({ json: { generationId: GENERATION } });
    const body = await respond(path);
    if (typeof body === 'number') return route.fulfill({ status: body, json: {} });
    if (body === undefined) return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: body });
  });
  return requests;
}

const fullData = (path) => (path.endsWith('-index.json') ? INDEX
  : path.endsWith('embeddings/map.json') ? SEMANTIC
    : path.endsWith('/test.json') ? DASHBOARD
      : path.includes('item-dashboards/') ? COMPARE_SIDE : undefined);

/** Open a fixture and wait until its surface reports a terminal state. */
async function openSurface(page, name, { theme = 'light', i18n } = {}) {
  const query = new URLSearchParams({ theme, ...(i18n ? { i18n: JSON.stringify(i18n) } : {}) });
  await page.goto(`/fixture/${name}?${query}`);
  const container = page.locator('[data-state]').first();
  await expect(container).toHaveAttribute('data-state', /^(ready|empty|error|unavailable|partial)$/);
  await expect(container).toHaveAttribute('aria-busy', 'false');
  return container;
}

async function chooseCompare(combo, name) {
  await combo.fill(name);
  await combo.press('ArrowDown');
  await combo.press('Enter');
}

test.describe('lifecycle', () => {
  test('compare: keyboard selection, network error and retry, swaps, type cleanup', async ({ page }) => {
    let failRight = true;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await stubData(page, (path) => (path.endsWith('-index.json') ? INDEX
      : path.endsWith('/2.json') && failRight ? 500 : COMPARE_SIDE));
    await openSurface(page, 'compare');
    const combos = page.getByRole('combobox');
    await chooseCompare(combos.nth(0), 'Alpha');
    await chooseCompare(combos.nth(1), 'Beta');
    const retry = page.getByRole('button', { name: 'Try again' });
    await retry.waitFor();
    await expect(page.locator('.compare-content')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.rv-async-status')).toHaveText('The comparison could not be loaded.');
    failRight = false;
    await retry.click();
    await page.waitForFunction(() => window.RV._allCharts.length === 2);
    for (let i = 0; i < 4; i++) {
      await chooseCompare(combos.nth(0), i % 2 ? 'Alpha' : 'Beta');
      await page.waitForFunction(() => window.RV._allCharts.length === 2);
    }
    await page.getByRole('button', { name: 'People', exact: true }).click();
    await page.waitForFunction(() => window.RV._allCharts.length === 0);
    expect(errors).toEqual([]);
  });

  test('real ECharts, MapLibre and d3 renderers are disposed, and a detached theme switch is safe', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await stubData(page, fullData);
    await openSurface(page, 'compare');
    const ownership = await page.evaluate(async () => {
      const ns = window.RV;
      await ns.ensureLibs({ maplibre: true, d3: true });
      const root = document.querySelector('#ownership');
      function host() {
        const el = document.createElement('div');
        el.style.cssText = 'width:400px;height:280px';
        root.appendChild(el);
        return el;
      }
      const chart = ns.initChart(host());
      chart.setOption({ xAxis: { data: ['A'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] });
      let rebuilt = 0, removed = 0;
      const map = new window.maplibregl.Map({ container: host(), style: { version: 8, sources: {}, layers: [] }, attributionControl: false });
      map.on('remove', () => removed++);
      ns.trackMap(map, () => rebuilt++);
      const graph = ns.ForceGraph.create(host(), { nodes: [], categories: [], colorOf: () => '#336699' });
      graph.setGraph({ nodes: [{ id: '1', name: 'A', category: 0 }, { id: '2', name: 'B', category: 0 }], links: [{ source: '1', target: '2' }] });
      ns.disposeWithin(root);
      root.replaceChildren();
      document.body.setAttribute('data-theme', 'dark');
      ns.refresh();
      return { disposed: chart.isDisposed(), removed, rebuilt, maps: ns._allMaps.length, renderers: ns._allRenderers.length };
    });
    expect(ownership).toEqual({ disposed: true, removed: 1, rebuilt: 0, maps: 0, renderers: 0 });
    expect(errors).toEqual([]);
  });

  test('an empty dashboard loads no heavy library; a pie chart loads only ECharts', async ({ page }) => {
    let empty = true;
    const requests = await stubData(page, (path) => (path.endsWith('/test.json')
      ? (empty ? { totalItems: 0 } : { totalItems: 2, types: [{ name: 'Book', value: 2 }] }) : undefined));
    const container = await openSurface(page, 'dashboard');
    await expect(container).toHaveAttribute('data-state', 'empty');
    await expect(page.locator('.rv-async-status')).toHaveText('No visualisations are available.');
    expect(requests.some((path) => path.startsWith('/asset/vendor/'))).toBe(false);
    empty = false;
    requests.length = 0;
    await page.reload();
    await expect(page.locator('[data-state]').first()).toHaveAttribute('data-state', 'ready');
    expect([...new Set(requests.filter((path) => path.startsWith('/asset/vendor/')))]).toEqual(['/asset/vendor/echarts.min.js']);
  });

  test('a failed dashboard shows "Try again", which reruns the request in place', async ({ page }) => {
    let fail = true;
    await stubData(page, (path) => (path.endsWith('/test.json') ? (fail ? 503 : DASHBOARD) : undefined));
    const container = await openSurface(page, 'dashboard');
    await expect(container).toHaveAttribute('data-state', 'error');
    await expect(page.locator('.rv-async-status')).toHaveText('The visualisation could not be loaded.');
    fail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(container).toHaveAttribute('data-state', 'ready');
    await expect(container).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.chart-panel')).toHaveCount(3);
  });
});

test.describe('interaction contract', () => {
  for (const name of FIXTURES) {
    for (const theme of ['light', 'dark']) {
      test(`${name} (${theme}): no serious or critical axe violations`, async ({ page }) => {
        await stubData(page, fullData);
        await openSurface(page, name, { theme });
        if (name === 'compare') {
          const combos = page.getByRole('combobox');
          await chooseCompare(combos.nth(0), 'Alpha');
          await chooseCompare(combos.nth(1), 'Beta');
          await page.waitForFunction(() => window.RV._allCharts.length === 2);
        }
        // The disclosures are part of the surface: audit them open.
        for (const summary of await page.locator('details.rv-data-table > summary').all()) await summary.click();
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        const blocking = results.violations
          .filter((violation) => ['serious', 'critical'].includes(violation.impact))
          .map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target.join(' ')) }));
        expect(blocking).toEqual([]);
      });
    }

    test(`${name}: no horizontal overflow at 320px`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await stubData(page, fullData);
      await openSurface(page, name);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test('focused controls keep a visible outline in forced colours', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await stubData(page, fullData);
    await openSurface(page, 'dashboard');
    await page.locator('.rv-toolbar-btn').first().waitFor();
    const unringed = [];
    const seen = new Set();
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        return {
          key: el.outerHTML.slice(0, 90),
          visible: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
        };
      });
      if (!focus || seen.has(focus.key)) continue;
      seen.add(focus.key);
      if (!focus.visible) unringed.push(focus.key);
    }
    expect(seen.size).toBeGreaterThan(3);
    expect(unringed).toEqual([]);
  });

  test('the map fullscreen control toggles aria-pressed and its label, and Escape leaves', async ({ page }) => {
    await stubData(page, fullData);
    await openSurface(page, 'dashboard');
    const button = page.locator('.rv-map-fullscreen');
    await button.waitFor();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(button).toHaveAccessibleName('Fullscreen');
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button).toHaveAccessibleName('Exit fullscreen');
    const panel = page.locator('.chart-panel.rv-fullscreen');
    await expect(panel).toHaveCount(1);
    const layer = await panel.evaluate((el) => getComputedStyle(el).zIndex);
    expect(layer).toBe('290'); // --z-stage
    await page.keyboard.press('Escape');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.chart-panel.rv-fullscreen')).toHaveCount(0);
  });

  test('map controls speak the page language', async ({ page }) => {
    await stubData(page, fullData);
    await openSurface(page, 'dashboard', { i18n: { mapZoomIn: 'Vergrößern', fullscreen: 'Vollbild' } });
    await expect(page.locator('.maplibregl-ctrl-zoom-in')).toHaveAttribute('title', 'Vergrößern');
    await expect(page.locator('.rv-map-fullscreen')).toHaveAccessibleName('Vollbild');
    // One navigation preset everywhere: zoom in / out, no compass.
    await expect(page.locator('.maplibregl-ctrl-compass')).toHaveCount(0);
  });
});
