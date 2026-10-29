#!/usr/bin/env node
/**
 * Lighthouse budgets for the block fixtures — `npm run check:lighthouse`.
 *
 *     node scripts/check-lighthouse.mjs              # measure, compare, fail on a breach
 *     node scripts/check-lighthouse.mjs --update     # measure, then rewrite the baseline
 *     node scripts/check-lighthouse.mjs --only=network-explorer,publications --runs=5
 *
 * Ported from IWAC Visualizations' scripts/check-lighthouse.js. Every fixture
 * that renders the precompute's golden output (FIXTURE_DATA in
 * tests/browser/fixtures.mjs — each loads exactly its asset plan) is loaded by
 * Lighthouse (mobile, simulated slow 4G — its defaults) through the Chromium
 * @playwright/test pins, RUNS times, from tests/browser/server.mjs with
 * FIXTURE_DATA=golden, which serves text gzipped as the live site does. The
 * median of those runs is held against tests/lighthouse/baseline.json:
 *
 *   - transfer bytes of script, stylesheet, image and font, and the request
 *     count: no more than BYTES_HEADROOM over the baseline. Deterministic —
 *     every run must load the same bytes, or the page is reported unstable;
 *   - the accessibility and best-practices scores: no lower than the
 *     baseline. They repeat run to run on one host, not across hosts (fonts
 *     size the text the audits measure);
 *   - the performance score: no lower than the baseline minus
 *     PERFORMANCE_MARGIN. Timed on the host's CPU, so its baseline must come
 *     from the CI runner.
 *
 * SEO is not measured: a fixture's <head> is the harness's; the theme and
 * DRE SEO own it on the live site.
 *
 * The baseline retires its own slack: a page that got BYTES_STALE lighter, or
 * whose accessibility or best-practices score rose, fails until the baseline is
 * rewritten, so an improvement is locked in rather than left as headroom.
 *
 * Re-baselining: every run writes what it measured to
 * test-results/lighthouse/baseline.json (the CI job's artifact), beside one HTML
 * report per page. `--update` copies it over the committed file — except outside
 * CI, where committed scores are kept and only bytes and requests are rewritten
 * (a page with no committed score takes this machine's, and says so). To move a
 * score, take baseline.json from a CI run.
 */
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { join, relative } from 'node:path';
import { chromium } from '@playwright/test';
import { FIXTURE_DATA } from '../tests/browser/fixtures.mjs';

const ROOT = join(import.meta.dirname, '..');
const BASELINE = join(ROOT, 'tests', 'lighthouse', 'baseline.json');
const OUT = join(ROOT, 'test-results', 'lighthouse');

/** The block fixtures that render real (golden) data. */
const PAGES = Object.keys(FIXTURE_DATA).filter((name) => FIXTURE_DATA[name] === 'golden');

const CATEGORIES = ['performance', 'accessibility', 'best-practices'];
const BYTE_TYPES = ['script', 'stylesheet', 'image', 'font'];

/** Bytes and requests may grow by this factor before the gate fails. */
const BYTES_HEADROOM = 1.10;
/** A page this much lighter than its baseline fails until it is re-baselined. */
const BYTES_STALE = 0.80;
/** How far a page's median performance score may sit below its baseline (IWAC measured five times the worst CI drop). */
const PERFORMANCE_MARGIN = 0.05;

function printFailure(title, lines = [], footer = '') {
  console.error(`✗ ${title}\n`);
  for (const line of lines) console.error(`  ${line}`);
  if (footer) console.error(footer);
}

function parseArgs(argv) {
  const args = { update: false, runs: 3, only: null };
  for (const arg of argv) {
    if (arg === '--update') args.update = true;
    else if (arg.startsWith('--runs=')) args.runs = Number(arg.slice(7));
    else if (arg.startsWith('--only=')) args.only = arg.slice(7).split(',').filter(Boolean);
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!Number.isInteger(args.runs) || args.runs < 1) throw new Error('--runs must be a positive integer');
  const unknown = (args.only || []).filter((page) => !PAGES.includes(page));
  if (unknown.length) throw new Error(`not a golden fixture: ${unknown.join(', ')}`);
  return args;
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolvePort(port));
    });
  });
}

