#!/usr/bin/env node
/**
 * Graph front-end contracts — the invariants a browser would otherwise have to
 * catch. Dependency-free: loads the real `asset/js/*.js` in a `node:vm` sandbox
 * with a minimal DOM, the same trick check-html-safety.mjs uses for the treemap
 * formatter.
 *
 *   node scripts/check-graph-contracts.mjs      (also: npm run check:graph)
 *
 * Two contracts, both regressions that reached the live site once:
 *
 * 1. ENTITY COLOURS ARE STABLE. An entity type must keep one colour everywhere —
 *    the same hue on an item's knowledge graph, on the Entity Network, and on a
 *    contributor network. Colouring by the *index* a category happened to land at
 *    cannot do that: the knowledge graph appends categories in per-item discovery
 *    order, so Person was slot 1 (the project hue) on one item and slot 3 on the
 *    next. Slots 0-2 are inherited from the convention the contributor network
 *    already encoded, so those colours must never move.
 *
 * 2. THE VENDORED d3 LOAD ORDER IS LOAD-BEARING. d3-force's UMD wrapper hands
 *    itself the same `d3` global for all three of its dependencies, so loading it
 *    alone yields a DEFINED but unusable API — a silently dead graph rather than an
 *    error. DashboardAssets::D3_SCRIPTS fixes the order; this proves it matters.
 *
 * Exit code 1 on any finding.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(import.meta.dirname, '..');
const findings = [];
const fail = (m) => findings.push(m);
const check = (cond, m) => { if (!cond) fail(m); };

/* ------------------------------------------------------------------ */
/*  Sandbox                                                            */
/* ------------------------------------------------------------------ */

const noop = () => {};
const stubEl = () => ({
  style: {}, dataset: {}, setAttribute: noop, getAttribute: () => null,
  appendChild: noop, removeChild: noop, replaceChildren: noop, remove: noop,
  addEventListener: noop, parentNode: null, firstChild: null,
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  querySelector: () => null, querySelectorAll: () => [],
  getContext: () => ({
    clearRect: noop, fillRect: noop, fillStyle: '#000',
    getImageData: () => ({ data: [0, 0, 0, 255] }),
  }),
});

function sandbox() {
  const timers = { setTimeout, clearTimeout, setInterval, clearInterval, Date, performance };
  const ctx = {
    console: { warn: noop, error: noop, log: noop },
    window: {
      RV_I18N: {}, RV_LIBS: {}, RV_MAP_CONFIG: {}, devicePixelRatio: 1,
      matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
      addEventListener: noop, getComputedStyle: () => ({ getPropertyValue: () => '' }),
    },
    document: {
      documentElement: { lang: 'en' }, body: stubEl(), head: stubEl(),
      createElement: stubEl, readyState: 'complete', addEventListener: noop,
      querySelector: () => null, querySelectorAll: () => [],
      getElementsByTagName: () => [stubEl()],
    },
    navigator: { language: 'en' },
    IntersectionObserver: class { observe() {} disconnect() {} },
    MutationObserver: class { observe() {} },
    ResizeObserver: class { observe() {} },
    requestAnimationFrame: noop,
    ...timers,
  };
  ctx.window.document = ctx.document;
  ctx.global = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  return ctx;
}

function load(ctx, rel) {
  vm.runInContext(readFileSync(join(ROOT, rel), 'utf8'), ctx, { filename: rel });
}

/* ------------------------------------------------------------------ */
/*  1. Entity colours                                                  */
/* ------------------------------------------------------------------ */

const core = sandbox();
load(core, 'asset/js/dashboard-core.js');
const ns = core.window.RV;

