# Roadmap — 2.29.1 review implementation

Tracks the fixes and improvements from the module review of 2026-10-07
(PHP back end, browser JavaScript, tests/CI, and MapLibre/ECharts against their
current documentation). The earlier review is recorded in
[ROADMAP_STATUS.md](ROADMAP_STATUS.md).

Status: `[x]` done · `[~]` partly done / see note · `[ ]` open · `[-]` decided against (reason given).

## Decisions

- **PHP floor raised to 8.4** (from 8.2). Production runs PHP 8.5; 8.4 keeps one
  version of headroom while allowing typed class constants, `readonly` classes
  and PHPStan/PHPUnit releases that need 8.4. CI tests 8.4 and 8.5.
- **No PHPUnit migration (yet).** The dependency-free harness stays, but gains a
  shared assertion library and fails on warnings. PHPStan adds the static safety
  net. Revisit PHPUnit if the harness grows past what `tests/lib` covers.
- **`no-store` stays on snapshot responses.** `SECURITY_AND_PRIVACY.md` keeps
  withdrawn data out of browser disk caches; within a page the client now
  memoises each artifact instead.

## Phase 1 — Correctness

- [x] B1 Cluster click-to-zoom uses the Promise form of `getClusterExpansionZoom` (dashboard map).
- [x] B2 Every MapLibre symbol layer uses the shipped `Noto Sans Regular` glyphs through one shared `ns.MAP_LABEL_FONT`.
- [x] B3 The publication abstract fallback loads `bibo:abstract`; the loader publishes the terms it loads and asking for any other term throws.
- [x] B4 Entity-graph PNG export: `preserveDrawingBuffer` moves under `canvasContextAttributes`.
- [x] B5 `upgrade()` withdraws publication only when the snapshot schema changes, and purges legacy public files only when upgrading from before 2.29.0.
- [x] B6 Snapshot readers take a shared lock; only writers lock exclusively.
- [x] B7 A missing or unwritable private store no longer turns item pages into 500s or blocks Omeka writes when nothing is published.
- [x] B8 Source-write locks are tied to the request object (`WeakMap`), so a failed write cannot leave a lock held.
- [x] B9 One HTML escaper (`ns.escapeHtml`) everywhere; the sparkline's quote-unsafe copy is gone.
- [x] B10 Spatial Exploration creates one `ResizeObserver`, not one per theme toggle.
- [x] B11 An unknown `:viz` on a dashboard embed returns 404.
- [x] B12 Word-cloud click handler reads the current language's entries.
- [x] B13 Chart click navigation resolves by `dataIndex`, not by name.
- [x] B14 Semantic map: faint low-signal points stay faint with `large` rendering.
- [x] B15 Attribute and URL values built from data are escaped/encoded (affiliation map, spatial list, embed snippet, numeric HTML).
- [x] B16 Network-explorer graphs key nodes by id, so homonyms no longer merge.
- [-] B17 Module configuration form is CSRF-protected — already true: Omeka core validates its own CSRF token around `handleConfigForm()` (`ModuleController::configureAction`).
- [x] B18 Every JSON blob embedded in HTML uses the same HEX-escaping flags.
- [x] B19 Cover thumbnails resolve through Omeka's file store instead of a hard-coded `/files/large/` path.
- [x] B20 Every map creation site handles MapLibre's thrown `GPUInitializationError`.

## Phase 2 — MapLibre 6.13

- [x] M1 Vendor MapLibre 6.13.0 (self-contained worker; no shared chunk) and simplify `vendor-maplibre.mjs`.
- [x] M2 Update `DashboardAssets`, release-metadata check, browser test and `THIRD_PARTY_NOTICES`.
- [ ] M3 Browser-verify clusters, globe + markers, spatial picker, PNG export, theme rebuild, RTL labels.

## Phase 3 — Front-end behaviour and performance