/** Start the fixture server, serving golden data, on a free port. */
async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, [join(ROOT, 'tests', 'browser', 'server.mjs')], {
    env: { ...process.env, PORT: String(port), FIXTURE_DATA: 'golden' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((ready, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`fixture server exited (${code})`)));
    child.stdout.once('data', ready);
  });
  return { origin: `http://127.0.0.1:${port}`, stop: () => child.kill() };
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** The figures the gate reads from one Lighthouse result. */
function measure(lhr) {
  const bytes = Object.fromEntries(BYTE_TYPES.map((type) => [type, 0]));
  const broken = [];
  let requests = 0;
  for (const request of lhr.audits['network-requests'].details.items) {
    if (!/^https?:/.test(request.url)) continue;
    requests++;
    if (request.statusCode >= 400) broken.push(`${request.statusCode} ${request.url}`);
    const type = String(request.resourceType || '').toLowerCase();
    if (type in bytes) bytes[type] += request.transferSize || 0;
  }
  const scores = Object.fromEntries(CATEGORIES.map((id) => [id, lhr.categories[id].score]));
  return { ...scores, ...bytes, requests, broken };
}

async function runPage(lighthouse, origin, page, runs) {
  const url = `${origin}/fixture/${page}`;
  const results = [];
  for (let i = 0; i < runs; i++) {
    const port = await freePort();
    const browser = await chromium.launch({
      channel: 'chromium',
      // WebGL for MapLibre in headless Chromium, as in playwright.config.mjs.
      args: [`--remote-debugging-port=${port}`, '--enable-unsafe-swiftshader'],
    });
    try {
      const result = await lighthouse(url, { port, output: 'html', logLevel: 'error', onlyCategories: CATEGORIES });
      if (result.lhr.runtimeError) throw new Error(`${page}: ${result.lhr.runtimeError.message}`);
      results.push({ lhr: result.lhr, html: result.report, figures: measure(result.lhr) });
    } finally {
      await browser.close();
    }
  }
  return results;
}

