/**
 * The Gantt chart reads its calendar-day dates ("2021-01-01", UTC midnight) in
 * UTC, whatever the visitor's time zone. West of Greenwich that midnight is
 * still the previous day locally, and the chart used to say "Dec 2020" on an
 * axis starting in 2020.
 *
 * Node's own zone cannot be changed portably (TZ is ignored on Windows), so the
 * builder runs in a VM whose Date and Intl behave as in São Paulo (UTC−3): local
 * getters and local constructors run three hours behind UTC, and a formatter
 * with no explicit timeZone formats in America/Sao_Paulo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(import.meta.dirname, '..', '..');
const OFFSET = 3 * 3600e3;

class WestDate extends Date {
  constructor(...args) {
    // new Date(y, m, d…) is local time: three hours after the same UTC wall time.
    if (args.length >= 2) super(Date.UTC(...args) + OFFSET);
    else if (args.length === 1) super(args[0]);
    else super();
  }
  local() { return new Date(this.getTime() - OFFSET); }
  getFullYear() { return this.local().getUTCFullYear(); }
  getMonth() { return this.local().getUTCMonth(); }
  getDate() { return this.local().getUTCDate(); }
}
const WestIntl = Object.create(Intl, {
  DateTimeFormat: {
    value: function DateTimeFormat(locale, options) {
      return new Intl.DateTimeFormat(locale, { timeZone: 'America/Sao_Paulo', ...options });
    },
  },
});

function element() {
  return {
    style: {}, dataset: {}, attributes: {}, children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k] ?? null; },
    hasAttribute(k) { return k in this.attributes; },
    removeAttribute(k) { delete this.attributes[k]; },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null,
  };
}

const options = [];
const echarts = {
  init: () => ({
    setOption(option) { options.push(option); }, on() {}, off() {}, isDisposed: () => false,
    getZr: () => ({ on() {}, off() {} }), resize() {}, dispose() {},
  }),
  getInstanceByDom: () => null,
  format: { encodeHTML: (v) => String(v) },
};
const document = {
  readyState: 'complete', body: element(), documentElement: element(), head: element(),
  createElement: element, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {},
};
const windowObject = {
  RV: {}, echarts, document, navigator: { language: 'en' }, location: { origin: 'https://example.test' },
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  getComputedStyle: () => ({ color: 'rgb(0, 0, 0)', fontFamily: 'sans-serif', getPropertyValue: () => '' }),
  requestAnimationFrame: (fn) => fn(), addEventListener() {},
};
windowObject.window = windowObject;
const context = vm.createContext({
  window: windowObject, document, echarts, navigator: windowObject.navigator,
  getComputedStyle: windowObject.getComputedStyle, requestAnimationFrame: windowObject.requestAnimationFrame,
  setTimeout: () => 0, clearTimeout() {}, console: { warn() {}, error() {}, log() {} },
  Intl: WestIntl, Date: WestDate, Math, JSON, Number, String, Object, Array, Promise, Error, RegExp, Map, Set,
  isFinite, encodeURIComponent,
});
for (const file of ['asset/js/dashboard-core.js', 'asset/js/dashboard-charts-gantt.js']) {
  vm.runInContext(readFileSync(join(ROOT, file), 'utf8'), context, { filename: file });
}

test('the stand-in zone really is west of UTC', () => {
  assert.equal(new WestDate('2021-01-01').getFullYear(), 2020);
});

test('Gantt dates read the same in São Paulo as in Bayreuth', () => {
  options.length = 0;
  windowObject.RV.charts.buildGantt(element(), [
    { name: 'Kinship Across Borders', start: '2021-01-01', end: '2025-12-31', itemId: 303 },
  ], '/s/test');
  const option = options.find((o) => o.xAxis);
  assert.ok(option, 'the builder set its option');
  assert.equal(option.useUTC, true, 'the time axis labels its ticks in UTC');
  assert.equal(option.xAxis.min, Date.UTC(2021, 0, 1), 'the axis starts in the first project year');
  assert.equal(option.xAxis.max, Date.UTC(2026, 0, 1), 'and ends after the last one');
  const bar = option.series[0].data[0];
  assert.equal(option.tooltip.formatter({ name: bar.name, value: bar.value }),
    '<strong>Kinship Across Borders</strong><br/>Jan 2021 → Dec 2025');
});
