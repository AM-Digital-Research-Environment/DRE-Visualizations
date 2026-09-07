import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../asset/js/dashboard.js', import.meta.url), 'utf8');
const core = readFileSync(new URL('../../asset/js/dashboard-core.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function element() {
    return {
        dataset: {}, children: [], attributes: {}, innerHTML: '', textContent: '',
        classList: { add() {} },
        setAttribute(key, value) { this.attributes[key] = value; },
        appendChild(child) { this.children.push(child); },
        replaceChildren() { this.children = []; this.innerHTML = ''; },
        addEventListener(event, callback) { this[event] = callback; },
        querySelector() { return null; },
        closest() { return this; },
    };
}

async function dashboard({ data, libraryError, builderError } = {}) {
    const content = element(), status = element(), host = element();
    host.dataset = { itemId: 'collection-overview', layout: 'collectionOverview', title: 'Collection overview' };
    host.querySelector = selector => selector === '.rv-dashboard-content' ? content : status;
    const built = [];
    content.querySelector = selector => {
        const key = selector.match(/data-chart="([^"]+)"/)?.[1];
        return key && content.innerHTML.includes(`data-chart="${key}"`) ? element() : null;
    };
    const layout = { order: ['curated', 'second'], wide: [], tall: [] };
    const errors = [];
    let reloads = 0;
    const ns = {
        LAYOUTS: { collectionOverview: layout }, DEFAULT_LAYOUT: { ...layout, order: ['generic'] },
        t: (_key, fallback) => fallback,
        ensureLibs: () => libraryError ? Promise.reject(libraryError) : Promise.resolve(),
        fetchDataJson: () => data instanceof Error ? Promise.reject(data) : Promise.resolve(data ?? {
            totalItems: 2, resourceType: 'generic', stats: [1], curated: [1], second: [2], generic: [3],
        }),
        renderStatCards: () => 'DUPLICATE_STATS',
        CHART_MAP: Object.fromEntries(['curated', 'second'].map(key => [key, () => {
            built.push(key);
            if (builderError && key === 'curated') throw builderError;
        }])),
    };
    vm.runInNewContext(source, {
        window: { RV: ns, location: { reload() { reloads++; } } },
        document: { readyState: 'complete', createElement: element,
            querySelectorAll: selector => selector === '.dashboard-async-container' ? [host] : [] },
        console: { warn: (...args) => errors.push(args) },
    });
    await flush();
    return { host, content, status, built, errors, reloads: () => reloads };
}

test('async wrapper preserves curated layout/title and the persistent live region', async () => {
    const { content, status, host, built } = await dashboard();
    assert.match(content.innerHTML, /<h2>Collection overview<\/h2>/);
    assert.doesNotMatch(content.innerHTML, /DUPLICATE_STATS|data-chart="generic"/);
    assert.deepEqual(built, ['curated', 'second']);
    assert.equal(host.attributes['aria-busy'], 'false');
    assert.equal(host.dataset.state, 'ready');
    assert.equal(status.textContent, 'Visualisations ready.');
});

for (const kind of ['data', 'library']) {
    test(`${kind} failure shows a visible recovery control and clears busy state`, async () => {
        const error = new Error('offline');
        const result = await dashboard(kind === 'data' ? { data: error } : { libraryError: error });
        assert.equal(result.host.dataset.state, 'error');
        assert.equal(result.host.attributes['aria-busy'], 'false');
        const notice = result.content.children[0];
        assert.equal(notice.children[0].textContent, 'Visualisations are unavailable.');
        assert.equal(notice.children[1].textContent, 'Reload page');
        notice.children[1].click();
        assert.equal(result.reloads(), 1);
        assert.equal(result.errors.length, 1);
    });
}

test('empty data shows a visible explanation without a misleading retry', async () => {
    const result = await dashboard({ data: { totalItems: 0 } });
    assert.equal(result.host.dataset.state, 'empty');
    assert.equal(result.content.children[0].children.length, 1);
});

test('one failing chart does not erase other charts or announce full success', async () => {
    const result = await dashboard({ builderError: new Error('bad chart') });
    assert.deepEqual(result.built, ['curated', 'second']);
    assert.equal(result.host.dataset.state, 'partial');
    assert.equal(result.status.textContent, 'Some visualisations could not be loaded.');
    assert.match(result.content.innerHTML, /data-chart="second"/);
});

function dataLoader(respond) {
    const calls = [];
    const ns = { moduleAsset: path => '/' + path };
    // Execute the production data-loader section, with HTTP as its only stub.
    const section = core.slice(core.indexOf('    ns.dataAsset ='), core.indexOf('    /* ------------------------------------------------------------------ */', core.indexOf('    ns.fetchDataJson =')));
    vm.runInNewContext(section, { ns, fetch: async url => {
        calls.push(url);
        return respond(url);
    } });
    return { ns, calls };
}
const response = (status, body) => ({ ok: status === 200, status, json: async () => body });
const oldId = '20260901T000000Z-aaaaaaaaaaaa';
const newId = '20260907T000000Z-bbbbbbbbbbbb';

test('a pruned generation refreshes its manifest once and retries the new artifact', async () => {
    let manifests = 0;
    const { ns, calls } = dataLoader(url => url.endsWith('current.json')
        ? response(200, { generationId: ++manifests === 1 ? oldId : newId })
        : url.includes(oldId) ? response(404) : response(200, { totalItems: 42 }));
    assert.equal((await ns.fetchDataJson('item-dashboards/test.json')).totalItems, 42);
    assert.equal(manifests, 2);
    assert.equal(calls.length, 4);
});

test('an unchanged manifest does not retry a missing artifact indefinitely', async () => {
    const { ns, calls } = dataLoader(url => url.endsWith('current.json')
        ? response(200, { generationId: oldId }) : response(404));
    await assert.rejects(ns.fetchDataJson('item-dashboards/test.json'), /404/);
    assert.equal(calls.length, 3);
});

test('HTTP 500 does not trigger generation fallback', async () => {
    const { ns, calls } = dataLoader(url => url.endsWith('current.json')
        ? response(200, { generationId: oldId }) : response(500));
    await assert.rejects(ns.fetchDataJson('item-dashboards/test.json'), /500/);
    assert.equal(calls.length, 2);
});
