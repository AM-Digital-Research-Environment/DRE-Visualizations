# Changelog

All notable changes are documented here. Versions follow Semantic Versioning.

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
