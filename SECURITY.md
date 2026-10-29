# Security policy

## Supported versions

Security fixes are made on the current `2.x` release line. The module supports
Omeka S `4.2.1` and later `4.x` releases on PHP `8.4` and `8.5`; CI tests both
PHP versions, including a boot of the release archive in a real Omeka S on the
MySQL version production runs. Older module releases and unsupported PHP or
Omeka versions should be upgraded before a report is evaluated.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's
**Security → Report a vulnerability** flow for this repository so maintainers
can investigate privately. Include affected versions, reproduction steps,
impact, and any proposed mitigation. Please avoid accessing data that is not
your own and allow a reasonable remediation window before disclosure.

## Security boundaries

Generated data is never public static content. Regeneration fails closed unless
a canonical public site is configured; it projects every source and relationship
target through that site's public corpus, validates a complete generation in
staging, and publishes it atomically by manifest into a private store outside
the Omeka document root (`DRE_VISUALIZATIONS_DATA_DIR`). Browsers read it only
through the `/s/:site-slug/dre-data/` route, which serves the current generation
of the canonical public site with `Cache-Control: no-store`. A write that makes
something private withdraws publication at once, and blocks render nothing while
their artifact is not published. Nothing generated may be written under
`asset/`.

Markup built from catalogue data passes an escaper (`eslint-plugin-no-unsanitized`,
`scripts/check-html-safety.mjs` with a hostile-label fixture), and the module
renders no inline script, so a host may set `script-src 'self'`. The details,
including the map and privacy choices, are in
[docs/SECURITY_AND_PRIVACY.md](docs/SECURITY_AND_PRIVACY.md).
