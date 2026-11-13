/**
 * Browser suite (npm run test:browser): real ECharts, MapLibre and d3 in
 * Chromium against the fixture pages of tests/browser/fixtures.mjs.
 *
 *   - lifecycle: keyboard selection, network error and "Try again", repeated
 *     swaps and type cleanup (Compare); renderer disposal and detached-theme
 *     handling; lazy library loading (dashboards);
 *   - every block's fixture boots on the precompute's golden output with no
 *     page or console error and reaches its ready state;
 *   - the shared interaction contract: no serious or critical axe violation on
 *     any fixture surface in light or dark; a visible focus outline in forced
 *     colours; no horizontal overflow at 320px; fullscreen (a chart panel, a
 *     whole block, the two nested, and the chart toolbar's slot order) and the
 *     translated map controls.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FIXTURES, FIXTURE_DATA } from './fixtures.mjs';

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

/**
 * The precompute's own output on the synthetic corpus (tests/golden/, written by
 * tests/integration/GoldenTest.php), served by artifact path.
 */
const GOLDEN = join(import.meta.dirname, '..', 'golden');
async function goldenData(path) {
  const relative = path.replace(/^.*\/generations\/[^/]+\//, '');
  if (relative === path || relative.includes('..')) return undefined;
  try { return JSON.parse(await readFile(join(GOLDEN, relative), 'utf8')); } catch { return undefined; }
}

/** The data a fixture is served in the shared contract tests. */
const dataFor = (name) => (FIXTURE_DATA[name] === 'golden' ? goldenData : fullData);

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
      // The compare plan loads ECharts on demand, as on the live site.
      await ns.ensureLibs({ echarts: true, maplibre: true, d3: true });
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

  // Golden networks are small, so the worker path (graph-force.js from
  // WORKER_MIN_NODES) only runs here: a co-author-sized network lays out off the
  // page, answers the keyboard, and takes its worker with it when disposed; a
  // page that cannot start a worker, or whose worker cannot load d3, still gets
  // the graph, laid out on the page.
  const MODES = {
    worker: ['in a worker', { started: 1, terminated: 1 }],
    blocked: ['on the page when workers are blocked', { started: 0, terminated: 0 }],
    broken: ['on the page when the worker cannot load d3', { started: 1, terminated: 1 }],
  };
  for (const [mode, [title, expected]] of Object.entries(MODES)) {
    const blocked = mode === 'blocked';
    test(`a large co-occurrence network lays out ${title}`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript((block) => {
        const Real = window.Worker;
        window.__workers = { started: 0, terminated: 0 };
        window.Worker = function (url) {
          if (block) throw new Error('Workers are blocked here');
          window.__workers.started++;
          const worker = new Real(url);
          const terminate = worker.terminate.bind(worker);
          worker.terminate = () => { window.__workers.terminated++; terminate(); };
          return worker;
        };
      }, blocked);
      await stubData(page, fullData);
      await openSurface(page, 'compare');
      await page.evaluate(async (broken) => {
        const ns = window.RV;
        await ns.ensureLibs({ d3: true });
        // The page has d3; the worker is pointed at a script that does not exist.
        if (broken) window.RV_LIBS.d3 = ['/asset/vendor/missing-d3.js'];
        const nodes = [], links = [];
        for (let i = 0; i < 300; i++) {
          nodes.push({ name: `Person ${i}`, value: 1 + (i % 7), community: i % 6, rank: (i % 13) / 13, matched: true });
          if (i % 50) links.push({ source: `Person ${i - 1}`, target: `Person ${i}`, value: 1 + (i % 3), relation: 'coauthor' });
          if (i > 7) links.push({ source: `Person ${i}`, target: `Person ${(i * 7) % i}`, value: 1, relation: 'mixed' });
        }
        const host = document.createElement('div');
        host.style.cssText = 'width:800px;height:520px';
        document.querySelector('#ownership').appendChild(host);
        window.__chart = ns.charts.buildCommunities(host, { nodes, links, communities: [] }, '/s/test');
      }, mode === 'broken');
      const canvas = page.locator('#ownership canvas.rv-graph-canvas');
      await expect(page.locator('#ownership .rv-graph-loading')).toHaveCount(0);
      // Something is drawn: the first organised picture reached the canvas.
      await expect.poll(() => canvas.evaluate((c) => {
        const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let painted = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i]) painted++;
        return painted;
      })).toBeGreaterThan(1000);
      // The keyboard walk reaches a node, and Enter selects it into the card.
      await canvas.focus();
      await canvas.press('ArrowRight');
      await expect(page.locator('#ownership .rv-graph-status')).toContainText('Person');
      await canvas.press('Enter');
      await expect(page.locator('#ownership .rv-kg-card')).toBeVisible();
      const workers = await page.evaluate(() => {
        window.RV.disposeWithin(document.querySelector('#ownership'));
        return window.__workers;
      });
      expect(workers).toEqual(expected);
      expect(errors).toEqual([]);
    });
  }

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

  test('a long bar chart pages twenty bars at a time, and its data table keeps every row', async ({ page }) => {
    const people = Array.from({ length: 45 }, (_, i) => ({ name: `Person ${String(i + 1).padStart(2, '0')}`, value: 45 - i, itemId: 100 + i }));
    await stubData(page, (path) => (path.endsWith('/test.json') ? { totalItems: 45, contributors: people } : undefined));
    await openSurface(page, 'dashboard');
    const panel = page.locator('.chart-panel', { has: page.locator('[data-chart="contributors"]') });
    const status = panel.locator('.rv-bar-pager-status');
    const topBar = () => panel.locator('[data-chart="contributors"]').evaluate((el) => {
      const labels = window.echarts.getInstanceByDom(el).getOption().yAxis[0].data;
      return labels[labels.length - 1];
    });
    await expect(status).toHaveText('1–20 of 45');
    await expect(panel.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(await topBar()).toBe('Person 01');
    await panel.getByRole('button', { name: 'Next page' }).click();
    await expect(status).toHaveText('21–40 of 45');
    expect(await topBar()).toBe('Person 21');
    await panel.getByRole('button', { name: 'Last page' }).click();
    await expect(status).toHaveText('41–45 of 45');
    await expect(panel.getByRole('button', { name: 'Next page' })).toBeDisabled();
    await panel.getByRole('button', { name: 'First page' }).click();
    await expect(status).toHaveText('1–20 of 45');
    await panel.locator('.rv-data-table-toggle').click();
    await expect(panel.locator('.rv-data-table-grid tbody tr')).toHaveCount(45);
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

test.describe('content map', () => {
  test('a title search selects an article, rings its closest articles and lists them as links', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openSurface(page, 'content-map');
    await page.waitForFunction(() => window.RV._allCharts.length === 2);
    await expect(page.locator('.photo-content-detail__hint')).toBeVisible();
    // AI-generated group names are announced as such, naming the model.
    await expect(page.locator('.photo-content-ai-note')).toContainText('AI-generated group names');
    await expect(page.locator('.photo-content-ai-note')).toContainText('An AI model');
    await expect(page.locator('.photo-content-method')).toContainText('google/embeddinggemma-2');

    await page.getByLabel('Find an article on the map').fill('article 7 ');
    await page.getByRole('button', { name: 'Article 7 on xylophones' }).click();
    const detail = page.locator('.photo-content-detail');
    await expect(detail.getByRole('link', { name: 'Article 7 on xylophones' })).toHaveAttribute('href', '/s/test/item/7');
    await expect(detail.locator('ol > li')).toHaveCount(5);
    await expect(detail.locator('ol > li').first().getByRole('link')).toHaveAttribute('href', '/s/test/item/10');
    const overlay = await page.evaluate(() => {
      const option = window.RV._allCharts[0].getOption();
      const series = (id) => option.series.find((s) => s.id === id).data.length;
      return [series('rv-content-selected'), series('rv-content-neighbours')];
    });
    expect(overlay).toEqual([1, 5]);

    // Colouring by decade keeps the selection.
    await page.getByRole('button', { name: 'Decade' }).click();
    await expect(page.getByRole('button', { name: 'Decade' })).toHaveAttribute('aria-pressed', 'true');
    await expect(detail.locator('ol > li')).toHaveCount(5);
    // Groups over time: one row per group (the "not in a group" articles left out).
    const rows = await page.evaluate(() => window.RV._allCharts[1].getOption().yAxis[0].data.length);
    expect(rows).toBe(3);
    expect(errors).toEqual([]);
  });

  test('a page opened at #content-<id> starts on the map with that article selected', async ({ page }) => {
    await page.goto('/fixture/content-map#content-12');
    await expect(page.locator('.photo-content-detail').getByRole('link', { name: 'Article 12 on hip hop' })).toBeVisible();
  });

  test('Words compares chips: frequent words add, the combobox suggests, uncounted words are named', async ({ page }) => {
    await openSurface(page, 'content-map');
    await page.getByRole('tab', { name: 'Words' }).click();
    await page.waitForFunction(() => window.RV._allCharts.length === 3);
    const lines = () => page.evaluate(() => window.RV._allCharts[2].getOption().series.map((s) => s.name));
    expect(await lines()).toEqual(['mbira', 'guitar', 'church', 'jazz', 'women']);

    // A chip removes its line; a frequent word adds one in the colour the removed line freed.
    const colourOf = (word) => page.evaluate((w) => window.RV._allCharts[2].getOption().series.find((s) => s.name === w).lineStyle.color, word);
    const jazzColour = await colourOf('jazz');
    await page.getByRole('button', { name: 'Remove jazz', exact: true }).click();
    expect(await lines()).toEqual(['mbira', 'guitar', 'church', 'women']);
    await page.getByRole('button', { name: 'Add music', exact: true }).click();
    expect(await lines()).toEqual(['mbira', 'guitar', 'church', 'women', 'music']);
    expect(await colourOf('music')).toBe(jazzColour);

    // The combobox offers counted words that start with the text, most frequent first.
    const input = page.getByRole('combobox', { name: 'Words to compare' });
    await input.fill('dru');
    await expect(page.getByRole('option').first()).toHaveAttribute('data-word', 'drum');
    await input.press('ArrowDown');
    await expect(input).toHaveAttribute('aria-activedescendant', /-0$/);
    await input.press('Enter');
    expect(await lines()).toEqual(['mbira', 'guitar', 'church', 'women', 'music', 'drum']);

    // Six is the most; a seventh, or a word too rare to be counted, is refused and named.
    await expect(page.getByRole('button', { name: 'Add dance', exact: true })).toBeDisabled();
    await input.fill('zzqq');
    await input.press('Enter');
    await expect(page.locator('.photo-content-words__missing')).toContainText('zzqq');
    // Backspace in the empty field removes the last chip.
    await input.press('Backspace');
    expect(await lines()).toEqual(['mbira', 'guitar', 'church', 'women', 'music']);
  });

  test('Places shades countries on the shared MapLibre map, filters by decade and lists a country\'s articles', async ({ page }) => {
    await openSurface(page, 'content-map');
    await page.getByRole('tab', { name: 'Places' }).click();
    await page.waitForFunction(() => window.RV._allMaps.length === 1
      && window.RV._allMaps[0].map.getSource('content-places'));
    const shaded = () => page.evaluate(async () => (await window.RV._allMaps[0].map.getSource('content-places').getData())
      .features.filter((f) => f.properties.count > 0).map((f) => [f.properties.ADMIN, f.properties.count]).sort());
    expect(await shaded()).toEqual([['Brazil', 10], ['Ghana', 10], ['Uganda', 10]]);
    await expect(page.locator('.photo-content-places .rv-choropleth-legend')).toContainText('Articles per country');
    await page.getByRole('button', { name: '1950s' }).click();
    await expect(page.locator('.photo-content-places .semantic-map-status')).toContainText('3 articles');
    expect(await shaded()).toEqual([['Brazil', 1], ['Ghana', 1], ['Uganda', 1]]);
    await page.locator('.photo-content-places details.semantic-map-list > summary').click();
    await page.getByRole('button', { name: /^Ghana/ }).click();
    await expect(page.locator('.photo-content-places .photo-content-detail ol > li')).toHaveCount(1);
  });
});

test.describe('every block boots', () => {
  for (const name of FIXTURES.filter((fixture) => FIXTURE_DATA[fixture] === 'golden')) {
    test(`${name}: renders golden data with no page or console error`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await stubData(page, goldenData);
      const container = await openSurface(page, name);
      await expect(container).toHaveAttribute('data-state', 'ready');
      expect(errors).toEqual([]);
      // Chart headings and their toolbars (core/toolbar.js): the toolbar is a
      // named role="toolbar" BESIDE the heading in .rv-chart-heading, never
      // inside it (a button in an h3 joins the heading's accessible name), and
      // every icon-only control has a name of its own.
      expect(await chartHeadingFindings(page)).toEqual([]);
    });
  }

  test('a dashboard\'s charts carry their toolbars beside their headings', async ({ page }) => {
    await stubData(page, goldenData);
    await openSurface(page, 'collection-overview');
    await expect(page.locator('.rv-chart-heading > [role="toolbar"]').first()).toBeAttached();
    expect(await chartHeadingFindings(page)).toEqual([]);
  });

  test('journals, publishers and book series share one panel with a switch', async ({ page }) => {
    await stubData(page, goldenData);
    await openSurface(page, 'publications');
    const panel = page.locator('.rv-chart-panel-tabbed');
    await expect(panel).toHaveCount(1);
    await expect(panel).toHaveClass(/chart-panel-wide/);
    const tabs = panel.getByRole('group', { name: 'Where they were published' }).getByRole('button');
    await expect(tabs).toHaveText(['Journals (5)', 'Publishers (8)', 'Book series (2)']);
    await expect(tabs.first()).toHaveAttribute('aria-pressed', 'true');
    // The other two no longer get panels of their own.
    await expect(page.locator('[data-chart="topPublishers"], [data-chart="topSeries"]')).toHaveCount(0);

    // The panel may still be below the fold, built only as it nears the viewport.
    await panel.scrollIntoViewIfNeeded();
    const chart = panel.locator('.chart-container');
    await expect(chart).toHaveAttribute('data-chart', 'topJournals');
    const categories = () => chart.evaluate((el) => window.echarts.getInstanceByDom(el)?.getOption().yAxis[0].data.length);
    await expect.poll(categories).toBe(5);

    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(tabs.first()).toHaveAttribute('aria-pressed', 'false');
    await expect(chart).toHaveAttribute('data-chart', 'topPublishers');
    await expect(panel.locator('.chart-description')).toHaveText('The publishers that issued the most of these publications.');
    await expect.poll(categories).toBe(8);
    // The chart is named after the tab it shows, and the data table lists it.
    await expect(chart).toHaveAttribute('aria-label', /publishers that issued/);
    await panel.locator('.rv-data-table-toggle').click();
    await expect(panel.locator('.rv-data-table tbody tr')).toHaveCount(8);
  });
});

/** Every chart heading or toolbar on the page that breaks the contract above. */
function chartHeadingFindings(page) {
  return page.evaluate(() => {
    const findings = [];
    const describe = (node) => node.closest('[data-chart]')?.dataset.chart || node.className;
    for (const bar of document.querySelectorAll('.rv-chart-toolbar')) {
      if (bar.getAttribute('role') !== 'toolbar' || !(bar.getAttribute('aria-label') || '').trim()) findings.push(`${describe(bar)}: unnamed or role-less toolbar`);
      if (!bar.parentElement?.classList.contains('rv-chart-heading')) findings.push(`${describe(bar)}: toolbar outside .rv-chart-heading`);
      if (bar.closest('h1, h2, h3, h4, h5, h6')) findings.push(`${describe(bar)}: toolbar inside a heading`);
      for (const button of bar.querySelectorAll('button')) {
        if (!(button.getAttribute('aria-label') || button.textContent).trim()) findings.push(`${describe(bar)}: unnamed toolbar button`);
      }
    }
    for (const heading of document.querySelectorAll('.dashboard-block .chart-panel h3')) {
      if (!heading.parentElement?.classList.contains('rv-chart-heading')) findings.push(`${describe(heading)}: chart title outside .rv-chart-heading`);
    }
    return findings;
  });
}

test.describe('interaction contract', () => {
  for (const name of FIXTURES) {
    for (const theme of ['light', 'dark']) {
      test(`${name} (${theme}): no serious or critical axe violations`, async ({ page }) => {
        await stubData(page, dataFor(name));
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
        // Known and tracked (docs/ROADMAP.md X10): each cluster-map marker is a
        // 24 px target, but neighbouring partners overlap at the overview zoom,
        // which fails the spacing half of WCAG 2.5.8. Every other target counts.
        const knownOverlap = (violation) => violation.id === 'target-size'
          && violation.nodes.every((node) => node.target.join(' ').includes('.rv-cluster-marker'));
        const blocking = results.violations
          .filter((violation) => ['serious', 'critical'].includes(violation.impact) && !knownOverlap(violation))
          .map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target.join(' ')) }));
        expect(blocking).toEqual([]);
      });
    }

    test(`${name}: no horizontal overflow at 320px`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await stubData(page, dataFor(name));
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

  test('a chart panel expands with its legend, frees the map wheel, and Escape leaves', async ({ page }) => {
    await stubData(page, fullData);
    await openSurface(page, 'dashboard');
    const panel = page.locator('.chart-panel', { has: page.locator('.maplibregl-map') });
    const button = panel.locator('.rv-chart-toolbar .rv-fullscreen-btn');
    await button.waitFor();
    // The panel's own toolbar carries it; the map draws no second one.
    await expect(panel.locator('.maplibregl-ctrl .rv-fullscreen-btn')).toHaveCount(0);
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(button).toHaveAccessibleName('Fullscreen');
    const gestures = () => page.evaluate(() => window.RV._allMaps[0].map.cooperativeGestures.isEnabled());
    expect(await gestures()).toBe(true);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button).toHaveAccessibleName('Exit fullscreen');
    await expect(page.locator('.chart-panel.rv-fullscreen')).toHaveCount(1);
    const layer = await page.locator('.chart-panel.rv-fullscreen').evaluate((el) => getComputedStyle(el).zIndex);
    expect(layer).toBe('290'); // --z-stage
    // The page keeps the panel's place while it is lifted out.
    await expect(page.locator('.rv-fullscreen-placeholder')).toHaveCount(1);
    expect(await gestures()).toBe(false);
    await page.keyboard.press('Escape');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.chart-panel.rv-fullscreen')).toHaveCount(0);
    await expect(page.locator('.rv-fullscreen-placeholder')).toHaveCount(0);
    expect(await gestures()).toBe(true);
  });

  test('chart toolbar controls keep their slots whatever order they arrive in', async ({ page }) => {
    await stubData(page, fullData);
    await openSurface(page, 'dashboard');
    const order = await page.evaluate(() => {
      const ns = window.RV;
      const panel = document.createElement('div');
      panel.className = 'chart-panel';
      panel.innerHTML = '<h3>Late chart</h3><div class="chart-container"></div>';
      document.body.appendChild(panel);
      const button = (name) => { const b = document.createElement('button'); b.textContent = name; return b; };
      // A lazily built panel: embed first, then fullscreen, then the exports.
      ns.addToChartToolbar(panel, 'embed', button('embed'));
      ns.addToChartToolbar(panel, 'fullscreen', button('fullscreen'));
      ns.addToChartToolbar(panel, 'export', [button('save'), button('csv')]);
      const bars = panel.querySelectorAll('.rv-chart-toolbar');
      const names = [...bars[0].children].map((b) => b.textContent);
      panel.remove();
      return { bars: bars.length, names };
    });
    expect(order).toEqual({ bars: 1, names: ['save', 'csv', 'embed', 'fullscreen'] });
  });

  test('a block expands whole with its controls; Escape leaves the innermost surface first', async ({ page }) => {
    await stubData(page, fullData);
    await openSurface(page, 'semantic');
    const actions = page.locator('.semantic-map-block > .rv-embed-block-toolbar');
    await expect(actions.getByRole('button')).toHaveText(['Embed this', '']);
    const button = actions.locator('.rv-fullscreen-btn');
    await expect(button).toHaveAccessibleName('Fullscreen');
    // The block owns fullscreen: its chart panel does not get a second one.
    await expect(page.locator('.semantic-map-panel .rv-fullscreen-btn')).toHaveCount(0);
    await button.click();
    const block = page.locator('.semantic-map-block.rv-fullscreen');
    await expect(block).toHaveCount(1);
    await expect(block.locator('.semantic-map-toolbar')).toBeVisible();
    await expect(block.locator('.semantic-map-chart')).toBeVisible();
    // A surface opened inside the expanded block (a panel of the project
    // explorer) closes first; a second Escape leaves the block.
    await page.evaluate(() => {
      const panel = document.querySelector('.semantic-map-panel');
      panel.appendChild(window.RV.fullscreenButton(panel)).click();
    });
    await expect(page.locator('.rv-fullscreen')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(page.locator('.rv-fullscreen')).toHaveCount(1);
    await expect(block).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.rv-fullscreen')).toHaveCount(0);
    await expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  test('map controls speak the page language', async ({ page }) => {
    await stubData(page, fullData);
    await openSurface(page, 'dashboard', { i18n: { mapZoomIn: 'Vergrößern', fullscreen: 'Vollbild' } });
    await expect(page.locator('.maplibregl-ctrl-zoom-in')).toHaveAttribute('title', 'Vergrößern');
    await expect(page.locator('.chart-panel .rv-fullscreen-btn').first()).toHaveAccessibleName('Vollbild');
    // One navigation preset everywhere: zoom in / out, no compass.
    await expect(page.locator('.maplibregl-ctrl-compass')).toHaveCount(0);
  });
});
