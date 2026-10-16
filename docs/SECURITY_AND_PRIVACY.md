# Security, privacy, and maps

Generated data lives outside the Omeka document root. The public
`/s/:site-slug/dre-data/` endpoint checks the canonical public site, publication
revision and current generation, and responds with `Cache-Control: no-store`.
Retained old generations are private and cannot be requested through it.

The loader filters public items, values, media and item sets in SQL. Relationship
endpoints must belong to the canonical public site. Titles come from visible
values instead of the cached resource title. A private explicit primary medium
does not fall back to another image.

API writes to items, media, item sets, sites, annotations, templates, properties
and classes mark the published snapshot stale, and an automatic regeneration
follows once edits are quiet. Until then the snapshot keeps showing what was
public when it was generated, including records deleted since. A write that
hides something withdraws publication as soon as it completes: an item, medium
or item set made private, or a public value made private (compared between the
database before the write and the hydrated entities after it). An update whose
earlier state cannot be read is treated the same way. Changing the canonical
site also withdraws, as does **Withdraw published data**; automatic refreshes
do not republish after either.

Each write holds a shared lock while it runs. A regeneration captures the source
state only when no write is active, discards its run if a write lands before the
corpus is fully read, and checks the revision and site immediately before
publication. A privatising write during a run therefore rejects it. Direct SQL
changes bypass Omeka events: withdraw before maintenance, then regenerate
afterwards.

The revision that scopes offline inputs changes only on withdrawal, so ordinary
edits keep word-cloud and semantic inputs valid, while a privatising write
invalidates them until they are rebuilt.

The semantic builder is a separate public-only pipeline: it calls the
unauthenticated Omeka API and rejects every record whose `o:is_public` value is
not exactly `true`. It also sends explicit `site_id` and `is_public` filters.
Set `OMEKA_SITE_URL` to the canonical site. Builders check its revision before
and after harvesting, and store site/revision/profile metadata. Word-cloud
inputs are committed as PHP-denied envelopes under `data/`; semantic inputs are
the same envelopes, published as `semantic-inputs-*` GitHub releases of this
public repository. Both are read as text, never included by PHP. Only inputs
matching the source revision enter a new snapshot. PHP handling must be
configured for the module directory, as for Omeka itself.

The module downloads semantic inputs over Omeka's HTTP client from
`api.github.com` and this repository's release downloads only; asset URLs from
anywhere else are refused, and a download is installed only when it carries the
current site, revision and profile. `POST <site>/dre-data/embeddings-refresh`
is public and unauthenticated: it can only make the site look at GitHub, at
most once a minute, so a stranger can neither choose what is installed nor
force a regeneration.

Downloaded pages, files and public vector releases cannot be recalled. Purge
cached old `asset/data/` URLs during the 2.29 upgrade. Preserve no-store on the
new endpoint. Public vector releases remain a separate intentional export; do
not add authenticated API credentials. Raw embedding caches default to the OS
temporary directory outside the repository; set a private
`DRE_EMBEDDING_WORK_DIR` for persistence.

Imported and curator-entered strings are untrusted. Map popups use the shared
HTML escaper, ECharts HTML tooltips encode labels, identifiers are URL-encoded,
and CI inventories `setHTML`, `innerHTML`, and custom tooltip formatters.

No external basemap is enabled by default. Without configured styles, maps use
a blank same-origin style. Administrators may configure HTTPS or same-origin
style/glyph endpoints only after checking institutional entitlement, data
protection requirements, and the provider's terms. Visible attribution is
mandatory. Self-hosted OpenMapTiles/OSM-compatible infrastructure is preferred
where visitor-IP disclosure is unacceptable.

The Natural Earth boundary input is public domain; its current checksum and
provenance limitation are recorded in `THIRD_PARTY_NOTICES`.
