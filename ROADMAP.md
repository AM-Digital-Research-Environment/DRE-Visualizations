# Visualization Roadmap

Comprehensive plan for adding interactive visualizations to all entity types in the Omeka S instance, inspired by the sibling [amira dashboard](https://github.com/AM-Digital-Research-Environment/amira) (formerly the WissKI dashboard).

## Current State

| Entity | Knowledge Graph | Dashboard Charts | Map | Status |
|---|---|---|---|---|
| Research Items | Force-directed graph | Timeline, Types, Languages, Subjects, Contributors | MapLibre clustered | Done |
| Research Sections (6) | Force-directed graph | Stacked Timeline, Timeline, Gantt, Beeswarm, Types, Languages, Roles, Heatmap, Subjects, Sunburst, Locations, Chord, Contributor Network, Contributors, Projects, Sankey | MapLibre clustered | Done |
| Projects (36 with data) | Force-directed graph | Stacked Timeline, Timeline, Types, Languages, Roles, Heatmap, Subjects, Sunburst, Locations, Chord, Contributor Network, Contributors, Sankey | MapLibre clustered | Done |
| People (~1 242) | Force-directed graph | Timeline, Types, Languages, Subjects, Co-authors, Contributor Network | MapLibre clustered | Done |
| Institutions (~552) | Force-directed graph | Timeline, Types, Languages, Contributors, Subjects, Collaboration Network, Affiliation Network | MapLibre clustered | Done |
| Locations (~161) | Force-directed graph | Self-location MiniMap, Timeline, Types, Languages, Contributors, Subjects | — | Done |
| Subjects (~1 437) | Force-directed graph | Timeline, Types, Languages, Co-subjects, Contributors | MapLibre clustered | Done |
| Languages (28) | — | Timeline, Types, Subjects, Contributors | MapLibre clustered | Done |
| Resource Types (16) | — | Timeline, Languages, Subjects, Contributors | MapLibre clustered | Done |
| Genres (124) | — | Timeline, Types, Languages, Contributors | — | Done |

### Completed phases

**Phase 1 — Extend to All Entity Types** ✓
All entity types now have knowledge graphs + dashboards using shared chart builders.

**Phase 2 — Advanced Visualizations** ✓
Gantt, Heatmap, Chord Diagram, and Collaboration Network for relevant entity types.

**Phase 3 — Complex Data Flows** ✓
Sankey, Sunburst, and Stacked Timeline implemented; Beeswarm and Compare View followed in Tier 1.

---

## Tier 1 — Complete Phase 3 ✓

Finished.

| Visualization | Entity Types | Description | Data source |
|---|---|---|---|
| **Beeswarm Chart** | Sections | Projects plotted by section (y-axis) × start year (x-axis), bubble size = item count. Gives an at-a-glance view of research activity density across sections and time. | `dcterms:temporal` on projects + `children_of` item counts |
| **Compare View** | Projects | Side-by-side comparison of two projects: stacked timeline, resource types, languages, subjects, plus overlap statistics (shared subjects %). | Fetches two project dashboard JSONs and renders paired charts |

### Architecture notes

- **Beeswarm**: new `dashboard-charts-beeswarm.js` module. Precompute adds `beeswarm` key to section dashboards. Uses ECharts scatter with jitter.
- **Compare View**: new `CompareProjects` block layout + `dashboard-compare.js`. Selector UI for picking two projects, fetches both JSONs, renders 2-column comparison grid. _(Later generalised to all entity types and consolidated into the single **Compare (any entity)** block — the project-only `CompareProjects` block was removed in v1.30.0, since Compare (any entity) opens on projects by default.)_

---

## Tier 2 — Port Proven WissKI Patterns ✓

Implemented. Contributor Network on 694 persons + 36 projects + 6 sections. Affiliation Network on 12 institutions. Roles on 6 sections + 36 projects.

| Visualization | Entity Types | Description | Data source |
|---|---|---|---|
| **Contributor Network** | People, Projects | Force-directed graph showing person → project links. Reveals collaboration clusters beyond the institution level. | `marcrel:*` / `dcterms:creator` / `dcterms:contributor` reverse links |
| **Affiliation Network** | Organisations | Person → institution affiliation links. Shows who is affiliated where and how institutions connect through people. | `dcterms:isPartOf` on persons |
| **Contributor Role Breakdown** | Sections, Projects | Pie or stacked bar showing the proportion of different MARC relator roles (author, collector, photographer, interviewer, etc.). Omeka S has 54 distinct `marcrel:*` roles across 2 899 research items. | Aggregate `marcrel:*` terms per item |

### Architecture notes

- **Contributor Network**: `dashboard-charts-contributor-network.js` with shared bipartite graph builder. `contributorNetwork` key on person, project, and section dashboards.
- **Affiliation Network**: same module, `buildAffiliationNetwork` builder. `affiliationNetwork` key on organisation dashboards.
- **Role Breakdown**: uses existing `buildBarChart` builder via `roles` key. Precomputed as `[{name, value}]` from `marcrel:*` labels.

---

## Tier 3 — New High-Impact Visualizations ✓

Implemented. Subject Trends on 6 sections + 21 projects. Language Timeline on 6 sections + 14 projects. Treemap on 6 sections + 36 projects. Geo Flows on 5 sections + 9 projects.

| Visualization | Entity Types | Description | Data source |
|---|---|---|---|
| **Subject Temporal Trends** | Sections, Projects | Stacked area or small multiples showing how top-N subjects evolve over years. Reveals shifting research focus. | `dcterms:subject` × `dcterms:issued` year aggregation |
| **Geographic Flow Map** | Sections, Projects | Arc lines from item origins (`dcterms:spatial`) to current locations (`dcterms:provenance`). Shows material movement patterns — highly relevant for African studies collections. | `dcterms:spatial` + `dcterms:provenance` pairs with `geo:lat`/`geo:long` |
| **Treemap** | Sections, Projects | Hierarchical space-filling chart: Section → Project → Resource Type, sized by item count. Good alternative to sunburst for showing proportions. | `dcterms:isPartOf` hierarchy + `dcterms:type` |
| **Language × Time Stacked Area** | Sections, Projects | Stacked area chart showing how language distribution evolves over years. Reveals the multilingual character of the research over time. | `dcterms:language` × year aggregation |

### Architecture notes

- `dashboard-charts-stacked-area.js` — shared stacked area builder for subject trends and language timeline.
- `dashboard-charts-treemap.js` — ECharts native treemap with project → type hierarchy.
- `dashboard-charts-geo-flows.js` — MapLibre flow map with origin/current location markers and arc lines.
- Precompute functions: `build_subject_trends`, `build_language_timeline`, `build_treemap`, `build_geo_flows`.

---

## Tier 4 — Polish & Exploration

Lower-priority items that add analytical depth. Several shipped via the parity initiative — **Radar Chart**, **Cross-entity Comparison** (the generalized Compare block), and **Box Plot** are done; **Alluvial/Bump** and **Scatter** are now tracked in [Tier 5](#tier-5--2026-audit-programme) below.

| Visualization | Entity Types | Description |
|---|---|---|
| **Radar/Spider Chart** | Projects, People | Multi-axis profile (items, languages, subjects, contributors, year span). Quick visual comparison of entities. |
| **Alluvial/Bump Chart** | Subjects, Languages | Rank changes over time — which subjects/languages rise and fall in prominence. |
| **Scatter Plot** | Sections | X = contributors, Y = items per project, bubble = year span. Reveals collaborative vs. solo projects. |
| **Cross-entity Comparison** | Any entity type | Generalize Compare View beyond projects: compare two people, two institutions, two subjects side-by-side. |
| **Box Plot / Violin** | Sections | Distribution of items-per-project within a section. Shows spread, not just totals. |

---

## Tier 5 — 2026 audit programme

Outcome of the July 2026 full-repo audit (PHP precompute, JS front end, templates/CSS, and a
data-coverage sweep against the Omeka model). Everything small-to-medium **shipped in
v2.20.0**; the larger visualizations are queued below with their data grounding; a few audit
suggestions were examined and **declined** with reasons, so they don't resurface.

### Shipped in v2.20.0

**New visualizations & cards** (Publications / YouTube blocks; regenerate once after updating):

| Change | Data | Where |
|---|---|---|
| Places-of-publication map | `marcrel:pup` → geocoded Locations (Bayreuth 41, Berlin 9, London 8, …) | Publications; reuses the shared `locations` map via `Aggregators::buildLinkedPlacesMap()` |
| Funders bar | `frapo:isFundedBy` (DFG 193, EXC 2052 grant 166, BMBF, SNSF, …) | Publications; generic `buildTopLinked()` |
| Peer-reviewed / Full texts / Venues / Publishers / Places stat cards | `bibo:status` (179/33), attached EPub PDFs (53), `dcterms:isPartOf` (~202), `dcterms:publisher` (~46) | Publications stat grid |
| Transcript word cloud | `bibo:content` captions; `youtube` corpus added to the wordclouds Action | YouTube (headline chart, mirrors Podcasts) |
| Who Appears Together | `marcrel:spk` co-appearance (auto-hidden until curated) | YouTube; reuses `buildPersonCollaborationNetwork()` |

**Refactors:** dead discursive-communities chain removed end-to-end (`generateCommunities()`,
`CommunityTrait`, `dashboard-communities.js`, the `communities` controller wiring — the
subject-only `discursive.json` had no consumer; the force-graph *builder* lives on as the
co-author/speaker network); `marcrelTerms()` caches the role-term discovery that was scanned
4× per run; `loadValueRows()` unifies the scoped literal loaders; `countItemsWithMedia()`;
peak-memory logging on the precompute job; `ns.initMap()` shared MapLibre bootstrap (4 map
builders); `ns.formatNumber()` one grouping style ("1,234") across stat cards, spatial counts
and map popups; local `escapeHtml` copies collapsed onto `ns.escapeHtml` (6 files); the five
dashboard block templates now delegate to one `partials/dashboard-async.phtml`.

**Fixes / accessibility / robustness:** escaped the affiliation-map popup fields, choropleth
country names and map-popup item titles (XSS hygiene); `prefers-reduced-motion` now disables
the force/word-cloud layout animations **and** the hover lift transforms; Home/End keys on the
Compare combobox (Arrow/Enter/Escape already existed); `aria-live`/`aria-busy` on the Project
Explorer swap; a `<noscript>` fallback in the shared dashboard partial; a print stylesheet;
the z-index scale documented; README sections for Network Explorer and Compare Genres.

### Queued — new visualizations (data verified present)

| Priority | Visualization | Data / approach |
|---|---|---|
| 1 | **Metadata-completeness dashboard** — per-project % of items with subject / spatial / language / date / description / media | All in DataLoader already; heatmap (projects × fields) + summary bars. Audience: DRE team + AMRC curation partners |
| 2 | **Global institution collaboration map** — arcs between geocoded institutions that co-occur on projects | `geo:lat/long` on institutions + project membership; buildGeoFlows-style arcs on the Collection Dashboard |
| 3 | **Cross-corpus person activity timeline** — research items + publications + podcast/video appearances, stacked per year | All four link types loaded; person dashboards |
| 4 | **Alluvial/bump chart** — subject/language rank drift over time (Tier 4 leftover) | subjectTrends pipeline already computes most of it |
| 5 | **Scatter** — contributors × items-per-project (Tier 4 leftover) | profileFromItems data |
| 6 | **Publication cadence heatmap** — year × month | EP3 month/day precision on `dcterms:date` (currently collapsed to year) |
| 7 | **Transcript themes over time** | Extend the wordclouds Action to emit per-year buckets |
| 8 | **AI-provenance panel** — transcripts/abstracts by generating model | `dre:generatedBy` annotations |
| 9 | **Podcast subjects/locations** | Tracked in [#5](https://github.com/AM-Digital-Research-Environment/ResourceVisualizations/issues/5) |
| — | **Events chart** (`bibo:presentedAt`) | *Deferred*: 34 events, every count = 1 today — a flat bar; revisit when the bibliography deepens |

### Queued — process & tooling

- Extend `scripts/check-registry-contracts.mjs` to verify `data-embed-slug` values ↔ `EmbedController::BLOCKS` keys.
- `ns.loadJSON()` fetch wrapper (shared error UI, optional retry) — adopt opportunistically when a controller is next touched.
- Consolidate the responsive breakpoints (420/600/680/720px) onto the DRE theme's scale — needs a theme-side audit first.
- Rename the repo to DRE-Visualizations ([#2](https://github.com/AM-Digital-Research-Environment/ResourceVisualizations/issues/2)); `module.ini` already points at the new name.

### Examined and declined

| Suggestion | Why not |
|---|---|
| BlockLayout factory/config class (14 classes → 1) | One-class-per-block is the Omeka idiom and keeps `invokables` discoverable; the real duplication was the *templates*, now one shared partial |
| `generateCategoryOverviews()` config-array loop | The call list is already declarative; the rows vary in closures (`filterFn`, extras), so a config array adds indirection without removing variance |
| Photo-gallery first-spatial pre-index | The per-photo scan is bounded by that item's own links with an early break; a global index costs more memory than it saves |
| Removing the standalone `escapeHtml` in `sibling-sparkline.js` | That file is loaded *without* dashboard-core by design (its template appends it directly), so the local copy is load-bearing |
| "Combobox lacks keyboard support" (audit finding) | Verified wrong — Arrow/Enter/Escape + `aria-activedescendant` were already implemented; only Home/End were missing (added) |
| Replacing the lightbox `#000`/`#fff` | Sanctioned imagery exception in `check-design-tokens.mjs` (frosted controls over unknown photos) |
| Lowering the fullscreen `z-index: 9999` | Fullscreen must beat unknown theme chrome; the scale is now documented in the CSS instead |
| Admin maintenance page inline styles → `--rv-*` tokens | The admin runs under Omeka's admin theme where the module tokens don't exist; a dedicated admin stylesheet is possible but low-value |

---

## Data Architecture

All visualizations use precomputed JSON files stored in `asset/data/`:

```
asset/data/
├── knowledge-graphs/       # One per item — gitignored, regenerated in-Omeka
└── item-dashboards/        # One per entity with data (incl. publications.json)
```

**Everything** regenerates inside Omeka via the admin "Regenerate now" button — a
pure-PHP engine under `src/Precompute/` (`DataLoader` → `Aggregators` / `KnowledgeGraphs`
→ `Runner`) that reuses Omeka's own database connection. No Python, shell access, or extra
credentials — the module ships **zero** Python.

The knowledge-graph JSON (~6 000 files) is **not committed** — it regenerates on demand;
until then the front-end falls back to a lighter live REST-API graph.

### Omeka S data summary

| Entity | Count | Key properties |
|---|---|---|
| Research Items | 2 899 | 54 `marcrel:*` roles, `dcterms:subject` (16 187), `dcterms:format` (12 078), `dcterms:spatial` (4 988), `dcterms:language` (2 079) |
| Persons | 1 242 | Affiliations via `dcterms:isPartOf` |
| Authority (Subjects) | 1 437 | LCSH URIs + free-text tags |
| Institutions | 552 | `foaf:Organization` |
| Locations | 161 | `geo:lat`/`geo:long` coordinates |
| Projects | 92 | `dcterms:temporal` intervals, section membership |
| Languages | 28 | ISO 639-2 codes |
| Genres | 124 | MARC genre classifications |
| Research Sections | 6 | Hierarchical: section → projects → items |

## Module architecture

JavaScript is modular — one vanilla-JS IIFE per concern (chart builders,
controllers, the `window.RV` core, registry, and layouts). The authoritative
per-file tree lives in the README's **Architecture** section; the shared
helper chain is injected by `DashboardAssets` (single source of truth).

## Adding a new visualization — recipes & guardrails

These are the load-bearing conventions that keep the module modular, maintainable, and theme-consistent. They were proven out across the visualization-parity initiative with the sibling [amira dashboard](https://github.com/AM-Digital-Research-Environment/amira) (tracked against [amira#10](https://github.com/AM-Digital-Research-Environment/amira/issues/10)); that initiative is now **complete**, so its per-phase tracker was retired and its reusable playbook preserved here.

### The precompute → registry → builder pattern

Every per-entity chart lands as the same change across the PHP precompute and the JS front-end:

1. **Aggregator** — a pure `public static function buildX(array $itemIds, array $links, array $items, …): ?array` in `src/Precompute/Aggregators.php`, returning a JSON-serializable array **or `null`** when empty. Aggregators are dependency-free and unit-tested.
2. **Runner wiring** — call it in the right place in `src/Precompute/Runner.php` (a per-entity generator such as `addStandardCharts()` / `generatePeople()`, or an overview generator) and store it on the dashboard array: `$dashboard['x'] = Aggregators::buildX(...)`.
3. **Builder** — a vanilla-JS IIFE `asset/js/dashboard-charts-x.js` registering `window.RV.charts.buildX = function (el, data, siteBase, allData) { … }`.
4. **Registry** — add the key to `CHART_MAP`, `CHART_LABELS`, and (optionally) `CHART_DESCRIPTIONS` in `asset/js/dashboard-registry.js`.
5. **Layout** — add the key to the relevant entity layout's `order` (and `wide`/`tall`) in `asset/js/dashboard-layouts.js`.
6. **Asset include** — add `dashboard-charts-x.js` to `DashboardAssets::CHART_SCRIPTS` in `src/View/Helper/DashboardAssets.php` (the single source of truth for the builder chain — add it here and nowhere else).
7. **Test** — add a mock-data case to `tests/AggregatorsTest.php`.
8. **Regenerate** — Admin → DRE Visualizations → "Regenerate now" rebuilds the JSON in-Omeka.

The orchestrator (`asset/js/dashboard.js`) reads `LAYOUTS[data.resourceType]`, **auto-hides any key whose data is empty/null**, and calls `CHART_MAP[key](el, data[key], siteBase, data)` — the 4th argument is the whole dashboard object, which is how data-driven overlays work (see `geoFlows`).

### Cross-cutting features are site-page block layouts, not resource-page blocks

- **`src/Site/BlockLayout/Xxx.php`** extends `Omeka\Site\BlockLayout\AbstractBlockLayout`, registered in `config/module.config.php` under **`block_layouts.invokables`**. These attach to **site pages** (Admin → Sites → [site] → Pages) — where archive-wide views belong. Collection Overview, Compare, Project Explorer, What's New, Discursive Communities, Publications, and Photo Browsing all follow this path (**Recipe B**).
- **`src/Site/ResourcePageBlockLayout/Xxx.php`** (implements `ResourcePageBlockLayoutInterface`, declares `getCompatibleResourceNames()`) is reserved for blocks bound to a single item / item-set page — Knowledge Graph, Item Set Dashboard, Linked Items Dashboard, Sibling-items Sparkline.

### Theme: read DRE tokens, never hard-code

The module styles itself entirely from the [DRE theme](https://github.com/AM-Digital-Research-Environment/DRE-theme) design tokens and follows light/dark automatically:

- **In JS**, resolve every colour through `ns.cssColor('--token', fallback)`. The categorical palette `ns.COLORS` (20 hues) is the only sanctioned theme-independent set (compare-mode needs a stable colour-by-index map); brand identity is carried by `THEME.accent` (= `--primary`).
- **ECharts**: create instances with `ns.initChart(el)`. For graph/structural charts whose per-node/edge colours must re-resolve on toggle, set `chart._rvRebuild`.
- **MapLibre**: register every map with `ns.trackMap(map, rebuild)` and pick the basemap with `ns.getBasemapStyle()`; maps are *rebuilt* on theme toggle.
- **In CSS**, use the `--rv-*` aliases at the top of `asset/css/dre-visualizations.css`. Never introduce a raw hex.

### Other invariants

- **No build step.** ECharts 6, echarts-wordcloud 2, and MapLibre GL 5 stay self-hosted from committed `asset/vendor/` bundles (via `DashboardAssets`).
- **Reuse `window.RV`** (`THEME`, `COLORS`, `initChart`, `truncateLabel`, `toEntries`, `escapeHtml`, `el`, `addClickHandler`, `attachToolbar`, `trackMap`, `getBasemapStyle`, `cssColor`). No new globals.
- **Overlays over panels.** When a new signal belongs on an existing chart, write it as an extra key the existing builder reads from its 4th `data` argument (the `geoFlows`-on-`locations` pattern) rather than a new panel.
- **Empty = hidden.** Aggregators return `null` and the orchestrator silently drops empty panels — so adding a key to a layout is safe even if only some entities populate it.

### Recipe A — add a per-entity chart

| Step | File | Change |
|---|---|---|
| 1 | `src/Precompute/Aggregators.php` | `public static function buildX(...): ?array` → array or `null`. |
| 2 | `src/Precompute/Runner.php` | Call it in the right generator; `$dashboard['x'] = Aggregators::buildX(...)`. |
| 3 | `asset/js/dashboard-charts-x.js` | New IIFE builder registering `ns.charts.buildX`. |
| 4 | `asset/js/dashboard-registry.js` | `CHART_MAP['x'] = c.buildX;` + `CHART_LABELS` + `CHART_DESCRIPTIONS`. |
| 5 | `asset/js/dashboard-layouts.js` | Add `'x'` to the chosen layouts' `order`/`wide`/`tall`. |
| 6 | `src/View/Helper/DashboardAssets.php` | Add `dashboard-charts-x.js` to `CHART_SCRIPTS`. |
| 7 | `tests/AggregatorsTest.php` | Mock-data case for `buildX`. |
| 8 | Admin → Regenerate now | Rebuild JSON in-Omeka (pure PHP). |

### Recipe B — add a cross-cutting site-page block

| Step | File | Change |
|---|---|---|
| 1 | `src/Site/BlockLayout/Xxx.php` | `extends AbstractBlockLayout`; `getLabel()`, `form()` (config or "no configuration needed"), `render()` → partial. |
| 2 | `config/module.config.php` | Register `'xxx' => Site\BlockLayout\Xxx::class` under `block_layouts.invokables`. |
| 3 | `view/common/block-layout/xxx.phtml` | Call `$this->dashboardAssets(['cdn' => true, 'controller' => 'xxx'])` (or a lean prelude), emit a `.xxx-container` + spinner. |
| 4 | `asset/js/dashboard-xxx.js` + `DashboardAssets::CONTROLLERS` | Controller IIFE that fetches its JSON, builds UI, renders via `CHART_MAP`; register the chain under `CONTROLLERS['xxx']`. |
| 5 | *(if data-driven)* `src/Precompute/{Aggregators,Runner}.php` | New aggregator emitting an index/feed JSON under `asset/data/`. |
| 6 | *(to make it embeddable)* `EmbedController.php` + the step-3 template | In `src/Controller/Site/EmbedController.php` add a `BLOCKS` entry: slug ⇒ `label` + `template` (the `common/block-layout/<template>` partial) + `kind`. Use `kind => 'dashboard'` with `itemId`/`layout` only if dashboard.js renders it from a chart-key layout (then it gets single-chart embeds for free); otherwise `kind => 'widget'`. Zero-config partials only — the embed route has no `$block`. Then stamp the **same slug** as `data-embed-slug` on the container in the step-3 template, so the on-page copy-embed buttons (`dashboard-core.js`) can build the URL. |
| 7 | README | Document adding the block (Admin → Sites → [site] → Pages). |

### Recipe C — add stat cards to a dashboard

Stat cards (icon + value + label + optional subtitle) are a reusable component spanning precompute → JSON → render. Any dashboard that emits a `stats` array gets a card grid at the top — no template or controller change.

| Step | File | Change |
|---|---|---|
| 1 | `src/Precompute/Runner.php` | In the generator, compute the counts (the standard precompute way) and `$dashboard['stats'] = Aggregators::buildStatCards([['key'=>…,'label'=>…,'value'=>…,'subtitle'=>…?], …]);`. The assembler casts values, drops non-positive cards and clears empty subtitles. |
| 2 | `asset/js/dashboard-stat-cards.js` | *(only if a card needs a new glyph)* add the lucide path to `ICONS` under its `key`, or map a synonym in `ALIAS`. Unknown keys already fall back to a generic icon. |
| 3 | `tests/AggregatorsTest.php` | Cover any non-trivial counting you added. (`buildStatCards` itself is already tested.) |
| 4 | Admin → Regenerate now | Rebuild JSON in-Omeka. |

The renderer (`ns.renderStatCards`, wired into `dashboard.js`) is shared, so the card grid is consistent everywhere and follows the DRE light/dark theme. The Collection Overview is the first consumer (`Runner::buildOverviewStats`).

## Regeneration

After data changes, click **Admin → Modules → DRE Visualizations → "Regenerate now"** — one in-Omeka, pure-PHP job rebuilds the dashboards, communities, publications **and** the per-item knowledge graphs. No Python.

To pull a new module **release** into the container:

```bash
docker compose exec php omeka-s-cli module:download --base-path /var/www/html --force gh:AM-Digital-Research-Environment/DRE-Visualizations
docker compose restart php
```
