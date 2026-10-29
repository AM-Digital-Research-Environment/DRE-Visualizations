# Contributing — adding & extending visualizations

How to add a chart, a cross-cutting block, or a stat card to this module without
breaking its conventions. These are the load-bearing patterns that keep the code
modular, maintainable, and theme-consistent; they were proven out over the
visualization-parity initiative with the sibling
[amira dashboard](https://github.com/AM-Digital-Research-Environment/amira).

The module ships plain PHP, CSS and vanilla JavaScript. `npm run build` concatenates the modular sources into two committed bundles, then minifies both and the stylesheet into the `.min.js` / `.min.css` files Omeka serves, each with a source map pointing back at the readable file. ECharts 6, MapLibre 6 and d3-force 3 are vendored under `asset/vendor`; esbuild (the minifier) and Playwright are development dependencies only. Record any changed vendored dependency in `asset/vendor/versions.json` (version, source file in the npm tarball, SHA-256) and in `THIRD_PARTY_NOTICES`; `npm run check:vendor` holds the two together, and `node scripts/check-vendor.mjs --latest --verify` compares the pins with npm and the bytes with the tarballs.

Three renderers, and the choice between them is not a matter of taste: ECharts for
charts, MapLibre for maps, and the module's own canvas + d3-force for a graph the
reader is meant to rearrange (`graph-canvas.js` + `graph-force.js` — both generic,
neither knows about Omeka). Reach for the last one only when direct manipulation is
the point; a static network is cheaper as an ECharts series.

## Before you commit

```bash
npm ci
npm run build
npm run check
npx playwright install chromium
npm run test:browser
OMEKA_CORE=/path/to/omeka-s npm run test:php   # PHP 8.5 in Docker; add -- --php 8.4
OMEKA_CORE=/path/to/omeka-s npm run phpstan
python -m unittest discover -s tools/embeddings/tests -v
```

`npm run test:php` needs only Docker: it lints every PHP file and runs the
harnesses, the module contract and every integration suite (including the
golden output) against the Omeka S core in `OMEKA_CORE`. Without `OMEKA_CORE`
it runs the dependency-free harnesses only. With a local PHP the same commands
are listed in `.github/workflows/ci.yml`.

The PHP harnesses fail on any warning, notice or deprecation the module raises
(`tests/lib/strict-errors.php`). The aggregators are dependency-free and
unit-tested — add a mock-data case for every new builder.

**Omeka boot.** `tests/integration/OmekaBootTest.php` is the one suite that
needs a database server, so it runs in CI only (job `omeka-boot`, on the MySQL
image production runs). It unpacks the release archive into Omeka S, lets
Omeka's ModuleManager install, upgrade and uninstall the module, resolves every
route through the real `ModuleRouteListener`, runs one regeneration job and
renders every block layout. A new block layout is covered as soon as it is
registered; a new route belongs in its route list.

**Golden output.** `tests/integration/GoldenTest.php` runs the whole precompute
on a fixed synthetic corpus (`tests/integration/fixtures/GoldenCorpus.php`) and
compares every artifact with `tests/golden/`. A change that alters generated
JSON fails it; when the change is intended, regenerate with `UPDATE_GOLDEN=1`
(e.g. `docker run … -e UPDATE_GOLDEN=1 php:8.5-cli php
tests/integration/GoldenTest.php /omeka-s`) and review the diff in the commit.

**Artifact schema.** If a change alters the shape of an artifact the browser
reads — a renamed or re-typed key, a new required key, a different id scheme —
bump `SnapshotPublisher::SCHEMA_VERSION`. Older snapshots then stop being
served after the upgrade until an administrator regenerates; otherwise the
published snapshot keeps being served across module upgrades.

**Interface strings.** Write every visible string as `ns.t('key', 'English')`
(`ns.plural` for counts, `ns.fill` for placeholders). `npm run build` collects
them into `config/client-strings.json`, which PHP translates; a key used with
two different English texts fails the build.

Whenever you touch a class that extends an Omeka base — `Module.php`, a block
layout, a controller, a job — remember that `php -l` cannot see a bad override:
PHP compares a signature against its parent only when the class is *declared*, so
a wrong hook signature lints clean and then fatals every admin page that loads it.
CI catches this by declaring every module class against a real Omeka S core
(`module-contract`); run it locally against any Omeka checkout with
`php scripts/check-module-contract.php /path/to/omeka-s`.

## The precompute → registry → builder pattern

Every per-entity chart lands as the same change across the PHP precompute and the
JS front-end. The orchestrator (`asset/js/dashboard.js`) reads
`LAYOUTS[data.resourceType]`, **auto-hides any key whose data is empty/null**, and
calls `CHART_MAP[key](el, data[key], siteBase, data)` — the 4th argument is the
whole dashboard object, which is how data-driven overlays work (see `geoFlows`).

### Recipe A — add a per-entity chart

| Step | File | Change |
|---|---|---|
| 1 | `src/Precompute/Aggregators.php` | `public function buildX(array $itemIds, array $links, array $items, …): ?array` → array or **`null`** when empty. |
| 2 | `src/Precompute/*DashboardGenerator.php` | Call it in the right generator (`addStandardCharts()` / `generatePeople()` / an overview generator); `$dashboard['x'] = $this->aggregators->buildX(...)`. |
| 3 | `asset/js/dashboard-charts-x.js` | New IIFE builder registering `window.RV.charts.buildX = function (el, data, siteBase, allData) { … }`. |
| 4 | `asset/js/dashboard-registry.js` | `CHART_MAP['x'] = c.buildX;` + `CHART_LABELS` + (optionally) `CHART_DESCRIPTIONS`. |
| 5 | `asset/js/dashboard-layouts.js` | Add `'x'` to the chosen layouts' `order` (and `wide`/`tall`). |
| 6 | `config/asset-plans.json` | Add `js/dashboard-charts-x.js` to `chartSources` (before `dashboard-registry.js`), then run `npm run build`; CI rejects a stale generated bundle. |
| 7 | `tests/AggregatorsTest.php` | Mock-data case for `buildX`. |
| 8 | Admin → Regenerate now | Rebuild JSON in-Omeka (pure PHP). |

### Recipe B — add a cross-cutting site-page block

Archive-wide views are **site-page block layouts**, not resource-page blocks;
they attach to site pages (Admin → Sites → [site] → Pages). A block is declared
once, in `src/Site/BlockRegistry.php`, under its **slug**, which is also its
template name, its embed route segment and the `data-embed-slug` it stamps.
(`RESOURCE_BLOCKS` in the same file holds the blocks bound to one item or item
set: Knowledge Graph, Item Set Dashboard, Visualisations, Sibling-items
Sparkline, Similar Items.) `tests/BlockRegistryTest.php` fails when the registry,
the config invokables, the classes, the templates and the plans disagree.

| Step | File | Change |
|---|---|---|
| 1 | `src/Site/BlockRegistry.php` | A `BLOCKS` row: `invokable` (`dreXxx`), `class`, `label` and `description` (each `// @translate`), `plan`, and `embed` — `null`, or `label` + `kind`: `'dashboard'` with `itemId`/`layout` when `dashboard.js` renders it from a chart-key layout (single-chart embeds then come free), else `'widget'`. Embeddable blocks are zero-configuration: the embed route has no `$block`. |
| 2 | `src/Site/BlockLayout/Xxx.php` | `class Xxx extends AbstractDreBlockLayout { const SLUG = 'xxx'; }` — label, admin text and template come from the row. Only a block with settings overrides `form()` (row `description` null) and `render()`. |
| 3 | `config/module.config.php` | The same `'dreXxx' => Site\BlockLayout\Xxx::class` under `block_layouts.invokables` (literal: module config is read before the registry can load). |
| 4 | `view/common/block-layout/xxx.phtml` | Call `$this->dashboardAssets(['plan' => $plan])` and stamp `'embed-slug' => $slug` through `partials/async-surface` (the dashboard blocks pass `$slug` and `$plan` to `partials/dashboard-async.phtml`). Never a literal slug or a hand-written script tag. |
| 5 | `config/asset-plans.json` + `asset/js/dashboard-xxx.js` | A plan for the block (stylesheet, the library URLs it publishes, its scripts in load order — groups such as `@core`, `@chartBundle`), ending with the controller IIFE that fetches its JSON and renders via `CHART_MAP`. |
| 6 | *(if data-driven)* `src/Precompute/{Aggregators,Runner}.php` | New aggregator emitting an index/feed JSON inside the generation staging directory. |
| 7 | README | Document adding the block (Admin → Sites → [site] → Pages). |

### Recipe C — add stat cards to a dashboard

Stat cards (icon + value + label + optional subtitle) are a reusable component.
Any dashboard that emits a `stats` array gets a card grid at the top — no template
or controller change.

| Step | File | Change |
|---|---|---|
| 1 | `src/Precompute/Runner.php` | In the generator, compute the counts and `$dashboard['stats'] = Aggregators::buildStatCards([['key'=>…,'label'=>…,'value'=>…,'subtitle'=>…?], …]);`. The assembler casts values, drops non-positive cards and clears empty subtitles. |
| 2 | `asset/js/dashboard-stat-cards.js` | *(only if a card needs a new glyph)* add the lucide path to `ICONS` under its `key`, or map a synonym in `ALIAS`. Unknown keys fall back to a generic icon. |
| 3 | `tests/AggregatorsTest.php` | Cover any non-trivial counting you added. (`buildStatCards` itself is already tested.) |
| 4 | Admin → Regenerate now | Rebuild JSON in-Omeka. |

The renderer (`ns.renderStatCards`, wired into `dashboard.js`) is shared, so the
grid is consistent everywhere and follows the DRE light/dark theme. The Collection
Overview is the first consumer (`Runner::buildOverviewStats`).

> **Note on linked vs. literal values.** A property is either a literal string or a
> link to another item — and the two live in different precompute maps
> (`$this->literals` vs. `$this->links`). Read the actual data before counting:
> `bibo:status`, for instance, *looks* like a literal ("Peer reviewed") but the
> sync stores it as a link to an authority item, so it must be counted through the
> links map (`Aggregators::countItemsLinkedTo`), not the literal loader.

## Guardrails & invariants

- **Empty = hidden.** Aggregators return `null` and the orchestrator silently
  drops empty panels — so adding a key to a layout is safe even if only some
  entities populate it.
- **Overlays over panels.** When a new signal belongs on an existing chart, write
  it as an extra key the existing builder reads from its 4th `data` argument (the
  `geoFlows`-on-`locations` pattern) rather than a new panel.
- **Reuse `window.RV`** (`THEME`, `COLORS`, `initChart`, `initMap`, `truncateLabel`,
  `toEntries`, `escapeHtml`, `formatNumber`, `el`, `addClickHandler`,
  `attachToolbar`, `trackMap`, `getBasemapStyle`, `cssColor`, `itemUrl`, `plural`,
  `fill`, `fold`, `mountWhenVisible`, `buildChart`, `createMap`). No new globals.
  These live in `asset/js/core/`; `asset/js/dashboard-core.js` is generated from
  them by `npm run build` (order: `scripts/lib/frontend-sources.mjs`) — edit the
  sources, never the generated file.
- **Theme: read DRE tokens, never hard-code a colour.** The module styles itself
  entirely from the [DRE theme](https://github.com/AM-Digital-Research-Environment/DRE-theme)
  design tokens and follows light/dark automatically:
  - In **JS**, resolve every colour through `ns.cssColor('--token', fallback)`. The
    categorical palette `ns.COLORS` is the only sanctioned theme-independent set
    (compare-mode needs a stable colour-by-index map); brand identity is carried by
    `THEME.accent` (= `--primary`).
  - **ECharts**: create instances with `ns.initChart(el)`. For graph/structural
    charts whose per-node/edge colours must re-resolve on toggle, set
    `chart._rvRebuild`.
  - **MapLibre**: bootstrap with `ns.initMap(el, opts)`, register every map with
    `ns.trackMap(map, rebuild)`, and pick the basemap with `ns.getBasemapStyle()`;
    maps are *rebuilt* on theme toggle.
  - In **CSS**, use the `--rv-*` aliases at the top of
    `asset/css/dre-visualizations.css`. Never introduce a raw hex. (See the
    README's *Theming* section for the full alias → token table.) Edit that
    file and run `npm run build`; never edit the generated `.min.css`.
    `npm run check` runs stylelint over it (`no-duplicate-selectors`,
    `declaration-no-important`: an exemption carries its reason in a
    `stylelint-disable` comment) and `check:css-dead`, which fails on a class
    the stylesheet styles but nothing in `asset/js`, `view`, `src` or `config`
    builds.

## Data architecture

Visualizations read generated JSON from a **private snapshot store**, never from
the module's public `asset/` tree. `SnapshotStore` keeps it in
`DRE_VISUALIZATIONS_DATA_DIR`, a directory outside the Omeka document root (see
[Administration](docs/ADMINISTRATION.md)). The browser fetches each artifact
through the module's data route (`Controller\Site\DataController`, read with
`ns.fetchDataJson`), which serves only the current published snapshot of the
canonical site. A block whose artifact is not published renders nothing; there
is no live REST-API fallback.

The snapshot is rebuilt inside Omeka — **Admin → DRE Visualizations →
Regenerate now**, or by itself once API edits have been quiet for five minutes —
by a pure-PHP engine under `src/Precompute/` (`DataLoader` → `PublicCorpus` →
`CorpusSnapshot` → `Runner` and its generators → `SnapshotPublisher`) that reuses
Omeka's own database connection. It needs no Python, shell access or extra
credentials at runtime. It holds the dashboards and their indexes, the
Discursive Communities graph (baked FA2 positions), the per-item knowledge
graphs and item contexts, the photo galleries, the featured collections, the
network explorer and the validated semantic inputs.
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) has the publication and locking
rules.

Three **inputs** are made outside Omeka:

| Input | Where | Made by |
|---|---|---|
| `asset/data/geo/countries.geojson` | committed | Natural Earth boundaries, for the choropleth |
| `data/wordclouds/*.php` | committed | the **Build word clouds** Action (`tools/wordclouds/build_wordclouds.py`, spaCy lemmatisation — PHP can't do it); `MediaDashboardGenerator::wordCloudInput()` reads them, with an in-PHP tokeniser fallback |
| semantic inputs (map, similar items, report) | `semantic-inputs-<n>` GitHub releases, never committed | the **Build semantic embeddings** Action (EmbeddingGemma 2); `Precompute\EmbeddingInputs` downloads the newest matching release into the store. Contract: [docs/SEMANTIC_EMBEDDINGS.md](docs/SEMANTIC_EMBEDDINGS.md) |

The JS is modular — one vanilla-JS IIFE per concern (chart builders, controllers,
the `window.RV` core, registry, layouts). The per-file tree in the README's
**Architecture** section is generated from `git ls-files` by `npm run build:tree`
(annotations in `scripts/build-tree.mjs`); `npm run check` fails while it is out of
date, so run it after adding, moving or removing a file. What each surface loads
is declared in `config/asset-plans.json` (single source of truth).

## Omeka S data reference

| Entity | Count | Key properties |
|---|---|---|
| Research Items | 2,899 | 54 `marcrel:*` roles, `dcterms:subject` (16,187), `dcterms:format` (12,078), `dcterms:spatial` (4,988), `dcterms:language` (2,079) |
| Persons | 1,242 | Affiliations via `dcterms:isPartOf` |
| Authority (Subjects) | 1,437 | LCSH URIs + free-text tags |
| Institutions | 552 | `foaf:Organization`, optional `geo:lat`/`geo:long` |
| Locations | 161 | `geo:lat`/`geo:long` coordinates |
| Projects | 92 | `dcterms:temporal` intervals, section membership |
| Languages | 28 | ISO 639-2 codes |
| Genres | 124 | MARC genre classifications |
| Research Sections | 6 | Hierarchical: section → projects → items |

For querying the live data (the References aggregation API, linked-value reading,
geo/timeline/network recipes) see the `africa-multiple-data` reference material;
the External REST **References API** is the external equivalent of these
in-process aggregations.
