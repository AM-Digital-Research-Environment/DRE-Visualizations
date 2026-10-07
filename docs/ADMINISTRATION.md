# Administration

## Requirements and configuration

Supported environments are Omeka S `4.x` and PHP `8.4`–`8.5`. Install the
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

Set `DRE_VISUALIZATIONS_DATA_DIR` to a durable directory **outside the Omeka
document root**, writable by the web/PHP and background-job user. For example,
mount a private volume at `/var/lib/omeka/dre-visualizations` with ownership
assigned to the Omeka runtime user. Configure the same value for PHP-FPM and
job workers. The module code need not be writable for generation.

Under Docker, the directory must already exist in the image, owned by the
runtime user, before the volume is first mounted. A named volume mounted at a
path the image lacks starts out root-owned, and a container running as
`www-data` without `CAP_CHOWN` cannot then write to its own store. Create it in
the Dockerfile, e.g. `RUN install -d -o www-data -g www-data -m 0700
/var/lib/omeka/dre-visualizations`, or `chown` an existing volume once from a
privileged one-off container.

If unset, storage uses an installation-specific OS temporary directory. A host
cleanup can remove it, requiring regeneration. Separate containers must share
the private volume and support filesystem locks. Web-root paths and directory
symlinks are rejected. Restrict storage permissions to the Omeka runtime user.

Upgrade through Omeka's module screen. From 2.30 on, an upgrade keeps serving
the published snapshot unless the new version reads a different artifact schema
(the changelog says so, and the old snapshot then stops being served until you
regenerate). Upgrading from a version before 2.29 still withdraws publication
and removes old public generations, manifests, generated directories and
derived inputs under `asset/data`, preserving static geography; purge any proxy
cache of the old URLs, then regenerate. Uninstalling removes the generated data
from private storage (the directory itself stays, as it may be a volume).

Use **DRE Visualizations → Regenerate now**. One destination-wide lock covers
all publishers, including canonical-site changes. Artifacts are validated in
staging before publication. Failure or cancellation preserves a previous
snapshot only while that snapshot remains valid. Current and previous
generations may remain on private disk; only the current one is served.

Omeka API edits withdraw publication automatically. Finish an import/edit batch,
then regenerate. **Withdraw published data** immediately revokes publication
without starting a job; use it before direct SQL maintenance. Stop a job in
Omeka's Jobs screen. Cancellation checks run during loading, between generators,
during layout iterations and before publication.

Optional word-cloud and semantic builders require `OMEKA_SITE_URL` (for example,
`https://your-host/s/your-canonical-site`). Set it as a repository Actions
variable for the manual workflows. The installed and builder profiles must be
identical. Rebuild offline inputs after edits, deploy their guarded files under
`data/`, then regenerate in Omeka. Inputs without matching revision metadata
are ignored: word clouds use the PHP fallback and semantic blocks show an
unavailable state or stay hidden. Semantic refresh still requires the existing
`GEMINI_API_KEY` secret; PHP regeneration needs no model access.
