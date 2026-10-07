# Releasing

1. Update `CHANGELOG.md`, `config/module.ini`, `package.json`, `package-lock.json`,
   and `CITATION.cff` to the same SemVer version.
2. Run `npm run build`, `npm run check`, `npm run test:browser`, and with an
   Omeka S core checkout `OMEKA_CORE=… npm run test:php` (also with
   `-- --php 8.4`) and `OMEKA_CORE=… npm run phpstan`, plus
   `python -m unittest discover -s tools/embeddings/tests -v` with the embedding
   dependencies installed. If generated artifacts changed shape, confirm
   `SnapshotPublisher::SCHEMA_VERSION` was bumped and say in the changelog that
   the upgrade needs a regeneration.
3. Commit the generated files (`asset/js/dashboard-charts.bundle.js`,
   `config/dashboard-layouts.json`, `config/client-strings.json`). Create and
   push a signed or annotated `vX.Y.Z` tag pointing at that commit.
4. The release workflow runs the whole CI workflow (both PHP versions, the
   integration and golden suites, PHPStan, browser and embedding tests), then
   verifies the tag/metadata match, builds a `git archive` with the required
   top-level `DreVisualizations/` directory, checks it with
   `scripts/check-release-archive.mjs` (every runtime asset present, nothing
   generated or development-only), and creates the GitHub release with
   `DreVisualizations.zip`. Include the changelog's upgrade instructions in the
   release notes.
5. Install the archive in a clean Omeka S instance, configure a public site,
   run regeneration, and smoke-test dashboards, embeds, keyboard interaction,
   light/dark mode, and malicious stored labels before promoting the release.

Never build a runtime archive from an uncommitted working tree, and never add
Omeka-provided `laminas/*` or `psr/*` packages to a module-local Composer
manifest.
