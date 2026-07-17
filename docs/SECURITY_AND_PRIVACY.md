# Security, privacy, and maps

All files below `asset/data` are publicly readable. Only records that are both
public and assigned to the configured public site may enter a generation;
private dashboards belong behind an authenticated Omeka controller.

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
