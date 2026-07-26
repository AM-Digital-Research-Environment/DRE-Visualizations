# Changelog

All notable changes are documented here. Versions follow Semantic Versioning.

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
- Publish `beeswarm-all-sections.json`, which is a JSON array of scatter points
  rather than a dashboard object. Snapshot validation had no schema for it and
  discarded the entire completed generation.
- Accept a featured-collections index with no qualifying collection, which
  encodes as `[]` rather than `{}`.

### Changed

- Add a `module-contract` CI job (and release gate) that declares every module
  class against a real Omeka S core, so an incompatible override fails CI
  instead of a live admin page. `php -l` cannot detect this class of bug.
- Mirror the full `item-dashboards` artifact inventory in the snapshot publisher
  fixture, so an artifact shape the validator has no schema for fails in CI
  rather than at the end of a regeneration.

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
