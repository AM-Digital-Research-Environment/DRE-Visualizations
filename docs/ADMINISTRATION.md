# Administration

## Requirements and configuration

Supported environments are Omeka S `4.x` and PHP `8.2`–`8.5`. Install the
release archive as `modules/DreVisualizations`, enable the module, then open its
configuration form.

Choose exactly one canonical public site. All static dashboard data is limited
to public items currently assigned to that site. Regeneration is disabled until
this setting is valid.

## Basemaps

Leave the four basemap settings blank. Maps then draw from assets this module
ships — Natural Earth country outlines and Noto Sans glyph ranges — so they
render land, coastlines, borders and labels with no third-party request and no
tile server, themed light/dark from the DRE tokens. This is the recommended
configuration.

Set the style and glyph URLs only to replace that with an external basemap, for
example a commercial tile provider or a style you host yourself. They must be
HTTPS or same-origin absolute paths, the glyph template must contain
`{fontstack}` and `{range}`, and any configured source requires visible
attribution text.

Attribution comes from the style itself whenever it credits its own sources,
which every common provider does. The attribution setting is the fallback for a
style that credits nothing, so it is required but usually not the text you see
on the map. Only one credit is ever shown.

## Regeneration

Use **Admin → Modules → DRE Visualizations → Regenerate now**. One job per site
can run at a time. A job writes a versioned staging tree, validates every JSON
file and required artifact, promotes it to an immutable generation, and finally
replaces `asset/data/current.json`. A failure leaves the previous generation
active. The current and immediately previous generations are retained.
After the first successful manifest-based generation, known legacy generated
roots are removed so stale direct URLs cannot expose records that have since
become private or left the canonical site. Static `geo/`, `wordclouds/`, and
`embeddings/` inputs are preserved.

The module directory must be writable by the Omeka background-job user. Static
inputs under `asset/data/geo`, `asset/data/wordclouds`, and
`asset/data/embeddings` are not replaced by regeneration. Back up module settings
and those inputs before upgrades. Refresh semantic data through the manual **Build
semantic embeddings** GitHub Action; it requires the repository's
`GEMINI_API_KEY` secret and opens a bot pull request for the compact artifacts.

After changing visibility, site assignment, relationships, templates, item-set
membership, coordinates, or media, regenerate before expecting public charts
to reflect the change.