/** Collapse a page's runs to one row; report anything that should not vary. */
function summarise(page, results, problems) {
  const first = results[0].figures;
  for (const key of [...BYTE_TYPES, 'requests']) {
    const seen = [...new Set(results.map((r) => r.figures[key]))];
    if (seen.length > 1) problems.push(`${page}: ${key} differs between runs (${seen.join(', ')}) — the page does not load the same thing twice`);
  }
  for (const line of new Set(results.flatMap((r) => r.figures.broken))) problems.push(`${page}: ${line}`);
  const row = {};
  for (const id of CATEGORIES) {
    const values = results.map((r) => r.figures[id]);
    if (values.some((v) => typeof v !== 'number')) {
      problems.push(`${page}: no ${id} score in at least one run`);
      row[id] = null;
    } else {
      row[id] = Math.round(median(values) * 100) / 100;
    }
  }
  for (const key of [...BYTE_TYPES, 'requests']) row[key] = first[key];
  const perf = results.map((r) => r.figures.performance);
  const kept = results[perf.indexOf([...perf].sort((a, b) => a - b)[Math.floor(perf.length / 2)])];
  return {
    row,
    runs: perf,
    benchmarkIndex: results.map((r) => r.lhr.environment.benchmarkIndex),
    html: kept.html,
    meta: { lighthouse: kept.lhr.lighthouseVersion, userAgent: kept.lhr.environment.hostUserAgent },
  };
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const limitOf = (base) => Math.ceil(base * BYTES_HEADROOM);

/** Compare a measured row with its baseline; returns the cells to print. */
function compare(page, row, base, problems) {
  const cells = [];
  for (const id of CATEGORIES) {
    if (row[id] === null) { cells.push(`${id} —`); continue; }
    const floor = id === 'performance' ? Math.round((base[id] - PERFORMANCE_MARGIN) * 100) / 100 : base[id];
    cells.push(`${id} ${row[id].toFixed(2)} (≥ ${floor.toFixed(2)})`);
    if (row[id] < floor) problems.push(`${page}: ${id} ${row[id].toFixed(2)} is below its floor of ${floor.toFixed(2)} (baseline ${base[id].toFixed(2)})`);
    else if (id !== 'performance' && row[id] > base[id]) problems.push(`${page}: ${id} rose to ${row[id].toFixed(2)} from ${base[id].toFixed(2)} — lock it in with --update`);
  }
  for (const key of [...BYTE_TYPES, 'requests']) {
    const show = key === 'requests' ? String : kb;
    const limit = limitOf(base[key]);
    if (row[key] || base[key]) cells.push(`${key} ${show(row[key])} (≤ ${show(limit)})`);
    if (row[key] > limit) problems.push(`${page}: ${key} ${show(row[key])} is over its budget of ${show(limit)} (baseline ${show(base[key])})`);
    else if (row[key] < base[key] * BYTES_STALE) problems.push(`${page}: ${key} fell to ${show(row[key])} from ${show(base[key])} — lock it in with --update`);
  }
  return cells;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pages = args.only || PAGES;
  const committed = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { pages: {} };
  const { default: lighthouse } = await import('lighthouse');
  mkdirSync(OUT, { recursive: true });

  const server = await startServer();
  const problems = [];
  const measured = {};
  const details = {};
  try {
    for (const page of pages) {
      const started = Date.now();
      const summary = summarise(page, await runPage(lighthouse, server.origin, page, args.runs), problems);
      writeFileSync(join(OUT, `${page}.html`), summary.html);
      measured[page] = summary.row;
      details[page] = { performanceRuns: summary.runs, benchmarkIndex: summary.benchmarkIndex, ...summary.meta };
      console.log(`  measured ${page} in ${((Date.now() - started) / 1000).toFixed(0)} s — performance runs ${summary.runs.join(', ')}`);
    }
  } finally {
    server.stop();
  }

  const meta = Object.values(details)[0];
  const candidate = {
    _: 'Written by `npm run check:lighthouse -- --update` (scripts/check-lighthouse.mjs), never by hand.',
    lighthouse: meta.lighthouse,
    userAgent: meta.userAgent,
    runs: args.runs,
    pages: { ...committed.pages, ...measured },
  };
  writeFileSync(join(OUT, 'baseline.json'), `${JSON.stringify(candidate, null, 2)}\n`);
  writeFileSync(join(OUT, 'details.json'), `${JSON.stringify(details, null, 2)}\n`);

  if (args.update) {
    if (problems.length) {
      printFailure(`lighthouse: not re-baselining over ${problems.length} problem(s)`, problems);
      return 1;
    }
    if (!process.env.CI) {
      for (const page of pages) {
        for (const id of CATEGORIES) {
          const kept = committed.pages[page]?.[id];
          if (typeof kept === 'number') candidate.pages[page][id] = kept;
          else console.warn(`  ! ${page}: no committed ${id} baseline; wrote this machine's ${measured[page][id]} — replace it with the CI run's`);
        }
      }
    }
    mkdirSync(join(ROOT, 'tests', 'lighthouse'), { recursive: true });
    writeFileSync(BASELINE, `${JSON.stringify(candidate, null, 2)}\n`);
    console.log(`✓ lighthouse: wrote ${relative(ROOT, BASELINE)} for ${pages.length} page(s)${process.env.CI ? '' : ' (scores kept from the committed baseline)'}`);
    return 0;
  }

  const lines = [];
  for (const page of pages) {
    const base = committed.pages[page];
    if (!base) { problems.push(`${page}: no baseline — run with --update`); continue; }
    lines.push(`${page.padEnd(24)} ${compare(page, measured[page], base, problems).join('  ')}`);
  }
  if (!args.only) {
    for (const page of Object.keys(committed.pages)) {
      if (!PAGES.includes(page)) problems.push(`${page}: has a baseline but is not a golden fixture — run with --update`);
    }
  }
  console.log(`\n${lines.join('\n')}\n`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const head = ['page', ...CATEGORIES, ...BYTE_TYPES, 'requests'];
    const table = [
      `| ${head.join(' | ')} |`,
      `|${head.map(() => ' --- ').join('|')}|`,
      ...pages.map((page) => `| ${page} | ${CATEGORIES.map((id) => measured[page][id]).join(' | ')} | ${BYTE_TYPES.map((t) => kb(measured[page][t])).join(' | ')} | ${measured[page].requests} |`),
    ];
    const verdict = problems.length ? `**${problems.length} budget problem(s):**\n\n${problems.map((p) => `- ${p}`).join('\n')}` : 'Every page within budget.';
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Lighthouse (median of ${args.runs})\n\n${table.join('\n')}\n\n${verdict}\n`);
  }

  if (problems.length) {
    printFailure(`lighthouse: ${problems.length} budget problem(s) over ${pages.length} page(s)`, problems,
      `\nReports: ${relative(ROOT, OUT)}/<page>.html. A deliberate change re-baselines with --update;\nscores come from the CI run's baseline.json artifact.\n`);
    return 1;
  }
  console.log(`✓ lighthouse: ${pages.length} page(s) within budget (median of ${args.runs} runs)`);
  return 0;
}

main().then((code) => process.exit(code), (error) => {
  console.error(`✗ lighthouse: ${error.stack || error}`);
  process.exit(1);
});
