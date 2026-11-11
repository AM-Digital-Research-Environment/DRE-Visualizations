# AGENTS.md

Instructions for coding agents (Codex reads this file; Claude Code reads it
through `CLAUDE.md`). Human contributors: [CONTRIBUTING.md](CONTRIBUTING.md)
says the same things at more length, with the recipes for a new chart, block
or stat card.

## What this is

DRE Visualizations, the Omeka S 4.2.1 module (PHP 8.4 and 8.5; production
runs 8.5) that draws the dashboards, maps and graphs of AMIRA, the Africa
Multiple research-data platform. Default branch `main`. A pure-PHP precompute
under `src/Precompute/` (`DataLoader` → `Runner` → the `*Generator` classes,
built on the `Aggregators` traits) writes JSON snapshots into a private store
outside the document root (`DRE_VISUALIZATIONS_DATA_DIR`); the browser reads
them through `Controller\Site\DataController`. The front end is vanilla
JavaScript (`asset/js/`, one IIFE per concern on `window.RV`) with vendored
ECharts, MapLibre and d3-force. It renders inside the DRE theme and styles
itself from the theme's design tokens: read the theme's `DESIGN.md` and
`docs/DESIGN-INTEGRATION.md` before a visual change.

## Commands

```bash
npm ci
npm run build          # bundles, minified copies, layouts, client strings
npm run check          # the CI contract: unit tests, lints, bundles, tokens, i18n, release metadata, tree, vendor, audit
npm run test:browser   # Playwright on the block fixtures (Chromium, axe)
npm run i18n:extract   # after adding, changing or removing a translatable string
npm run build:tree     # after adding, moving or removing a tracked file
OMEKA_CORE=/abs/path/omeka-s npm run test:php   # PHP harnesses + integration suites, in Docker (-- --php 8.4)
OMEKA_CORE=/abs/path/omeka-s npm run phpstan    # level 5, CI pins the same phar
python -m unittest discover -s tools/embeddings/tests -v
```

`npm run check` does **not** run PHP. CI's `php` job runs `php -l`,
`scripts/test-php.php` (every `tests/*Test.php`), the module contract, the
integration suites against Omeka S 4.2.1 and PHPStan; the `omeka-boot` job
installs the release archive into Omeka on MySQL. With a local PHP, the exact
commands are in `.github/workflows/ci.yml`. Omeka S 4.2.1:
`https://github.com/omeka/omeka-s/releases/download/v4.2.1/omeka-s-4.2.1.zip`.

## Gotchas

- **Generated files are committed.** `asset/js/dashboard-core.js` (from
  `asset/js/core/`), `asset/js/dashboard-charts.bundle.js` (from the
  `dashboard-charts-*.js` sources), their `.min.js` and `.map`,
  `asset/css/dre-visualizations.min.css`, `config/dashboard-layouts.json` and
  `config/client-strings.json` come from `npm run build`. Edit the sources,
  rebuild, commit both; `npm run check` fails a stale output.
- **The README tree is generated** from `git ls-files` (`npm run build:tree`,
  annotations in `scripts/build-tree.mjs`). Stage a new file before rebuilding
  it, or the tree will not list it.
- **Golden output.** `tests/integration/GoldenTest.php` compares the whole
  precompute on a synthetic corpus with `tests/golden/`. An intended change is
  regenerated with `UPDATE_GOLDEN=1` and reviewed as a diff. On Windows PHP,
  `communities/entity-graph.json` (ForceAtlas2 floats) differs from the
  Linux-made golden even on a clean `main`; judge it in Docker or CI.
- **Artifact shape is versioned.** Renaming, retyping or adding a required key
  the browser reads means bumping `SnapshotPublisher::SCHEMA_VERSION` and
  telling administrators to regenerate (CHANGELOG).
- **Overrides of Omeka classes.** `php -l` cannot see a bad hook signature;
  it fatals every admin page. `php scripts/check-module-contract.php
  /path/to/omeka-s` declares every class against the real core.
- **Blocks are declared once**, in `src/Site/BlockRegistry.php`, plus the
  literal invokable in `config/module.config.php` (module config is read
  before the registry can load). `tests/BlockRegistryTest.php` fails on drift.
- **Asset plans.** What a surface loads is declared in
  `config/asset-plans.json`; templates call `$this->dashboardAssets(...)`,
  never a hand-written script tag, and render their spinner and live region
  through `partials/async-surface.phtml`. No inline script anywhere
  (`scripts/check-html-safety.mjs`): configuration travels as
  `application/json`.
- **HTML sinks are counted.** `check-html-safety.mjs` holds an exact count of
  `innerHTML`/`setHTML`/tooltip formatters; a new sink fails until reviewed.
  Clear nodes with `ns.setChildren`, build them with `ns.el`, escape with
  `ns.escapeHtml`.
- **Colours come from tokens.** `ns.cssColor('--token', fallback)` in JS,
  the `--rv-*` aliases in CSS, never a raw hex (`npm run lint:tokens`).
  `scripts/lib/token-rules.mjs`, `scripts/lib/dre-tokens-fallback.json` and
  `VENDORED.sha256` are vendored from DRE-theme (`npm run vendor:lint` there):
  never hand-edit them. Palette stops 1–6 must equal the `--brand-*` tokens
  (`tests/js/palette.test.mjs`).
- **Vendored libraries** under `asset/vendor/` are recorded in
  `asset/vendor/versions.json` and `THIRD_PARTY_NOTICES`
  (`npm run check:vendor`).
- **Interface strings** go through `ns.t()` / `$this->translate()` in British
  English ("visualisation"); `npm run i18n:check` fails on common American
  spellings. Identifiers, file names and the name "DRE Visualizations" stay.
- **Where a check belongs.** Behaviour is tested (`tests/js/*.test.mjs`, the
  PHP harnesses with `tests/lib/assert.php`, the browser suite); the
  `scripts/check-*.mjs` scripts hold source policies only.
- **The browser suite reuses a running server** on its port outside CI. With
  other checkouts running Playwright, set `PLAYWRIGHT_PORT` to a free port.
- **`.gitattributes` is the package manifest.** The release zip is
  `git archive --prefix=DreVisualizations/`; `tests/`, `scripts/`, `tools/`,
  the modular JS sources and development files are `export-ignore`d, and
  `scripts/check-release-archive.mjs` fails a missing runtime file.
- **Derived from private data, served publicly**: only
  `asset/data/fulltext/*-words.json`, by design and by hand; see
  [docs/SECURITY_AND_PRIVACY.md](docs/SECURITY_AND_PRIVACY.md).

## Releasing

Fill `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) as you work. Then, on a
clean, green `main` (all of the commands above):

```bash
npm version minor -m "Release v%s"   # also writes module.ini, CITATION.cff, the CHANGELOG heading
git push origin main vX.Y.Z
```

Never edit the version by hand. The tag runs `.github/workflows/release.yml`:
the whole CI again, the archive and its checks, then the GitHub release with
that version's CHANGELOG section as its notes. Details:
[docs/RELEASING.md](docs/RELEASING.md).

## Conventions

- British English in user-visible copy and documentation.
- Commit messages: an imperative subject, a body explaining why.
- Comments explain why, at the density of the surrounding code.
