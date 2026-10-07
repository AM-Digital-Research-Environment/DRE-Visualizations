# Architecture

1. DataLoader reads public, site-scoped rows through Omeka's DBAL connection.
   It reads the property map once and loads all generator inputs, including public
   literals/media, without supplemental SQL in individual generators. Only links
   and the literal properties generators use (`DataLoader::LITERAL_TERMS`) are
   fetched; asking a generator for any other literal term throws.
2. PublicCorpus deduplicates exact source/term/target statements, filters both
   endpoints and rebuilds consistent relationship indexes. Distinct roles remain.
3. CorpusSnapshot validates and freezes the complete generator input.
4. Runner loads once, builds the country index once, and coordinates focused
   EntityDashboardGenerator, OverviewDashboardGenerator, MediaDashboardGenerator,
   CollectionGalleryGenerator, ItemSetDashboardGenerator and KnowledgeGraphGenerator
   services. Aggregators hold immutable installation context per instance.
5. SnapshotPublisher owns the destination-wide generation lock. A separate short
   policy lock coordinates withdrawal, protected reads and the final revision/site
   check. An additional source-write guard prevents revision capture or publication
   during an active API mutation. Publication uses validated staging plus atomic manifests.
6. DataController and PublishedSnapshot read current private storage under a
   shared lock (writers lock exclusively), open the artifact, and stream it after
   releasing the lock. Manifests of another `SnapshotPublisher::SCHEMA_VERSION`
   are not served. Browser requests fail closed; there is no legacy or
   permission-dependent API fallback, and blocks render nothing unless their
   artifact is published for the canonical site (`Site\PublishedData`).

Generated groups include dashboards, communities, graphs, galleries, featured
collections, item contexts, the network explorer and validated semantic inputs.
Static geography stays in asset/data/geo. Offline word-cloud and embedding inputs
under data/ carry PHP-denied envelopes and source-revision metadata. The semantic
builder still uses shared multilingual vectors and UMAP; only validated derived
inputs enter a current snapshot.

Knowledge-graph postings above 256 items are sampled deterministically once per
corpus. Each graph examines at most 2,048 candidates, prioritizing rare shared
resources. These are approximate discovery views; graph stats report the bound
and truncation. Direct relationship roles remain intact. ForceAtlas2 uses exact
repulsion through 128 nodes and a Barnes–Hut tree thereafter (theta 0.6). The
layout cache hashes algorithm version, ordered edges and masses. Cancellation is
checked each layout iteration.

Three renderer families coexist: ECharts, MapLibre and the canvas/d3-force
renderer. DashboardAssets supplies the shared prelude. Dashboard payload keys
select heavy libraries after usable data arrives. Controllers call disposeWithin
before replacing a container; cleanup disposes charts, removes maps and stops
graph simulations/observers. Theme changes only rebuild live maps.

Browser sources remain modular. npm run build concatenates the ordered builder
list into the committed runtime bundle. Playwright is a development dependency;
no Node/Composer install is required on the Omeka host. Modules must not bundle
Omeka's Laminas or PSR packages.

Layout registrations use the dre prefix; aliases keep existing saved block IDs working. Gettext catalogs belong under language/.

Synthetic benchmark (PHP 8.5 container): 400/800/1,600 common-subject graphs took 0.138/0.217/0.410 seconds. A 4,000-node chain layout with all 260 iterations took 11.104 seconds and 8 MiB peak memory. These are fixtures, not production measurements; rerun with php scripts/benchmark-precompute.php. The numerical regression measured 0.2643% aggregate repulsion error against exact forces.
