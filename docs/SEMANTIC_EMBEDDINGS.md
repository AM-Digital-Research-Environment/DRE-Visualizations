# Semantic embeddings

This module publishes one interoperable semantic space for six public AMIRA
corpora: podcasts, YouTube videos, publications, research projects, research
sections, and research items. The shared source of truth is
`config/amira-profile.json` under `embeddingCorpora`.

## Data boundary and card policy

`tools/embeddings/build_embeddings.py` reads only the unauthenticated public
Omeka REST API and keeps an item only when `o:is_public` is exactly `true`. Each
record becomes the same bounded archival card:

1. title and resource type;
2. linked project and research-section context, where available;
3. subjects, places, and languages;
4. the first non-empty configured abstract/description/content field.

Every corpus receives the same 900-word maximum. Records below 100 input
characters are marked `lowSignal`: they remain as faint map context but are
excluded as recommendation sources and neighbours. HTML is stripped before the
content hash and model input are calculated.

## Model contract

- Model: `gemini-embedding-2`
- Output dimensions: 768
- Task prefix: `task: sentence similarity | query: `
- Stored normalization: unit L2
- Vector dtype/order: little-endian float32, one row per `ids.json` entry

Embedding spaces are model-, dimension-, prefix-, and normalization-specific.
A downstream index such as DRESearch must use the exact values in
`manifest.json` for its query embeddings. It must reject a release whose model,
dimensions, task prefix, schema version, normalization, row count, or checksum
does not match its configured index.

## Published artifacts

Compact files are committed beneath `asset/data/embeddings/`:

- `map.json`: schema/model metadata plus `{id, x, y, type, typeLabel, cluster,
  lowSignal, title}` rows;
- `similar.json`: a display catalog and up to 12 cosine neighbours per eligible
  source, each `{id, score}`;
- `report.json`: corpus/publicity counts, low-signal and truncation totals, cache
  work, compact artifact sizes, recommendation coverage, and release metadata.

The workflow publishes the full-vector payload as a versioned GitHub Release:

- `vectors.f32`: contiguous little-endian float32 rows;
- `ids.json`: Omeka integer IDs in the exact vector-row order;
- `manifest.json`: schema, model, dimensions, dtype, byte order, normalization,
  task prefix, row count, generation time, and SHA-256 of `vectors.f32`.

The content-hash `cache.json` is a CI cache, not a public contract and not a
backup. Deleting it is safe but causes a paid full rebuild.

## Refresh procedure

Run **Actions → Build semantic embeddings → Run workflow**. Choose `missing`
for the normal incremental refresh or `all` to force every card through the
model. The workflow runs the key-free contract suite first, fetches only public
records, opens a bot pull request for changed compact artifacts, and optionally
publishes a new vector release. Review `report.json` before merging, especially:

- unexpected corpus-count drops;
- non-public skip counts;
- low-signal and truncation rates;
- recommendation sources without any cross-type neighbour;
- the maximum input-word count and release checksum.

Ordinary pull-request CI never needs a Gemini key: it validates the profile,
pagination, cards, incremental cache, eligibility rules, and binary release
schema with deterministic fixtures.
