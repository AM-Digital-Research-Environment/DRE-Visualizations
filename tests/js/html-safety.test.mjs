/**
 * The highest-risk custom formatter, run against a stored-XSS fixture: the
 * treemap tooltip prints curated labels along the whole path. The static sink
 * inventory stays in scripts/check-html-safety.mjs; every other tooltip
 * formatter is swept by formatters.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(import.meta.dirname, '..', '..');

test('the treemap tooltip encodes a malicious label', () => {
  let option;
  const encodeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
  const context = {
    echarts: { format: { encodeHTML } },
    window: {
      RV: {
        THEME: { fontSize: 12, border: '#000' },
        charts: {},
        initChart: () => ({ setOption: (value) => { option = value; } }),
        truncateLabel: (value) => value,
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(readFileSync(join(ROOT, 'asset/js/dashboard-charts-treemap.js'), 'utf8'), context, {
    filename: 'asset/js/dashboard-charts-treemap.js',
  });
  context.window.RV.charts.buildTreemap({}, [{ name: 'fixture', value: 1 }]);
  const malicious = '<img src=x onerror="globalThis.__xss=1">';
  const rendered = option.tooltip.formatter({
    treePathInfo: [{ name: malicious }],
    value: 1,
  });
  assert.ok(!rendered.includes('<img') && rendered.includes('&lt;img'), 'the treemap tooltip encodes the malicious label');
});
