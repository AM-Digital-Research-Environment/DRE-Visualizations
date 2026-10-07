import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '../..');
const generation = '20261005T000000Z-aaaaaaaaaaaa';
let failRight = true;
let emptyDashboard = true;
const requests = [];
const scripts = ['vendor/echarts.min.js', 'js/dashboard-core.js', 'js/graph-canvas.js', 'js/graph-force.js',
    'js/dashboard-charts.bundle.js', 'js/dashboard-compare-unify.js', 'js/dashboard-compare.js'];
const fixture = `<!doctype html><html><head><link rel="stylesheet" href="/asset/css/dre-visualizations.css">
<script>window.RV_DATA_BASE='/s/test/dre-data/';window.RV_LIBS={
echarts:'/asset/vendor/echarts.min.js',maplibre:'/asset/vendor/maplibre-gl.js',maplibreWorker:'/asset/vendor/maplibre-gl-worker.js',
maplibreCss:'/asset/vendor/maplibre-gl.css',d3:['dispatch','quadtree','timer','force'].map(n=>'/asset/vendor/d3-'+n+'.min.js')};</script>
${scripts.map(p => `<script defer src="/asset/${p}"></script>`).join('')}
</head><body><div class="compare-container" data-site-base="/s/test"></div><div id="ownership"></div></body></html>`;
const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    requests.push(path);
    if (path === '/dashboard') {
        res.setHeader('Content-Type', 'text/html');
        return res.end(fixture.replace('<script defer src="/asset/vendor/echarts.min.js"></script>', '').replace('js/dashboard-compare.js', 'js/dashboard.js').replace('<div class="compare-container" data-site-base="/s/test"></div>', '<div class="dashboard-async-container" data-item-id="test" data-site-base="/s/test"><div class="rv-dashboard-content"></div></div>'));
    }
    if (path === '/') { res.setHeader('Content-Type', 'text/html'); return res.end(fixture); }
    if (path.startsWith('/s/test/dre-data/')) {
        res.setHeader('Content-Type', 'application/json');
        if (path.endsWith('current.json')) return res.end(JSON.stringify({ generationId: generation }));
        if (path.endsWith('-index.json')) return res.end(JSON.stringify([{ id: 1, name: 'Alpha', items: 2 }, { id: 2, name: 'Beta', items: 3 }]));
        if (path.endsWith('/test.json') && emptyDashboard) return res.end('{"totalItems":0}');
        if (path.endsWith('/2.json') && failRight) { res.statusCode = 500; return res.end('{}'); }
        return res.end(JSON.stringify({ totalItems: 2, types: [{ name: 'Book', value: 2 }] }));
    }
    const file = resolve(root, '.' + path);
    if (!file.startsWith(root + '/') && !file.startsWith(root + '\\')) { res.statusCode = 403; return res.end(); }
    try {
        res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css' })[extname(file)] || 'application/octet-stream');
        res.end(await readFile(file));
    } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
let page = null;
try {
    page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const combos = page.getByRole('combobox');
    await combos.nth(0).fill('Alpha');
    await combos.nth(0).press('ArrowDown');
    await combos.nth(0).press('Enter');
    await combos.nth(1).fill('Beta');
    await combos.nth(1).press('ArrowDown');
    await combos.nth(1).press('Enter');
    await page.getByRole('button', { name: 'Try again' }).waitFor();
    assert.equal(await page.locator('.compare-content').getAttribute('aria-busy'), 'false');
    failRight = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.waitForFunction(() => window.RV._allCharts.length === 2);
    for (let i = 0; i < 4; i++) {
        await combos.nth(0).fill(i % 2 ? 'Alpha' : 'Beta');
        await combos.nth(0).press('ArrowDown');
        await combos.nth(0).press('Enter');
        await page.waitForFunction(() => window.RV._allCharts.length === 2);
    }
    await page.getByRole('button', { name: 'People', exact: true }).click();
    await page.waitForFunction(() => window.RV._allCharts.length === 0);
    console.log('Browser: keyboard selection, network error/retry, repeated swaps, and type cleanup passed.');

    const ownership = await page.evaluate(async () => {
        const ns = window.RV;
        await ns.ensureLibs({ maplibre: true, d3: true });
        const root = document.querySelector('#ownership');
        function host() { const el = document.createElement('div'); el.style.cssText = 'width:400px;height:280px'; root.appendChild(el); return el; }
        const chart = ns.initChart(host());
        chart.setOption({ xAxis: { data: ['A'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] });
        let rebuilt = 0, removed = 0;
        const map = new window.maplibregl.Map({ container: host(), style: { version: 8, sources: {}, layers: [] }, attributionControl: false });
        map.on('remove', () => removed++);
        ns.trackMap(map, () => rebuilt++);
        const graphHost = host();
        const graph = ns.ForceGraph.create(graphHost, { nodes: [], categories: [], colorOf: () => '#336699' });
        graph.setGraph({ nodes: [{ id: '1', name: 'A', category: 0 }, { id: '2', name: 'B', category: 0 }], links: [{ source: '1', target: '2' }] });
        ns.disposeWithin(root);
        root.replaceChildren();
        document.body.setAttribute('data-theme', 'dark');
        ns.refresh();
        return { disposed: chart.isDisposed(), removed, rebuilt, charts: ns._allCharts.length, maps: ns._allMaps.length, renderers: ns._allRenderers.length };
    });
    assert.deepEqual(ownership, { disposed: true, removed: 1, rebuilt: 0, charts: 0, maps: 0, renderers: 0 });
    assert.deepEqual(errors, []);
    console.log('Browser: real ECharts, MapLibre, and d3 renderer disposal and detached-theme handling passed.');
    await page.close();
    page = await browser.newPage();
    requests.length = 0;
    await page.goto(`http://127.0.0.1:${server.address().port}/dashboard`);
    await page.waitForFunction(() => document.querySelector('.dashboard-async-container').dataset.state === 'empty');
    assert.equal(requests.some(p => p.startsWith('/asset/vendor/')), false, JSON.stringify(requests));
    emptyDashboard = false;
    requests.length = 0;
    await page.reload();
    await page.waitForFunction(() => document.querySelector('.dashboard-async-container').dataset.state === 'ready');
    assert.deepEqual([...new Set(requests.filter(p => p.startsWith('/asset/vendor/')))], ['/asset/vendor/echarts.min.js']);
    console.log('Browser: empty dashboards load no heavy libraries; a pie chart loads only ECharts.');
} catch (error) {
    // CI uploads this directory when the job fails (ci.yml, PLAYWRIGHT_ARTIFACT_DIR).
    const dir = process.env.PLAYWRIGHT_ARTIFACT_DIR;
    if (dir && page) {
        await mkdir(dir, { recursive: true });
        await page.screenshot({ path: resolve(dir, 'failure.png'), fullPage: true }).catch(() => {});
        await writeFile(resolve(dir, 'failure.json'), JSON.stringify({
            url: page.url(), error: String(error && error.stack || error), requests,
        }, null, 2)).catch(() => {});
    }
    throw error;
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
