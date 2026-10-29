#!/usr/bin/env node
/**
 * Every class the stylesheet styles must be a class something builds.
 *
 *   node scripts/check-css-dead.mjs        (npm run check:css-dead)
 *
 * A rule for a class nobody writes is invisible: it costs bytes on every page
 * that loads the sheet, it survives every refactor because nothing references
 * it, and it tells the next reader a component exists. `.rv-empty` is the
 * example that prompted this check: the photo map stopped building it when the
 * blocks moved to the shared async states, and the rule stayed for months.
 *
 * A class counts as built when its whole name appears as a token in the
 * module's own sources (asset/js, view, src, config; not the generated bundles,
 * not the vendored libraries, not tests/, whose fixtures copy markup rather than
 * build it). Whole token, not substring: `rv-chart` is not kept alive by
 * `rv-chart-title`. Two kinds of name are allowed without a match, each listed
 * with the reason:
 *   - FOREIGN: classes another library builds, which the sheet restyles;
 *   - COMPOSED: stems the code completes at run time (`'rv-x--' + state`), so
 *     the full name never appears. Adding one is a deliberate act, with the
 *     file that builds it; a blanket "ignore anything with a modifier" would
 *     hide exactly the leftovers this exists to find.
 *
 * Same check as IWAC Visualizations' scripts/check-css-dead.js.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { STYLESHEET, isGeneratedJs } from './lib/frontend-sources.mjs';

const ROOT = join(import.meta.dirname, '..');
const SEARCH_DIRS = ['asset/js', 'view', 'src', 'config'];

/** Class prefixes another library builds. */
const FOREIGN = [
  ['maplibregl-', 'MapLibre GL builds its controls and popups; the sheet themes them'],
];

/** Class stems completed at run time, each with where. */
const COMPOSED = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

/** Each class a selector of the stylesheet names, with its first line. */
function declaredClasses() {
  // Blank out comments, keeping line breaks: a class in a comment is not styled.
  const css = readFileSync(join(ROOT, 'asset', STYLESHEET), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
  // A selector is the text before a `{` since the last `{`, `}` or `;`;
  // declarations end in `;` or `}`, so a class inside a value is never read.
  const found = new Map();
  let line = 1;
  let chunk = '';
  for (const char of css) {
    if (char === '{') {
      for (const match of chunk.matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)) {
        const at = line - (chunk.slice(match.index).match(/\n/g) || []).length;
        if (!found.has(match[1])) found.set(match[1], at);
      }
      chunk = '';
    } else if (char === '}' || char === ';') {
      chunk = '';
    } else {
      chunk += char;
    }
    if (char === '\n') line++;
  }
  return found;
}

/** The module's own sources, as one text. */
function haystack() {
  let text = '';
  for (const dir of SEARCH_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const assetPath = relative(join(ROOT, 'asset'), file).split(sep).join('/');
      if (!/\.(js|phtml|php|json)$/.test(file) || isGeneratedJs(assetPath)) continue;
      if (file.endsWith('.map') || assetPath.startsWith('vendor/')) continue;
      text += readFileSync(file, 'utf8') + '\n';
    }
  }
  return text;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const declared = declaredClasses();
const sources = haystack();
const dead = [];
for (const [name, line] of declared) {
  if ([...FOREIGN, ...COMPOSED].some(([prefix]) => name.startsWith(prefix))) continue;
  if (new RegExp(`(?<![A-Za-z0-9_-])${escape(name)}(?![A-Za-z0-9_-])`).test(sources)) continue;
  dead.push(`.${name}  (asset/${STYLESHEET}:${line})`);
}

if (dead.length) {
  console.error(`Dead CSS: ${dead.length} class(es) styled but never built:`);
  for (const entry of dead) console.error('  ' + entry);
  console.error('Nothing in asset/js, view, src or config writes these names. Delete the rule, or, if'
    + ' the name is composed at run time, add its stem to COMPOSED in scripts/check-css-dead.mjs'
    + ' with the file that builds it.');
  process.exit(1);
}
console.log(`Dead CSS: clean (${declared.size} classes, every one built or listed).`);
