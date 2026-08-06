# Changelog

All notable changes are documented here. Versions follow Semantic Versioning.

## 2.26.1 — 2026-08-05

### Added

- **`CITATION.cff`.** Machine-readable citation metadata (ORCID, affiliation,
  licence, version), which GitHub renders as *Cite this repository* with BibTeX
  and APA export. Release checks pin its `version` to `config/module.ini` and its
  `date-released` to this file's entry for that version, and assert the author
  ORCID is well-formed — nothing else reads the file, so it would otherwise go
  stale silently and offer a citation naming a version that was never tagged.
- A social preview card at `.github/social-preview.png` (1280×640, drawn in the
  module's own dark-mode palette). Development-only: `.github/` is
  `export-ignore`d, so it stays out of the runtime archive.

### Changed

- `.gitattributes` now normalises text to LF in the repository (`* text=auto`),
  so a Windows checkout cannot commit CRLF into PHP/JS bound for a Linux
  container, and marks images binary. `/.codex` joins the `export-ignore` list —
  it is git-ignored, but `git add -f` bypasses that and the release archive
  should not depend on it.
- README: documented the citation metadata, and corrected the dependency list,
  which still named MapLibre GL 5 after 2.26.0 shipped 6.1.0 and omitted
  d3-force entirely.

## 2.26.0 — 2026-08-05

### Changed

- **MapLibre GL JS 5.24.0 → 6.1.0.** Version 6 ships ES modules only, so the
  library is now imported rather than loaded as a classic script: `ns.ensureLibs`
  dynamic-imports it and publishes the namespace as `window.maplibregl`, and the
  eager dashboard surfaces (compare, explorer, network, what's new) do the same
  from an inline module. Every map builder keeps the API it already used — no
  call site changed. Brings upstream fixes for globe latitude precision on some
  GPUs, terrain reconfiguration, 3D buildings near the horizon, and raster tile
  error handling.
- MapLibre is vendored by `npm run vendor:maplibre`, which verifies the npm
  tarball against the registry's sha512 and rewrites exactly one import
  specifier so the three ES-module files can ship under `.js` names (stock
  nginx types no `.mjs`, and a module script served as the wrong type is
  refused) with the library version stamped into the two chunks that Omeka's
  `?v=` cache-buster cannot reach. Documented with hashes in
  `THIRD_PARTY_NOTICES`; release checks now assert the file names stay in sync.

### Compatibility

- MapLibre 6 requires **WebGL2** — Baseline in every browser since Safari 15
  (2021), but WebGL1-only clients will no longer render maps.
- Administrator-configured third-party basemap styles are validated against
  style-spec v25, which reports legacy expressions as errors. The self-hosted
  default basemap is unaffected.

## 2.25.0 — 2026-08-04

### Changed

- **Collection Overview drops the Type of Resource card.** Every other overview
  card answers "how much of X does the collection hold" and links to an authority
  page a reader can browse. Type of Resource is a controlled vocabulary
  describing the *other* records rather than a corpus of its own, and it is the
  one key the theme's masthead has no route for — so it rendered as the single
  dead row in an otherwise navigable catalogue. Ten cards now: research items,
  projects, people, organisations, locations, languages, subjects & tags,
  publications, podcasts, YouTube videos. The metric set changes in the
  precompute's `stats` array rather than in either renderer, because that array
  is what the theme reads from `collection-overview.json` to render the
  masthead's "In AMIRA" column. The `resourceTypes` entry stays in
  `dashboard-stat-cards.js`'s icon map — the `types` and `genres` aliases of
  other dashboards still resolve through it. **Needs a regeneration:** the
  published generation is what readers see, so the card only disappears after a
  precompute run.

## 2.24.0 — 2026-07-31

### Added

- **One multilingual semantic space across six public corpora.** The manual,
  secret-backed embedding workflow creates uniformly bounded cards for podcasts,
  YouTube videos, publications, projects, research sections, and research items;
  incrementally embeds changed cards with `gemini-embedding-2`; projects them with
  deterministic UMAP; reports quality/low-signal coverage; commits the compact
  map and recommendation contracts; and publishes normalized 768-dimensional
  float32 vectors as a versioned GitHub Release.
- **Semantic Map** site-page block and **Similar Items** resource-page block.
  The map supports title search, resource-type/cluster colouring, accessible
  controls, lazy ECharts loading, and embedding. Recommendations are progressive
  enhancement and never surface low-signal records.
- CI now validates the six-corpus profile, card construction, public filtering,
  incremental cache behaviour, recommendation eligibility, and vector release
  schema alongside the PHP and browser-contract matrices.

### Changed

- Podcasts now include linked subjects, subject trends/co-occurrence, locations,
  and an items-by-country choropleth. Transcript word clouds expose translated,
  accessible language controls, while the PHP fallback performs a curated layer
  of English/French inflection folding when the spaCy-built input is unavailable.
- Project and installation metadata use the canonical **DRE-Visualizations**
  repository name throughout.

## 2.23.0 — 2026-07-30

### Fixed

- **The Entity Network's dots now match its own legend.** Its legend, type chips and
  sidebar swatches resolved colour through the shared entity registry, but the
  MapLibre paint expression still coloured circles by their position in `types` — so
  Organization, Location and Tag each had a swatch in one hue and dots in another,
  and none of the three matched the same type elsewhere on the site. This is the
  defect 2.22.1 fixed for the graph categories, still live in the paint expression.
  `npm run check:graph` now fails if the expression stops going through the registry.

### Changed

- **The co-occurrence networks now use the d3-force canvas renderer.** The
  Publications co-author network, the Podcasts and YouTube speaker networks and the
  Network Explorer's co-authorship tab were the last ECharts `graph`/`force`
  series: the layout ran to a frozen state with no collision pass, so nodes
  overlapped, only the largest could carry a label, and dragging one moved it
  through a static picture. They now simulate with d3-force on their own canvas —
  drag a person and their collaborators relax around them, and the node keeps the
  position you gave it. Same renderer as the item-page knowledge graph, so there is
  one set of gestures to learn for every graph on the site.

  Kept: PageRank sizing, Louvain colouring, the co-author edge-relationship
  palette and its key, and click-through to a matched person's record. New:
  labels placed by collision test, a **clickable cluster legend** — which the
  co-author network never had, because colour there was spent on the edges — a
  detail card naming the kinds of connection, an edge list rather than a
  series/category/value CSV, deterministic layouts, keyboard and screen-reader
  access, and a PNG export that draws every label. The payload contract is
  unchanged, so no regeneration is needed for this part.

  One deliberate loss: the plain accent border that marked every matched person is
  now shown only when the data actually mixes matched records with external
  (literal) names, so the ring appears where it discriminates instead of on every
  node.

- Publication authors and editors reach the knowledge graph. Publications credit
  their people through `bibo:authorList` / `bibo:editorList` rather than
  `dcterms:creator`, and those two terms were missing from the graph's property
  whitelist — so a publication's graph showed no people at all, and a person's
  graph never reached the work they wrote. Both terms are now also *shareable*, so
  two publications by one author surface as each other's shared items. **Needs a
  regeneration.** (Podcast episodes and YouTube videos were already covered: their
  speaker credits use `marcrel:spk`, which the `marcrel:` prefix rule already
  matched.)

### Added

- **The Entity Network can be driven from the keyboard.** A WebGL canvas is opaque
  to a pointer-less reader, and this block carried `role="application"` with no key
  handling at all — there was no way in. Left/right now step through the entities
  and set the "hub", up/down walk that hub's own neighbours, Enter selects, `+`/`-`
  zoom, `0` refits and Escape unwinds; a `polite` live region announces each entity
  with its type and its item and link counts, and the cursor is drawn as an accent
  ring that outranks the hover ring. This is the same key model `graph-force.js`
  gives the knowledge graph, so there is one set of gestures for every graph on the
  site. MapLibre's own arrow-key panning is switched off to free the keys — `+`/`-`
  still zoom, so nothing is lost.
- **A text alternative for the Entity Network**: every visible entity as a real
  link, grouped by type and hubs-first, in a disclosure below the graph. The tabular
  fallback for MapLibre-only visualizations that `docs/ROADMAP_STATUS.md` asks for,
  and a Ctrl+F-able index for everyone else. It follows the active filters.
- **Export from the Entity Network** — the block previously had none. PNG (the map
  is now created with `preserveDrawingBuffer`, without which the canvas reads back
  blank) and CSV. The CSV is the *entity* table, not the edge list: the Louvain
  cluster and the dominant research section are computed by this precompute and
  published nowhere else, whereas the edges are the picture on screen. It follows
  the visible filters, so a reader exports what they narrowed to.
- **Isolate one co-occurrence cluster.** The block is called Discursive Communities
  and the clusters were the one axis a reader could not filter on — the chips filter
  by type, the select by link weight, and colouring by cluster only recoloured.
  Each cluster is named by its most central member, the camera flies to it, and
  edges need *both* ends inside it so an isolated cluster shows its own structure
  rather than a fringe running to hidden nodes.
- **Fullscreen for the Entity Network**, on the same `.rv-fullscreen` convention as
  the knowledge graph. The whole block expands, not just the canvas: the toolbar,
  sidebar and legend are how this graph is driven, so MapLibre's own control would
  have taken the map out from under them.
- The search box is a real combobox: type, then arrow through the hits and press
  Enter. Focus stays in the input via `aria-activedescendant` (so typing keeps
  working while the highlight moves), the results are `role="option"`, and a
  `focusout` guard replaces the 150 ms blur timeout that could close the list from
  under a click. Hits are also restricted to entities the current filters leave
  reachable, instead of offering dead ends.
- `entity-graph-ui.js` — the Entity Network's chrome (keyboard walker, text
  alternative, cluster filter, export and fullscreen controls), split out so
  `entity-graph.js` stays the controller that owns the payload, the MapLibre layers
  and the filter expressions. Mirrors the knowledge-graph.js / -ui.js split.
- `ns.mapPng(map)` — a MapLibre map as a PNG data URL, forcing a fresh frame first
  so the export cannot predate the filter change that prompted it.
- `graph-chrome.js` — the renderer-agnostic chrome (clickable legend, detail card,
  edge-colour key, gesture hint) shared by any graph built on `ns.ForceGraph`, so a
  second consumer no longer has to pull in the knowledge graph's own filter panel,
  relationship list and floating toolbar to reuse the four generic pieces.
- `graph-canvas.js` takes an optional per-link colour (`scene.linkColorOf`), which
  is what keeps the co-author network's relationship palette. Hover and focus
  emphasis still win over it.
- `ForceGraph.destroy()` — stops the simulation and disconnects the resize
  observer. The Network Explorer replaces one network with another in the same
  panel, and a simulation left running kept ticking and repainting into a detached
  canvas for the life of the page.
- `ns.chartCsvRows` honours a renderer-supplied `csvRows()`, so a graph can offer
  its natural tabular form (an edge list) instead of being walked as an ECharts
  option.

## 2.22.1 — 2026-07-30

### Fixed

- **Entity colours are consistent across every network.** A type was coloured by
  the palette slot its category happened to occupy, and the knowledge graph
  appends categories in per-item discovery order — so Person came out in the
  project colour on one item and a project in the research-item colour on the
  next, and nothing matched the Entity Network or the contributor networks. All
  three entity-typed graphs now resolve through one registry
  (`ns.entityColor`), seeded from the person/project/institution convention the
  contributor network already encoded, so those colours are unchanged and
  everything else lines up behind them. `npm run check:graph` fails if two types
  ever collide again.
- **The knowledge graph no longer grows without bound in fullscreen.** The canvas
  was in flow while carrying an inline pixel height measured from its own
  container, so each ResizeObserver pass made it taller. The canvas is now out of
  flow, the stage takes its height from the panel rather than its content, and
  `resize()` returns early when nothing changed. Also fixed the height that
  produced: `display: flex` on the `<details>` block never reached the panel,
  because modern Chromium wraps a `<details>` element's content in an internal
  `::details-content` box — so the stage had collapsed to its minimum instead of
  filling the viewport.
- Dropped the "Show patterns" control from the Contributor, Affiliation,
  Collaboration and Discursive Communities networks. Decal patterns exist to
  separate filled areas without relying on colour; on small graph nodes they read
  as noise. Chord, sankey, radar and the word cloud already opted out.
- The same linked resource stated twice on one property no longer counts twice
  toward a node's degree in the REST-API fallback either (the precompute was
  fixed in 2.22.0).

