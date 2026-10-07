/**
 * Collects every interface string the browser code can show, as key → English:
 *
 *   - each literal `ns.t('key', 'English')` (and the local `t('key', '…')`
 *     wrappers some files define);
 *   - each `ns.plural(n, 'key', 'one', 'other')`, as `keyOne` / `keyOther`;
 *   - the chart registry's titles and descriptions, as `chartLabel.<key>` and
 *     `chartDescription.<key>`.
 *
 * The result is written to config/client-strings.json by `npm run build`.
 * Module::clientTranslations() passes every English string through Omeka's
 * translator, so a translation catalog covers the whole client without a
 * hand-maintained list drifting from the code.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import vm from 'node:vm';
import { isGeneratedJs } from './frontend-sources.mjs';

const STRING = String.raw`'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"`;
const T_CALL = new RegExp(String.raw`(?:\bns\.t|(?<![\w.])t)\(\s*'([\w.]+)'\s*,\s*(${STRING})\s*\)`, 'g');
const PLURAL = new RegExp(String.raw`\bns\.plural\(\s*[^,()]+(?:\([^()]*\))?\s*,\s*'([\w.]+)'\s*,\s*(${STRING})\s*,\s*(${STRING})`, 'g');

/** Evaluate one JavaScript string literal (already matched as such). */
const literal = (source) => vm.runInNewContext(source);

export function collectClientStrings(root) {
  const jsDir = join(root, 'asset', 'js');
  const strings = new Map();
  const conflicts = [];
  const add = (key, english, where) => {
    if (!strings.has(key)) strings.set(key, { english, where });
    else if (strings.get(key).english !== english) {
      conflicts.push(`${key}: "${strings.get(key).english}" (${strings.get(key).where}) vs "${english}" (${where})`);
    }
  };

  // Sources only (asset/js and asset/js/core): a generated bundle repeats them.
  const names = readdirSync(jsDir, { recursive: true }).map((name) => String(name).split(sep).join('/')).sort();
  for (const name of names) {
    if (!name.endsWith('.js') || isGeneratedJs('js/' + name)) continue;
    const source = readFileSync(join(jsDir, name), 'utf8');
    for (const match of source.matchAll(T_CALL)) add(match[1], literal(match[2]), name);
    for (const match of source.matchAll(PLURAL)) {
      add(match[1] + 'One', literal(match[2]), name);
      add(match[1] + 'Other', literal(match[3]), name);
    }
  }

  // The registry maps chart keys to builder functions; any stand-in will do.
  const charts = new Proxy({}, { get: () => () => {} });
  const sandbox = { window: { RV: { charts } } };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(jsDir, 'dashboard-registry.js'), 'utf8'), sandbox);
  const { CHART_LABELS = {}, CHART_DESCRIPTIONS = {} } = sandbox.window.RV;
  for (const [key, english] of Object.entries(CHART_LABELS)) add('chartLabel.' + key, english, 'dashboard-registry.js');
  for (const [key, english] of Object.entries(CHART_DESCRIPTIONS)) {
    if (english) add('chartDescription.' + key, english, 'dashboard-registry.js');
  }

  const sorted = Object.fromEntries([...strings.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { english }]) => [key, english]));
  return { strings: sorted, conflicts };
}
