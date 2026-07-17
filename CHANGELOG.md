# Changelog

All notable changes are documented here. Versions follow Semantic Versioning.

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