### Changed

- **Clicking an entity selects it instead of navigating away.** It anchors the
  neighbourhood, names its connections along their edges, and opens a card with
  the entity's type, stats, relationship kinds and an explicit link to its
  record; clicking it again, clicking the background or Escape clears it. The
  previous behaviour jumped straight to the Omeka page, which fought exploration
  and had no touch story — the tap-twice-to-open workaround is gone.
- Relationship names are drawn along the edges of the selected entity, with a
  toolbar toggle to name every connection. Edge labels share the node labels'
  collision pass, so the two never overlap.

### Internal

- `scripts/check-graph-contracts.mjs` (`npm run check:graph`, wired into CI):
  asserts the entity-colour registry's invariants and that the vendored d3 files
  only work in their declared order. Both are regressions that reached the site.

## 2.22.0 — 2026-07-30

### Changed

- The item-page Knowledge Graph is now a **live d3-force simulation on a canvas**
  instead of an ECharts `graph`/`force` series. ECharts ran its layout to a frozen
  state with no collision pass, so nodes overlapped, only the centre could carry a
  label, and dragging a node moved it through a static picture. Now a drag makes
  the neighbourhood relax around it and the node keeps the position you gave it
  (a ring marks it as pinned; Alt-click releases it, and a toolbar button releases
  every pin). The payload contract is unchanged, so **no regeneration is required**
  to get the new renderer.
