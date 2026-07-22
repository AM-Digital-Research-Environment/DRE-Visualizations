# Security policy

## Supported versions

Security fixes are made on the current `2.x` release line. The module supports
Omeka S `4.x` and PHP `8.2` through `8.5`; the CI matrix tests every listed PHP
minor. Older module releases and unsupported PHP/Omeka versions should be
upgraded before a report is evaluated.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's
**Security → Report a vulnerability** flow for this repository so maintainers
can investigate privately. Include affected versions, reproduction steps,
impact, and any proposed mitigation. Please avoid accessing data that is not
your own and allow a reasonable remediation window before disclosure.

## Security boundaries

Generated JSON is public static content. Regeneration therefore fails closed
unless a canonical public site is configured, projects all sources and
relationship targets through that site's public corpus, stages and validates a
complete immutable generation, and updates `current.json` only after success.
Private administrative visualisations must use authenticated controllers; they
must never be written into `asset/data`.