if (!ns || typeof ns.entityColor !== 'function') {
  fail('dashboard-core.js no longer exposes ns.entityColor — every graph would fall back to index colouring');
} else {
  const C = ns.COLORS;

  // The inherited convention. Moving these silently recolours three graphs.
  check(ns.entityColor('person') === C[0], 'person must stay COLORS[0] (contributor-network convention)');
  check(ns.entityColor('project') === C[1], 'project must stay COLORS[1]');
  check(ns.entityColor('institution') === C[2], 'institution must stay COLORS[2]');

  // The reported bug: distinct types must never share a hue.
  const distinct = ['person', 'project', 'institution', 'subject', 'location',
    'genre', 'language', 'contributor', 'item', 'related item', 'shared item', 'section'];
  const slots = distinct.map((n) => ns.entityColorIndex(n));
  if (new Set(slots).size !== distinct.length) {
    fail(`entity types collide on a palette slot: ${distinct.map((n, i) => n + '=' + slots[i]).join(', ')}`);
  }
  for (const s of slots) {
    if (!(s >= 0 && s < C.length)) fail(`entity slot ${s} is outside the ${C.length}-hue palette`);
  }

  // Index independence — two items that discover categories in a different order
  // must still agree. This is the exact defect that shipped.
  const itemA = ['Still Image', 'Person', 'Subject', 'Project'];
  const itemB = ['Project', 'Subject', 'Person'];
  check(ns.entityColor(itemA[1]) === ns.entityColor(itemB[2]),
    'Person must be one colour regardless of the order categories were discovered in');
  check(ns.entityColor(itemA[3]) === ns.entityColor(itemB[0]), 'Project likewise');
  check(ns.entityColor('Person') !== ns.entityColor('Project'), 'Person and Project must differ');
  check(ns.entityColor('Project') !== ns.entityColor('Research Item'),
    'Project and Research Item must differ');

  // Aliases the different graphs actually emit.
  check(ns.entityColor('Organization') === ns.entityColor('Institution'),
    'the Entity Network\'s "Organization" must match "Institution" elsewhere');
  check(ns.entityColor('Tag') === ns.entityColor('Subject'),
    'Tag must fold onto Subject (the data model has no separate tag facet)');
  check(ns.entityColor('PERSON') === ns.entityColor(' person '),
    'the lookup must be case- and whitespace-insensitive');

  // An unlisted label (a resource-class name on a centre node) must be stable.
  check(ns.entityColor('Moving Image') === ns.entityColor('Text'),
    'unrecognised labels must share one deterministic fallback slot');

  // No shipped graph may colour an entity-type axis by bare index again.
  for (const f of ['asset/js/knowledge-graph.js', 'asset/js/entity-graph.js',
    'asset/js/dashboard-charts-contributor-network.js']) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    if (!src.includes('entityColor')) {
      fail(`${f} colours an entity-type axis but does not use ns.entityColor`);
    }
  }

  // Merely IMPORTING the registry is not enough: the Entity Network resolved its
  // legend, chips and sidebar swatches through it while still painting the map
  // circles by their position in `types`, so Organization, Location and Tag had a
  // swatch in one hue and dots in another. The paint expression has to go through
  // the same helper the swatches do.
  const eg = readFileSync(join(ROOT, 'asset/js/entity-graph.js'), 'utf8');
  if (!/expr\.push\(i,\s*typeColor\(i\)\)/.test(eg)) {
    fail('entity-graph.js must build its type paint expression from typeColor(i), '
      + 'so the map circles match the legend swatches beside them');
  }
}

/* ------------------------------------------------------------------ */
/*  2. The d3 load order                                               */
/* ------------------------------------------------------------------ */

const D3_ORDER = ['d3-quadtree', 'd3-dispatch', 'd3-timer', 'd3-force'];

// The helper's declared order must match what actually works.
const helper = readFileSync(join(ROOT, 'src/View/Helper/DashboardAssets.php'), 'utf8');
const block = helper.slice(helper.indexOf('const D3_SCRIPTS = ['));
const declared = [...block.slice(0, block.indexOf(']')).matchAll(/'vendor\/([^.']+)\.min\.js'/g)]
  .map((m) => m[1]);
if (declared.join(',') !== D3_ORDER.join(',')) {
  fail(`DashboardAssets::D3_SCRIPTS order is ${declared.join(',')}; d3-force needs ${D3_ORDER.join(',')}`);
}

// In order: a usable simulation.
const good = sandbox();
for (const name of D3_ORDER) load(good, `asset/vendor/${name}.min.js`);
let usable = false;
try {
  const sim = good.d3.forceSimulation([{ id: 'a' }, { id: 'b' }])
    .force('charge', good.d3.forceManyBody())
    .force('collide', good.d3.forceCollide().radius(5))
    .stop();
  sim.tick();
  usable = Number.isFinite(sim.nodes()[0].x);
} catch (e) {
  fail(`the vendored d3 stack does not simulate in its declared order: ${e.message}`);
}
check(usable, 'the vendored d3 stack must produce finite coordinates after a tick');

// d3-force alone: must NOT quietly appear to work.
const lone = sandbox();
load(lone, 'asset/vendor/d3-force.min.js');
let loneWorked = false;
try {
  const s = lone.d3.forceSimulation([{ id: 'a' }, { id: 'b' }])
    .force('charge', lone.d3.forceManyBody()).stop();
  s.tick();
  loneWorked = true;
} catch { /* expected */ }
check(!loneWorked,
  'd3-force loaded without its dependencies appeared to work — the load-order contract is no longer meaningful');

/* ------------------------------------------------------------------ */

if (findings.length) {
  console.error(`Graph contracts: ${findings.length} finding(s)`);
  for (const m of findings) console.error('  ' + m);
  process.exit(1);
}
console.log('Graph contracts: clean (entity colours stable, d3 load order verified).');