- The graph block loads ~17 KiB of d3-force rather than the 1.1 MiB ECharts
  bundle, so an item page whose only visualization block is the graph is much
  lighter. MapLibre still loads only when the item has coordinates.

### Added

- **Cross edges in the precompute.** The graph also draws the statements *between*
  an item's neighbours — a person who is a member of its project, a project
  carrying its subjects, a project's items sharing its themes — instead of only
  the spokes from the item outwards. The picture is a network rather than
  hub-and-spokes, and community detection finally has real structure to find.
  Cross edges are drawn thinner and fainter so the item's own statements still
  read as the primary layer. Requires "Regenerate now".
- Raised node caps now the renderer can carry them: 220 direct (was 150), 90
  shared (was 60), 40 reverse (was 25), 60 referencing (was 40).
- Labels are placed by an actual collision test — as many as fit, prioritised by
  centrality, and more appear as you zoom in. A toolbar toggle forces all of them.
- A clickable legend below the graph toggles whole entity types in and out.
- Keyboard and screen-reader access to the graph: the canvas is focusable, ←/→
  walk every entity, ↑/↓ walk the focused entity's own neighbours, Enter opens
  one, and each move is announced through a live region. A *Relationships as a
  list* disclosure gives the same content as real links.
- Freeze the layout, reset the view, and a 2× PNG export that includes every
  label and a category legend.
