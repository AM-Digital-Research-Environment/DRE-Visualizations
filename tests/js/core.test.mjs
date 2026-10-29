import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// The shared core's own sources (asset/js/core/*.js), each run in a sandbox:
// the served dashboard-core.js is their concatenation.
const read = (name) => readFileSync(new URL(`../../asset/js/core/${name}`, import.meta.url), 'utf8');
const BASE = read('base.js');
const LIBS = read('libs.js');
/** A sandbox value as a plain object: objects made in a vm context have that context's prototypes. */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** base.js in a page whose head carries `payloads` as rv-config JSON elements. */
function loadBase({ lang = 'en', payloads = [], window: extra = {} } = {}) {
  const nodes = payloads.map((payload, i) => ({ id: `rv-config-${i + 1}`, textContent: typeof payload === 'string' ? payload : JSON.stringify(payload) }));
  const window = { RV: {}, ...extra };
  const document = {
    documentElement: { lang },
    querySelectorAll: (selector) => (selector.includes('rv-config-') ? nodes : []),
  };
  vm.runInNewContext(BASE, { window, document, navigator: {}, Intl }, { filename: 'asset/js/core/base.js' });
  return window;
}

test('page configuration: payloads merge in document order, the first value for a key winning', () => {
  const window = loadBase({
    payloads: [
      { dataBase: '/s/a/dre-data/', i18n: { hello: 'Bonjour' }, mapConfig: { lightStyle: '/light' } },
      { libs: { echarts: '/e1.js' } },
      'not json',
      { dataBase: '/s/b/dre-data/', libs: { echarts: '/e2.js', d3: ['/q.js', '/f.js'] }, i18n: { hello: 'Hi', bye: 'Ciao' } },
    ],
  });
  assert.equal(window.RV_DATA_BASE, '/s/a/dre-data/');
  assert.deepEqual(plain(window.RV_LIBS), { echarts: '/e1.js', d3: ['/q.js', '/f.js'] });
  assert.deepEqual(plain(window.RV_I18N), { hello: 'Bonjour', bye: 'Ciao' });
  assert.deepEqual(plain(window.RV_MAP_CONFIG), { lightStyle: '/light' });
  assert.equal(window.RV.t('hello', 'Hello'), 'Bonjour');
  assert.equal(window.RV.t('missing', 'Fallback'), 'Fallback');
});

test('page configuration: globals another script set first are kept (DRE Search, item-set photo views)', () => {
  const window = loadBase({ payloads: [{ libs: { maplibre: '/ours.js' } }], window: { RV_LIBS: { maplibre: '/theirs.js' } } });
  assert.equal(window.RV_LIBS.maplibre, '/theirs.js');
});

test('fill replaces known placeholders and leaves unknown ones for the reader to see', () => {
  const { RV } = loadBase();
  assert.equal(RV.fill('in {country}, {year}', { country: 'Benin', year: 2020 }), 'in Benin, 2020');
  assert.equal(RV.fill('{a} and {b}', { a: 1 }), '1 and {b}');
});

test('plural picks the translated form for the page locale and formats the count', () => {
  const en = loadBase({ payloads: [{ i18n: { memberOne: 'member', memberOther: 'members' } }] }).RV;
  assert.equal(en.plural(1, 'member', 'Member', 'Members', true), '1 member');
  assert.equal(en.plural(1234, 'member', 'Member', 'Members', true), '1,234 members');
  assert.equal(en.plural(0, 'member', 'Member', 'Members', false), 'members');
  // French is singular at zero; the English fallback follows the same rule.
  assert.equal(loadBase({ lang: 'fr' }).RV.plural(0, 'item', 'élément', 'éléments', false), 'élément');
});

test('numbers follow the page language, never the browser', () => {
  assert.equal(loadBase({ lang: 'de' }).RV.formatNumber(1234567), '1.234.567');
  assert.equal(loadBase({ lang: 'en' }).RV.formatNumber(1234567), '1,234,567');
  assert.equal(loadBase().RV.formatNumber('n/a'), 'n/a');
});

test('escapeHtml neutralises markup, truncateLabel and fold behave', () => {
  const { RV } = loadBase();
  assert.equal(RV.escapeHtml('<img src=x onerror="a()">&\''), '&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;');
  assert.equal(RV.escapeHtml(null), '');
  assert.equal(RV.truncateLabel('Université Joseph Ki-Zerbo', 10), 'Université…');
  assert.equal(RV.truncateLabel('', 5), '');
  assert.equal(RV.fold('Côte d’Ivoire LAÏCITÉ'), 'cote d’ivoire laicite');
});

/** libs.js against a fake head whose scripts load when `settle(src)` says so. */
function loadLibs(libs, window = {}) {
  const appended = [];
  const head = {
    querySelector: () => null,
    appendChild(node) { appended.push(node); node.parentNode = head; },
    removeChild(node) { appended.splice(appended.indexOf(node), 1); },
  };
  const document = {
    head,
    readyState: 'complete',
    createElement: (tag) => ({ tag, dataset: {}, set src(value) { this._src = value; }, get src() { return this._src; } }),
  };
  const win = { RV: {}, RV_LIBS: libs, ...window };
  vm.runInNewContext(LIBS, { window: win, document }, { filename: 'asset/js/core/libs.js' });
  return { ns: win.RV, appended, win };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('ensureLibs runs the d3 stack in order, one file after the other', async () => {
  const d3 = ['/d3-quadtree.js', '/d3-dispatch.js', '/d3-timer.js', '/d3-force.js'];
  const { ns, appended } = loadLibs({ d3 });
  const done = ns.ensureLibs({ d3: true });
  for (let i = 0; i < d3.length; i++) {
    await tick();
    assert.deepEqual(plain(appended.map((s) => s.src)), d3.slice(0, i + 1), 'the next file waits for the previous one');
    appended[i].onload();
  }
  await done;
});

test('ensureLibs resolves at once for a library already on the page, and loads the word cloud after ECharts', async () => {
  const { ns, appended } = loadLibs({ echarts: '/echarts.js', wordcloud: '/wordcloud.js' }, { echarts: {} });
  const done = ns.ensureLibs({ wordcloud: true });
  await tick();
  assert.deepEqual(plain(appended.map((s) => s.src)), ['/wordcloud.js']);
  appended[0].onload();
  await done;
  assert.equal(ns._wordcloudLoaded, true);
});

test('a failed library is forgotten, so "Try again" fetches it afresh', async () => {
  const { ns, appended } = loadLibs({ echarts: '/echarts.js' });
  const first = ns.ensureLibs({ echarts: true });
  await tick();
  appended[0].onerror(new Error('offline'));
  await assert.rejects(first);
  assert.equal(appended.length, 0, 'the dead tag is removed');
  const second = ns.ensureLibs({ echarts: true });
  await tick();
  assert.equal(appended.length, 1, 'a new tag is injected');
  appended[0].onload();
  await second;
});
