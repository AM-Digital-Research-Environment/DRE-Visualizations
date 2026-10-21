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

### After edits

An Omeka API write (an admin save, a REST call, an import or batch-edit job)
marks the published snapshot stale but keeps it online. When the request or job
ends, the module queues one background regeneration (a `PrecomputeDashboards`
job with `trigger: edit`). That job waits until no write has landed for five
minutes, regenerates, and repeats if edits arrived meanwhile, so a burst of
edits or a whole import costs one run. Only one such job runs at a time; later
writes leave it to catch up. The maintenance page shows whether the published
data is current or stale.

A write that makes something private withdraws publication at once, because a
stale snapshot could still show it: an item, medium or item set switched from
public to private, an item's medium hidden from its edit form, or a public
value made private. The automatic job then republishes after one quiet minute.
Deleting items, media or values, or removing items from the site, does not
withdraw; they leave the snapshot within the same five-minute refresh.

The automatic refresh needs Omeka's default PHP-CLI job strategy (the same one
**Regenerate now** uses); with the synchronous strategy it is skipped, so as not
to run a regeneration inside the request that saved an item. It only starts
once a snapshot has been published by hand at least once.

**Withdraw published data** immediately revokes publication without starting a
job; use it before direct SQL maintenance. Automatic refreshes never republish
after it, nor after a canonical-site change: click **Regenerate now** when you
are done. Direct SQL changes bypass Omeka events, so they neither mark the
snapshot stale nor queue a refresh.

Stop a job in Omeka's Jobs screen. Cancellation checks run during loading,
between generators, during layout iterations, before publication and while an
automatic refresh waits for edits to settle.

Optional word-cloud and semantic builders require `OMEKA_SITE_URL` (for example,
`https://your-host/s/your-canonical-site`). Set it as a repository Actions
variable for the workflows. The installed and builder profiles must be
identical. Inputs without matching revision metadata are ignored: word clouds
use the PHP fallback and semantic blocks show an unavailable state or stay
hidden.

Word-cloud inputs ship under `data/wordclouds`: rebuild them after edits,
release the module, then regenerate. Semantic inputs need no module release.
The embeddings workflow checks the site every night and, when it changed since
the last build (a new revision, a new snapshot or another profile), builds a
`semantic-inputs-<n>` GitHub release and pings the site
(`POST /s/<site>/dre-data/embeddings-refresh`). The module downloads the newest
release built for its current revision into the snapshot store and refreshes
in the background; every regeneration looks for one too (at most every ten
minutes, every minute for **Regenerate now**). After something is made private,
the semantic map stays online from the installed build without the records
hidden since and without any record that left the public corpus
(`SemanticCarry`; the store's `revisions.json` names what each withdrawal hid).
The positions and neighbours of the remaining records still come from the
earlier build until a new one arrives. With a GitHub token saved in the module
configuration (a fine-grained token for this repository, *Actions: Read and
write*), the refresh that follows asks GitHub for that build straight away,
once per revision; without one, the nightly check builds it. The token must
be created with the organisation as its resource owner, and it starts builds
only once an organisation owner has approved it: a pending token reads public
data, so the connection looks fine, but GitHub refuses to start a build (403). A withdrawal that
does not say what it hid (a manual withdrawal, a canonical-site change, a
write whose earlier state was unknown) still hides the map until a build for
the current revision arrives. The maintenance page and the module
configuration show the installed build, whether it fits the current data or is
being carried, and the last failed look at GitHub; both can start a build with
the saved token (**Rebuild the semantic embeddings**), and the configuration
page also shows the latest workflow run. The server must reach `api.github.com` and `github.com` release
downloads. The semantic build runs the open EmbeddingGemma 2 model on the
GitHub runner and needs no API key or secret; PHP regeneration needs no model
access.

## Item pages

The Visualisations block (`dreLinkedItemsDashboard`) must sit on item pages:
research projects, sections, people and the other entities show their
dashboards there, and a project's item-set pages redirect to its item page.
Omeka shows a site's saved resource-page blocks only, ignoring every default,
once the site has saved **Theme → Configure resource pages**. Installing the
module and upgrading to 2.38.0 add the block to each such saved item page that
lacks it (after the record's own blocks, before *Linked resources*), and the
maintenance page lists each site's state with a button that repeats the repair
for the sites you may edit. The repair only adds the block: it never removes or
reorders a block, and skips a site where the block is in any item-page region.