- Pan by dragging the background; zoom with Ctrl/⌘ + scroll, a double-click,
  pinch, or `+`/`−`. A plain scroll still scrolls the page, so the graph never
  hijacks the wheel mid-article; in fullscreen the wheel zooms.
- `prefers-reduced-motion` is respected: the layout settles before first paint
  and never animates on its own, while a drag still relaxes its neighbourhood.
- Layouts are deterministic — the same item lays out identically on every load.

### Fixed

- The same linked resource stated twice on one property produced two edges, in both
  the precompute and the REST fallback. That now collapses to one — it had become
  visible, because edge count feeds the hub sizing and the "connections in view"
  count. The same resource under two *different* properties is still two statements.

### Internal

- New reusable front-end modules, none of which know about Omeka: `graph-canvas.js`
  (view transform, canvas painter, hit tests) and `graph-force.js` (simulation +
  interaction). `knowledge-graph-data.js`, `knowledge-graph-ui.js`,
  `item-location-map.js` and a thin `knowledge-graph.js` controller replace the
  former single file. The co-occurrence networks can adopt the renderer unchanged.
- `ns.iconSvg` / `ns.iconButton` in `dashboard-core.js` give the module one
  `innerHTML` sink for inline icons instead of one per button.
- `ns.trackRenderer` re-themes a canvas surface on a light/dark toggle without
  re-simulating, alongside the existing ECharts and MapLibre paths.
- `ns.ensureLibs({ d3: true })` loads the vendored d3-force stack in dependency
  order. Vendored: d3-force 3.0.0, d3-quadtree 3.0.1, d3-dispatch 3.0.1,
  d3-timer 3.0.1 — pinned by SHA-256 in `THIRD_PARTY_NOTICES`.
- `tests/KnowledgeGraphsTest.php` covers the IDF statistics, the cross-edge pass,
  community detection and the item location map.

