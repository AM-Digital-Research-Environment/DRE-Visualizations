#!/usr/bin/env node
/**
 * Gettext extractor → language/template.pot
 *
 *   node scripts/extract-translations.mjs           (npm run i18n:extract)
 *   node scripts/extract-translations.mjs --check   (npm run i18n:check)
 *
 * config/module.config.php has always pointed Omeka's translator at language/,
 * but the directory did not exist, so no string this module shows could be
 * translated except by coincidence with Omeka core's catalogue. This writes the
 * template translators start from. Modelled on DRE-theme's extractor of the same
 * name, so the two catalogues have one shape; a Node script because the module
 * is developed without the gettext tools (or PHP) installed.
 *
 * Two sources:
 *   - PHP: $this->translate('X'), $view->translate('X'), $translate('X'),
 *     ->translatePlural('one', 'many', $n), and 'X' // @translate markers, in
 *     Module.php, src/ and view/;
 *   - the browser: every English source string in config/client-strings.json
 *     (generated from the ns.t() calls by `npm run build`). Module.php
 *     translates each through the same translator before it reaches
 *     window.RV_I18N, so they belong in the same catalogue.
 *
 * --check fails (exit 1) when template.pot is out of date instead of
 * rewriting it; `npm run check` runs it.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const OUT_DIR = join(ROOT, 'language');
const OUT = join(OUT_DIR, 'template.pot');
const CHECK = process.argv.includes('--check');

const PLURAL_SEPARATOR = '\u0000';
const entries = new Map();

function record(key, ref) {
  if (!entries.has(key)) entries.set(key, new Set());
  entries.get(key).add(ref);
}

/** Every .php / .phtml file under `dir`, in a stable order. */
function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (/\.(?:phtml|php)$/.test(entry.name)) yield path;
  }
}

/** Unescape a PHP single- or double-quoted literal into its runtime value. */
function phpString(raw, quote) {
  if (quote === "'") return raw.replace(/\\\\/g, '\\').replace(/\\'/g, "'");
  return raw.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

/** Escape a runtime string for a .po msgid. */
function poEscape(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}

const STR = `(?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)")`;
const RE_TRANSLATE = new RegExp(`(?:->|\\$)translate\\s*\\(\\s*${STR}`, 'g');
const RE_PLURAL = new RegExp(`(?:->|\\$)translatePlural\\s*\\(\\s*${STR}\\s*,\\s*${STR}`, 'g');
const RE_MARKER = new RegExp(`${STR}\\s*,?\\s*\\)?;?\\s*//\\s*@translate`, 'g');

const lineOf = (src, index) => src.slice(0, index).split('\n').length;
const pick = (m, a, b) => (m[a] !== undefined ? phpString(m[a], "'") : phpString(m[b], '"'));

const phpFiles = [join(ROOT, 'Module.php'), ...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'view'))];
for (const file of phpFiles) {
  const rel = relative(ROOT, file).split(sep).join('/');
  const src = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  for (const m of src.matchAll(RE_PLURAL)) {
    const single = pick(m, 1, 2);
    const plural = pick(m, 3, 4);
    if (single) record(`${single}${PLURAL_SEPARATOR}${plural}`, `${rel}:${lineOf(src, m.index)}`);
  }
  for (const m of src.matchAll(RE_TRANSLATE)) {
    const s = pick(m, 1, 2);
    if (s) record(s, `${rel}:${lineOf(src, m.index)}`);
  }
  for (const m of src.matchAll(RE_MARKER)) {
    const s = pick(m, 1, 2);
    if (s) record(s, `${rel}:${lineOf(src, m.index)}`);
  }
}

const client = JSON.parse(readFileSync(join(ROOT, 'config', 'client-strings.json'), 'utf8'));
for (const [key, english] of Object.entries(client.strings || {})) {
  if (typeof english === 'string' && english !== '') record(english, `config/client-strings.json:${key}`);
}

// Deterministic order so the POT does not churn between runs.
const sorted = [...entries.keys()].sort((a, b) => a.localeCompare(b, 'en'));

const header = `# DRE Visualizations (Omeka S module)
# Translation template. Regenerate with: npm run i18n:extract
#
# To add a language, copy this file to <locale>.po (e.g. de_DE.po), fill in
# the msgstr values, compile it to <locale>.mo, and place both in language/.
# Strings referenced from config/client-strings.json are shown in the browser;
# Module.php translates them through this catalogue into window.RV_I18N.
#
msgid ""
msgstr ""
"Project-Id-Version: DRE Visualizations\\n"
"Report-Msgid-Bugs-To: https://github.com/AM-Digital-Research-Environment/DRE-Visualizations/issues\\n"
"MIME-Version: 1.0\\n"
"Content-Type: text/plain; charset=UTF-8\\n"
"Content-Transfer-Encoding: 8bit\\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\\n"
`;

let body = '';
for (const key of sorted) {
  body += '\n';
  for (const ref of [...entries.get(key)].sort()) body += `#: ${ref}\n`;
  if (key.includes(PLURAL_SEPARATOR)) {
    const [single, plural] = key.split(PLURAL_SEPARATOR);
    body += `msgid "${poEscape(single)}"\nmsgid_plural "${poEscape(plural)}"\nmsgstr[0] ""\nmsgstr[1] ""\n`;
  } else {
    body += `msgid "${poEscape(key)}"\nmsgstr ""\n`;
  }
}
const pot = header + body;

if (CHECK) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  // A Windows checkout may materialize the file as CRLF; compare LF content.
  if (current.replace(/\r\n/g, '\n') !== pot) {
    console.error('language/template.pot is out of date — run: npm run i18n:extract');
    process.exit(1);
  }
  console.log(`Translations: template.pot up to date (${sorted.length} strings).`);
} else {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, pot, 'utf8');
  console.log(`Translations: wrote language/template.pot (${sorted.length} strings).`);
}
