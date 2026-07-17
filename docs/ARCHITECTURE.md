# Architecture

The public path is deliberately precompute-first:

1. `DataLoader` reads deterministic Omeka rows and rechecks public site
   membership after the load.
2. `PublicCorpus` projects every item-keyed structure and reconstructs
   relationships so both endpoints are in scope.
3. `CorpusSnapshot` validates and freezes those scoped structures at the
   generator boundary.
4. `Runner` coordinates pure `Aggregators` and focused domain generators.
5. `SnapshotPublisher` holds a per-site lock, validates staged JSON, promotes an
   immutable generation, and atomically replaces `current.json`.
6. `dashboard-core.js` resolves all generated-data requests through that
   manifest; server-rendered galleries use `PublishedSnapshot`.

Static inputs (`geo/`, `wordclouds/`) remain outside generated snapshots.
Generated roots are `item-dashboards`, `item-set-dashboards`, `communities`,
`knowledge-graphs`, `photo-galleries`, `featured-collections`, and
`network-explorer.json`.

The aggregation layer is dependency-free PHP over plain arrays and has a
standalone test harness. Browser sources remain modular; `npm run build`
concatenates the ordered chart-builder list into the one runtime bundle. The
vendored ECharts and MapLibre files are same-origin and byte-identical to their
upstream distributions.

`Runner` remains the coordinator while domain extraction proceeds incrementally.
`KnowledgeGraphGenerator` and `ItemSetDashboardGenerator` already consume the
immutable snapshot directly; the existing collection and media methods remain
in the coordinator until they can be moved without changing artifact contracts.

Installation-specific AMIRA identifiers used by precomputation, featured
collections, and the word-cloud builder live in `config/amira-profile.json`.
`AmiraProfile` validates the file before use, and both PHP and Python resolve
corpus item sets through the same semantic keys. `FeaturedCollections\Registry`
is now a normalised query facade over the same profile rather than a second
source of database-local IDs. The coordinator also configures the pure
aggregators with the profile's person/project templates and university labels;
no executable aggregator constant assumes AMIRA database IDs.