## 2.21.6 — 2026-07-26

### Fixed

- Show one basemap credit instead of two. MapLibre already renders the credits a
  style declares for its own sources, so also passing the configured attribution
  printed the same tiles twice in different words. The style's own credit now
  wins and the setting is the fallback for a style that declares none, so an
  external basemap such as CARTO is credited exactly once.
- Stop crediting a basemap on the Entity Network, which renders no map data.

## 2.21.5 — 2026-07-26

### Added

- Country labels on the self-hosted basemap, sized by zoom and haloed against
  the land fill, and a stronger border colour so coastlines read at world zoom.

## 2.21.4 — 2026-07-26

### Added

- Self-hosted basemap. Maps now default to a style built from the Natural Earth
  outlines already shipped for the choropleth, with self-hosted Noto Sans glyph
  ranges for labels, themed from the DRE tokens. Land, coastlines, borders and
  labels render with no tile server and no third-party request, so the basemap
  settings can stay blank.

### Fixed

- Restore Entity Network and Spatial Exploration labels, which drew nothing
  unless an administrator had configured an external glyph endpoint.
- Stop showing two credits for the same basemap. The built-in style declares its
  own attribution, so the attribution setting is only needed for an external
  style; documented that an external style adds the provider's credit to
  whatever text is configured.

## 2.21.3 — 2026-07-26

### Fixed

- Publish `beeswarm-all-sections.json`, which is a JSON array of scatter points
  rather than a dashboard object. Snapshot validation had no schema for it, so a
  fully generated snapshot was discarded at the final publish step.
- Accept a featured-collections index with no qualifying collection, which
  encodes as `[]` rather than `{}`.

### Changed

- Mirror the full `item-dashboards` artifact inventory in the snapshot publisher
  fixture, so an artifact shape the validator has no schema for fails in CI
  rather than at the end of a regeneration.

## 2.21.2 — 2026-07-26

### Fixed

- Restore the module configuration form and every admin page that loads the
  module. `getConfigForm()` declared a `ViewModel` parameter where Omeka's
  `AbstractModule` declares a `PhpRenderer`, so PHP rejected the override at
  class-declaration time and the class could not be loaded at all — Configure
  and Upgrade returned a blank 500 with nothing in `application.log`.
- Regenerate now reads the site item pool from `item_site`, Omeka's actual join
  table; the reversed name `site_item` made every precompute run abort with
  "Base table or view not found".

### Changed

- Add a `module-contract` CI job (and release gate) that declares every module
  class against a real Omeka S core, so an incompatible override fails CI
  instead of a live admin page. `php -l` cannot detect this class of bug.

## 2.21.1 — 2026-07-21

### Changed

- Require PHP 8.2+ (8.1 is end-of-life and the precompute layer uses trait
  constants); CI and the security policy now cover PHP 8.2–8.5.

### Fixed

- Model a deleted item by its absence from the snapshot in the public-corpus
  regression fixture, which failed on every CI run.

## 2.21.0 — 2026-07-17

### Security

- Scope every generated artifact to one configured public Omeka site and
  remove private, deleted, and cross-site sources and relationship targets.
- Escape stored metadata at MapLibre and ECharts HTML sinks and add regression
  contracts using a malicious label fixture.
- Remove hard-coded third-party basemap calls; add configurable endpoints and
  visible attribution.

### Changed

- Publish validated, immutable generations behind an atomic `current.json`
  manifest with per-site locking, artifact schema checks, stale-generation
  pruning, and removal of legacy direct-output paths.
- Precompute item-set dashboards and cancel stale Compare/Explorer requests.
- Make date, coordinate, corpus, and tied-count selection deterministic.
- Ship one generated chart-builder bundle while preserving modular sources.
- Centralize installation IDs, featured collections, corpus definitions, and
  university labels in a validated AMIRA profile; introduce an immutable corpus
  boundary and focused knowledge-graph/item-set generators.
- Use the document locale for numbers and dates, emit translated runtime labels,
  and provide CSV downloads for ECharts canvas data.
- Correct canonical repository/install metadata and add CI/release automation.

### Fixed

- Correct counts in What's New, group/institution filtering, duplicate section
  membership, equatorial map coordinates, and unused geo-flow asset loading.

## 2.20.1

- Previous repository state. Earlier history remains available in Git tags and
  commit history.
