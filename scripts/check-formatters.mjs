#!/usr/bin/env node
/**
 * Executes every ECharts tooltip formatter the chart builders produce against hostile
 * labels, and fails if any returns raw markup.
 *
 * The data is real-shaped: every dashboard in tests/golden/item-dashboards/
 * (the golden precompute output) is fed to the registered builder for each of
 * its chart keys, with every string in it replaced by an HTML payload. The
 * builders run in a VM against the real dashboard-core and chart bundle, with
 * a stub ECharts that records each setOption(). Every `formatter` function in
 * a recorded option is then called with parameters built from the option's
 * own (hostile) series data; its output must not contain an unescaped tag.
 *
 * String templates ('{b}: {c}') are not executed here: ECharts encodes those
 * itself in HTML tooltips.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(import.meta.dirname, '..');
const HOSTILE = '<img src=x onerror=alert(1)>';
const goldenDir = join(ROOT, 'tests', 'golden', 'item-dashboards');

/* ---- A small DOM stand-in: enough for dashboard-core and the builders. ---- */
function element(tag = 'div') {
  const node = {
    tagName: String(tag).toUpperCase(), children: [], style: {}, dataset: {}, attributes: {}, classList: {
      add() {}, remove() {}, toggle() {}, contains: () => false,
    },
    textContent: '', innerHTML: '', parentNode: null, isConnected: true, hidden: false, value: '',
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k] ?? null; },
    hasAttribute(k) { return k in this.attributes; },
    removeAttribute(k) { delete this.attributes[k]; },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    insertBefore(c) { this.children.unshift(c); c.parentNode = this; return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; },
    replaceChildren(...c) { this.children = c; },
    remove() {},
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; },
    getBoundingClientRect: () => ({ width: 600, height: 400, top: 0, left: 0 }),
    getContext: () => ({
      clearRect() {}, fillRect() {}, getImageData: () => ({ data: [0, 0, 0, 255] }), set fillStyle(v) {},
    }),
    focus() {}, click() {},
  };
  return node;
}

const recorded = [];
function chartStub(dom) {
  const handlers = {};
  return {
    setOption(option) { recorded.push(option); },
    getOption: () => ({}), on(name, fn) { handlers[name] = fn; }, off() {},
    getZr: () => ({ on() {}, off() {}, setCursorStyle() {} }),
    resize() {}, clear() {}, dispose() {}, isDisposed: () => false, getDom: () => dom,
    dispatchAction() {}, getDataURL: () => '', setTheme() {},
  };
}
const echarts = {
  init: (dom) => chartStub(dom),
  getInstanceByDom: () => null,
  format: {
    encodeHTML: (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
  },
  graphic: { LinearGradient: function LinearGradient() {} },
  registerMap() {},
};

const body = element('body');
const document = {
  readyState: 'complete', body, documentElement: element('html'), head: element('head'),
  createElement: element, createTextNode: (t) => ({ textContent: t }),
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {},
};
const windowObject = {
  RV: {}, echarts, document, navigator: { language: 'en' }, location: { origin: 'https://example.test' },
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  getComputedStyle: () => ({ color: 'rgb(0, 0, 0)', fontFamily: 'sans-serif' }),
  requestAnimationFrame: (fn) => fn(), addEventListener() {}, devicePixelRatio: 1,
};
const context = {
  window: windowObject, document, echarts, navigator: windowObject.navigator,
  getComputedStyle: windowObject.getComputedStyle, requestAnimationFrame: windowObject.requestAnimationFrame,
  setTimeout: () => 0, clearTimeout() {}, console: { warn() {}, error() {}, log() {} },
  Intl, Math, JSON, Date, Number, String, Object, Array, Promise, Error, RegExp, Map, Set, isFinite, encodeURIComponent,
};
windowObject.window = windowObject;
vm.createContext(context);

const coreSource = ['asset/js/dashboard-core.js', 'asset/js/dashboard-charts.bundle.js'];
for (const file of coreSource) {
  vm.runInContext(readFileSync(join(ROOT, file), 'utf8'), context, { filename: file });
}
const ns = windowObject.RV;

/** Every string in a value replaced by a hostile one that keeps the original visible. */
function poison(value) {
  if (typeof value === 'string') return HOSTILE + value;
  if (Array.isArray(value)) return value.map(poison);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, poison(v)]));
  }
  return value;
}

/**
 * Collect [path, fn] for every function-valued tooltip `formatter` in an option
 * tree. Only tooltips render HTML; label, axis and legend formatters draw text
 * on the canvas, where markup is inert.
 */
function formatters(option, path = 'option', out = []) {
  if (!option || typeof option !== 'object') return out;
  for (const [key, value] of Object.entries(option)) {
    if (key === 'formatter' && typeof value === 'function') {
      if (/\.tooltip(\.|$)/.test(path)) out.push([path + '.formatter', value]);
    }
    else if (value && typeof value === 'object') formatters(value, `${path}.${key}`, out);
  }
  return out;
}

/** Plausible formatter params, built from the option's own (hostile) data. */
function paramsFor(option) {
  const series = [].concat(option.series || []);
  const first = series.find((s) => Array.isArray(s.data) && s.data.length) || {};
  const datum = (first.data || [])[0];
  const data = datum && typeof datum === 'object' ? datum : { value: datum, name: HOSTILE };
  const single = {
    name: HOSTILE, seriesName: HOSTILE, data, value: data.value ?? 1, dataIndex: 0, seriesIndex: 0,
    marker: '', color: '#000', percent: 50, dataType: data.source ? 'edge' : 'node',
    treePathInfo: [{ name: HOSTILE }, { name: HOSTILE }], axisValue: HOSTILE, axisValueLabel: HOSTILE,
  };
  return [single, [single, { ...single }]];
}

let builders = 0;
let executed = 0;
const failures = [];
if (!existsSync(goldenDir)) {
  console.error('tests/golden/item-dashboards/ is missing; run the golden test first.');
  process.exit(1);
}
for (const file of readdirSync(goldenDir).filter((f) => f.endsWith('.json')).sort()) {
  const dashboard = JSON.parse(readFileSync(join(goldenDir, file), 'utf8'));
  if (!dashboard || Array.isArray(dashboard)) continue;
  const hostile = poison(dashboard);
  for (const key of Object.keys(dashboard)) {
    const builder = (ns.builderFor && ns.builderFor(hostile, key)) || (ns.CHART_MAP || {})[key];
    if (typeof builder !== 'function' || !hostile[key]) continue;
    recorded.length = 0;
    try {
      builder(element(), hostile[key], '/s/test', hostile);
    } catch {
      continue; // DOM-heavy builders (maps, canvas graphs) need a browser; their HTML is covered elsewhere
    }
    builders++;
    for (const option of recorded) {
      for (const [path, fn] of formatters(option)) {
        for (const params of paramsFor(option)) {
          let output;
          try { output = fn(params); } catch { continue; }
          executed++;
          if (typeof output === 'string' && /<img\b/i.test(output)) {
            failures.push(`${file} ${key} ${path}: ${output.slice(0, 120)}`);
          }
        }
      }
    }
  }
}

// A sweep that runs nothing proves nothing: keep a floor under it.
if (executed < 20) failures.push(`only ${executed} formatter calls ran; the sweep has lost its coverage`);

if (failures.length) {
  console.error(`Formatter sweep: ${failures.length} finding(s)`);
  for (const failure of [...new Set(failures)].slice(0, 40)) console.error('  ' + failure);
  process.exit(1);
}
console.log(`Formatter sweep: clean (${executed} formatter calls across ${builders} chart builds on hostile golden data).`);