- [x] F1 Cache resolved theme colours per theme (`cssColor`/`entityColor`); cleared on theme change.
- [x] F2 Entity-graph selection/keyboard focus via feature-state instead of filters and data-driven paint.
- [x] F3 Memoise snapshot fetches per generation URL within a page.
- [x] F4 Chart libraries are chosen from the charts that will actually render.
- [x] F5 Large dashboards build panels as they approach the viewport.
- [x] F6 Chart toolbar (image, CSV, patterns) on every chart surface (Compare, What's New, Network Explorer, Semantic Map).
- [x] F7 Live light/dark switch recolours charts that bake per-item colours.
- [x] F8 One shared `ResizeObserver` resizes charts on container changes, not only window resizes.
- [x] F9 Charts respect `prefers-reduced-motion` centrally.
- [x] F10 Chart containers carry `role="img"` and an accessible name from their heading.
- [x] F11 Focus management: Network Explorer tabs (roving focus, `aria-controls`), photo TOC dialog (initial/trapped/returned focus, name), sparkline heading reachable by keyboard.
- [x] F12 Remaining English interface strings go through `ns.t`; plurals through `Intl.PluralRules`.
- [x] F13 Hard-coded colours replaced with tokens (sparkline, affiliation map, cluster counts, word-cloud font, current-location colour). — sparkline, affiliation map, word-cloud font and current-location colour; white cluster counts keep their dark halo (contrast holds on every brand fill)
- [x] F14 Controllers that need ECharts show an error instead of a permanent spinner when it fails to load.
- [~] F15 Choropleth reuses the basemap's country source and only rewrites its popup on feature change. — the popup is rebuilt only when the country changes; the separate count source stays, because an administrator-configured basemap need not contain `dre-countries`
- [x] F16 Graph canvas reacts to `devicePixelRatio` changes.

## Phase 4 — Front-end structure

- [x] S1 Shared helpers replace duplicates: graph legend, keyboard walker, `mountWhenVisible`, local `fold`/`el`/escape fallbacks, choropleth colour maths, marker-map factory, photo-views MapLibre loader. — plus ns.moveHover / ns.fitToPoints / ns.graphStep; the marker maps share fitToPoints rather than a factory (their markers and popups differ)
- [x] S2 `dashboard-core.js` split into focused sources concatenated into one core bundle. — eleven sources in `asset/js/core/`, concatenated by the build into the same served `dashboard-core.js`
- [x] S3 Dead code and stale comments removed (`kgData.buildFromApi`, `ns.helpers`, sparkline `data-api-base`, outdated headers).

## Phase 5 — ECharts 6

- [x] E1 Drop deprecated `grid.containLabel`.
- [ ] E2 Replace hand-tuned grid margins with v6 `outerBoundsMode` where it gives the same result.
- [ ] E3 Beeswarm uses native axis jitter.
- [-] E4 Native `series-chord` — not adopted: the graph-based chord keeps the shared click/roam behaviour; revisit if the chord needs ribbons.
- [-] E5 Custom ECharts build with only the registered series/components, guarded by a contract check. — not adopted: the vendored `echarts.min.js` stays byte-identical to upstream (its SHA is auditable against npm), and since F4 the library loads only on pages that draw an ECharts chart; ~90 KB gzip did not justify a build step, two devDependencies and a component list that fails at runtime when it drifts

## Phase 6 — PHP structure and efficiency

- [x] P1 Value query fetches only the properties the generators use.
- [x] P2 `PublicCorpus::project` avoids copying arrays that are already in scope.
- [x] P3 Layout cache is pruned; uninstall removes the private store.
- [x] P4 Aggregator traits declare the members they rely on.
- [x] P5 Generator paths via a `GeneratorPaths` value object; explicit stat-count hand-off between generators.
- [x] P6 Shared term lists, one comparator, memoised `findItemsLinkingTo`, declarative builder maps. — shared credit terms, class lookups and memoised linking lookups; builder ladders left explicit (each key has its own arguments) — shared credit terms, class lookups, memoised linking lookups and a declarative map for the shared entity charts
- [x] P7 `Module.php` split: client translations, configuration form, invalidation listener.
- [x] P8 Shared services (store, profile, registry) through factories; controllers receive dependencies.
- [x] P9 Consistent block guards (canonical site + artifact presence).
- [x] P10 Modernise for PHP 8.4: `strict_types` everywhere, readonly classes, enums where values are closed sets. — PHP floor 8.4, `strict_types` in every file, readonly value classes (CorpusSnapshot, SnapshotStore, GeneratorPaths, ConfigValues), PHPStan level 5 clean. Enums not introduced: the entity-type codes are the integers the browser reads from the JSON
- [x] P11 Dead code removed (`dashboard-charts.phtml`, unused `use`, `$parsePages`, legacy cleanup in the private store, overwritten revision read).
- [x] P12 `JsonArtifactWriter`: fsync before rename, private directory permissions.
- [x] P13 Stale docblocks and docs corrected.

## Phase 7 — Tests and CI

- [~] T1 Shared PHP harness (`tests/lib`) that fails on warnings and prints expected/actual. — warnings, notices and our deprecations fail every harness (`tests/lib/strict-errors.php`); the per-file check helpers remain
- [x] T2 Golden-file tests of the full generator output on an enriched database fixture.
- [x] T3 Every tooltip formatter executed against hostile labels.
- [x] T4 HTML-sink ceilings become an exact ratchet; detection covers `||` formatters, `insertAdjacentHTML`, `outerHTML`.
- [x] T5 PHPStan in CI against Omeka S core, with a baseline.
- [ ] T6 ESLint flat config with `no-unsanitized`.
- [x] T7 Graph hit-testing geometry extracted and unit-tested. — `ns.graphGeometry` in graph-canvas.js, tests/js/graph-geometry.test.mjs; also tests for the shared keyboard step
- [x] T8 JS unit test loads `dashboard-core.js` whole instead of slicing it.
- [x] T9 Property tests: community partitions, aggregate totals, artifact path rejection, stat cards.
- [x] T10 CI: reusable workflow gates releases; integration on PHP 8.5; Node pinned; Playwright traces on failure; bot PRs trigger CI; Dependabot.
- [x] T11 Action and Python dependency pins brought current.
- [x] T12 `npm run test:php` runs the PHP suite in Docker.
