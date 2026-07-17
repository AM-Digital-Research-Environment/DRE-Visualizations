# Releasing

1. Update `CHANGELOG.md`, `config/module.ini`, and `package.json` to the same
   SemVer version.
2. Run `npm run build`, `npm run check`, all six PHP harnesses, and PHP syntax
   checks across the supported versions.
3. Commit the generated bundle. Create and push a signed or annotated `vX.Y.Z`
   tag pointing at that commit.
4. The release workflow verifies the tag/metadata match, builds a `git archive`
   with the required top-level `DreVisualizations/` directory, checks PHP and
   tests again, and creates the GitHub release with `DreVisualizations.zip`.
5. Install the archive in a clean Omeka S instance, configure a public site,
   run regeneration, and smoke-test dashboards, embeds, keyboard interaction,
   light/dark mode, and malicious stored labels before promoting the release.

Never build a runtime archive from an uncommitted working tree, and never add
Omeka-provided `laminas/*` or `psr/*` packages to a module-local Composer
manifest.
