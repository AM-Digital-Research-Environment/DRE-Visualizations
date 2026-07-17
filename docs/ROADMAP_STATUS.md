# Repository-review roadmap status

This status tracks implementation of the review performed against `a93ab945`.

## Implemented in 2.21.0

- Canonical public-site projection for items, links, values, memberships, and
  media, including a final visibility/membership recheck.
- Stored-XSS remediation and automated sink/tooltip inventory with a malicious
  metadata fixture.
- Canonical release metadata, generated release archive, pinned Actions, and
  PHP 8.1–8.5 pull-request CI.
- Configurable privacy-safe basemaps with visible attribution.
- Locked, versioned, schema-checked generation publication through an atomic
  manifest, last-known-good retention, and safe cleanup of legacy outputs.
- Validated AMIRA profile for templates, item sets, authorities, overview
  records, partner routes, university labels, featured collections, and
  word-cloud corpora.
- Deterministic dates, coordinate pairs, set boundaries, sorting, and the
  concrete correctness fixes listed in the review.
- Immutable `CorpusSnapshot` boundary plus extracted knowledge-graph and
  item-set-dashboard generators.
- Generated chart bundle, centralized manifest-aware JSON fetching, request
  cancellation, document-locale formatting, translated runtime controls, and
  CSV fallbacks for ECharts data.
- License, third-party notices, security policy, changelog, administration,
  architecture, privacy, and release documentation.

## Follow-up engineering

- Continue extracting collection/network/media services from `Runner`; add a
  structured diagnostic report for intentionally dropped metadata.
- Add PHPUnit tests with an Omeka database fixture, static analysis/coding-style
  tooling, Playwright/axe keyboard and dialog tests, and a clean Omeka
  activation/install smoke test.
- Expand the translated client dictionary to every chart-specific prose label
  and add tabular fallbacks for MapLibre-only visualizations.
- Move generated state out of the module directory when a deployment-wide
  public writable data route is available; the present release documents and
  checks the module-writable requirement.
- Review merged remote branches, stale issues, and reviewer/CODEOWNERS policy as
  repository-maintainer operations; these are deliberately not mutated by the
  source patch.
