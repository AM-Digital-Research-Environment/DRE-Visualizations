# Contributing — adding & extending visualizations

How to add a chart, a cross-cutting block, or a stat card to this module without
breaking its conventions. These are the load-bearing patterns that keep the code
modular, maintainable, and theme-consistent; they were proven out over the
visualization-parity initiative with the sibling
[amira dashboard](https://github.com/AM-Digital-Research-Environment/amira).

The module ships **plain PHP, CSS and vanilla JavaScript with no bundler**. There
is no build step: ECharts 6, echarts-wordcloud 2, and MapLibre GL 5 stay
self-hosted from committed `asset/vendor/` bundles (injected by `DashboardAssets`).

## Before you commit

```bash
npm run check   # design-token contract + JS syntax sweep + registry/layout/embed contracts
docker run --rm -v "$PWD:/m" php:8.4-cli php /m/tests/AggregatorsTest.php   # aggregator regressions
```

The aggregators are dependency-free and unit-tested — add a mock-data case for
every new builder.

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
| 1 | `src/Precompute/Aggregators.php` | `public static function buildX(array $itemIds, array $links, array $items, …): ?array` → array or **`null`** when empty. |
| 2 | `src/Precompute/Runner.php` | Call it in the right generator (`addStandardCharts()` / `generatePeople()` / an overview generator); `$dashboard['x'] = Aggregators::buildX(...)`. |
| 3 | `asset/js/dashboard-charts-x.js` | New IIFE builder registering `window.RV.charts.buildX = function (el, data, siteBase, allData) { … }`. |
| 4 | `asset/js/dashboard-registry.js` | `CHART_MAP['x'] = c.buildX;` + `CHART_LABELS` + (optionally) `CHART_DESCRIPTIONS`. |
| 5 | `asset/js/dashboard-layouts.js` | Add `'x'` to the chosen layouts' `order` (and `wide`/`tall`). |
| 6 | `src/View/Helper/DashboardAssets.php` | Add `dashboard-charts-x.js` to `CHART_SCRIPTS`, then run `npm run build`; CI rejects a stale generated bundle. |
| 7 | `tests/AggregatorsTest.php` | Mock-data case for `buildX`. |
| 8 | Admin → Regenerate now | Rebuild JSON in-Omeka (pure PHP). |

### Recipe B — add a cross-cutting site-page block

Archive-wide views are **site-page block layouts**, not resource-page blocks.
`src/Site/BlockLayout/Xxx.php` extends `Omeka\Site\BlockLayout\AbstractBlockLayout`
and is registered in `config/module.config.php` under `block_layouts.invokables`;
these attach to site pages (Admin → Sites → [site] → Pages). (The narrower
`src/Site/ResourcePageBlockLayout/Xxx.php` — `ResourcePageBlockLayoutInterface`,
`getCompatibleResourceNames()` — is reserved for blocks bound to a single item /
item-set page: Knowledge Graph, Item Set Dashboard, Linked Items Dashboard,
Sibling-items Sparkline.)

| Step | File | Change |
|---|---|---|
| 1 | `src/Site/BlockLayout/Xxx.php` | `extends AbstractBlockLayout`; `getLabel()`, `form()` (config or "no configuration needed"), `render()` → partial. |
| 2 | `config/module.config.php` | Register `'xxx' => Site\BlockLayout\Xxx::class` under `block_layouts.invokables`. |
| 3 | `view/common/block-layout/xxx.phtml` | Call `$this->dashboardAssets(['cdn' => true, 'controller' => 'xxx'])` (or a lean prelude), emit a `.xxx-container` + spinner. The five dashboard blocks delegate to the shared `partials/dashboard-async.phtml`. |
| 4 | `asset/js/dashboard-xxx.js` + `DashboardAssets::CONTROLLERS` | Controller IIFE that fetches its JSON, builds UI, renders via `CHART_MAP`; register the chain under `CONTROLLERS['xxx']`. |
| 5 | *(if data-driven)* `src/Precompute/{Aggregators,Runner}.php` | New aggregator emitting an index/feed JSON under `asset/data/`. |
| 6 | *(to make it embeddable)* `EmbedController.php` + the step-3 template | In `src/Controller/Site/EmbedController.php` add a `BLOCKS` entry: slug ⇒ `label` + `template` + `kind`. Use `kind => 'dashboard'` with `itemId`/`layout` only if `dashboard.js` renders it from a chart-key layout (then single-chart embeds come for free); otherwise `kind => 'widget'`. Zero-config partials only — the embed route has no `$block`. Then stamp the **same slug** as `data-embed-slug` on the container (directly, or via the shared partial's `'slug'` param), so the on-page copy-embed buttons can build the URL. `scripts/check-registry-contracts.mjs` verifies this slug matches in both directions. |
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
  `attachToolbar`, `trackMap`, `getBasemapStyle`, `cssColor`). No new globals.
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
    README's *Theming* section for the full alias → token table.)

## Data architecture

All visualizations load from precomputed JSON under `asset/data/`:

```
asset/data/
├── geo/countries.geojson    # Natural Earth boundaries (choropleth) — committed INPUT
├── wordclouds/              # Lemmatised frequencies from the CI Action — committed INPUT
├── communities/             # Multi-entity co-occurrence network (baked FA2 positions)
├── knowledge-graphs/        # One per item — gitignored, regenerated in-Omeka
├── photo-galleries/         # One per image-bearing item set — gitignored
└── item-dashboards/         # Dashboards + {type}-index.json + publications/podcasts/youtube/…
```

**Everything** regenerates inside Omeka via the admin **"Regenerate now"** button —
a pure-PHP engine under `src/Precompute/` (`DataLoader` → `Aggregators` /
`KnowledgeGraphs` → `Runner`) that reuses Omeka's own database connection. No
Python, shell access, or extra credentials — the module ships **zero** Python. The
knowledge-graph JSON (~6,000 files) is **not committed**; until the first run the
front-end falls back to a lighter live REST-API graph.

Two static **inputs** are the exception, produced outside Omeka and committed like
`countries.geojson`: the `wordclouds/` frequencies come from the **Build word
clouds** GitHub Action (`tools/wordclouds/build_wordclouds.py`, spaCy
lemmatisation — PHP can't do it), read back by `Runner::wordCloudInput()` with an
in-PHP tokeniser fallback.

The JS is modular — one vanilla-JS IIFE per concern (chart builders, controllers,
the `window.RV` core, registry, layouts). The authoritative per-file tree lives in
the README's **Architecture** section; the shared helper chain is injected by
`DashboardAssets` (single source of truth).

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
