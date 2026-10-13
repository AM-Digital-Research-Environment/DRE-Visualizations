# Semantic embeddings

This module publishes one interoperable semantic space for six public AMIRA
corpora: podcasts, YouTube videos, publications, research projects, research
sections, and research items. The shared source of truth is
`config/amira-profile.json` under `embeddingCorpora`.

Authority records (people, institutions, subjects, places, languages, genres
and other controlled vocabularies) are never embedded. They are fixed in
MongoDB and reach the space only as labels on the records that cite them. Both
the builder and the module's profile validator reject a corpus that selects an
authority item set or template.

## Data boundary and card policy

`tools/embeddings/build_embeddings.py` reads only the unauthenticated public
Omeka REST API and keeps an item only when `o:is_public` is exactly `true`. Each
record becomes the same bounded archival card:

1. title and resource type;
2. linked project and research-section context, where available;
3. subjects, places, and languages;
4. the first non-empty configured abstract or description field.

Cards never read full text or transcripts (`bibo:content`). A podcast, video or
publication is described by its abstract; one without an abstract gets a card
from its title and metadata alone. Full text runs to tens of thousands of words,
its opening describes a record poorly, and the profile validators reject it as
a card field. It is reserved for a separate full-text layer.

Every corpus receives the same 900-word maximum. HTML is stripped before the
content hash and model input are calculated.

A record is `lowSignal` when what it says about itself (its title, abstract or
description, subjects and places) is under 100 characters. The inherited
project and section lines and placeholder titles such as "Untitled" do not
count: hundreds of research items in one collection share them, so a card
carried by them alone would only recommend its siblings. Low-signal records
remain as faint map context but are excluded as recommendation sources and
neighbours.

Records whose cards are identical (a series sharing one title and subject set)
are embedded once and share a vector. A recommendation list never includes a
record identical to its source and lists one record per distinct card.

## Model contract

- Model: [`google/embeddinggemma-2`](https://huggingface.co/google/embeddinggemma-2)
  (Apache 2.0 open weights), revision `914f7f89142e33e77833254d9c9b90c3cef7303b`
- Encoder: text only (vision and audio encoders not loaded), CPU, float32
  inference. float16 is never used: this model returns NaN or degraded vectors
  in it, and the build rejects any non-finite row.
- Output dimensions: 768
- Task prefix: `task: sentence similarity | query: ` (the model's
  `SentenceSimilarity` prompt)
- Stored normalization: unit L2
- Vector dtype/order: little-endian float32, one row per `ids.json` entry

Embedding spaces are model-, revision-, dimension-, prefix-, and
normalization-specific. A downstream index such as DRESearch or the AMIRA MCP
server can embed its queries locally with the same open model, and must use the
exact values in `manifest.json` to do so. It must reject a release whose model,
model revision, dimensions, task prefix, schema version, normalization, row
count, or checksum does not match its configured index.

## Published artifacts

Compact inputs are committed beneath `data/embeddings/` as PHP-denied `.php` envelopes (the JSON schemas below remain the same). Set `OMEKA_SITE_URL` to the canonical site; builders check its site, profile hash and source revision before/after harvesting. Only a matching input is copied into the protected runtime snapshot during regeneration. The revision changes only when publication is withdrawn (a privatising write, a manual withdrawal, a canonical-site change), so ordinary edits keep a build valid; records deleted since the build stay in it until the next one. Existing unscoped inputs require a new build. Browser clients use `RV.fetchDataJson`.

Input payloads:

- `map.json`: schema/model metadata plus `{id, x, y, type, typeLabel, cluster,
  lowSignal, title}` rows;
- `similar.json`: a display catalog and up to 12 cosine neighbours per eligible
  source, each `{id, score}`;
- `report.json`: corpus/publicity counts, low-signal and truncation totals, cache
  work, compact artifact sizes, recommendation coverage, and release metadata.

The workflow publishes the full-vector payload as a versioned GitHub Release:

- `vectors.f32`: contiguous little-endian float32 rows;
- `ids.json`: Omeka integer IDs in the exact vector-row order;
- `manifest.json`: schema, model, model revision, inference dtype, dimensions,
  vector dtype and byte order, normalization, task prefix, row count,
  generation time, and SHA-256 of `vectors.f32`.

The content-hash `cache.json` is a CI cache, not a public contract and not a
backup. Deleting it is safe but causes a full re-embed.

## Refresh procedure

Run **Actions → Build semantic embeddings → Run workflow**. Choose `missing`
for the normal incremental refresh or `all` to force every card through the
model. The model runs on the GitHub runner: no API key or secret is needed, and
the Omeka server only reads the compact outputs during regeneration. The
workflow caches the pinned model download, runs the contract suite, fetches
only public records, optionally publishes a new vector release, and pushes the
changed compact artifacts to an `automation/embeddings-<run>` branch. The
organisation does not let GitHub Actions open pull requests, so open it from
the link in the job summary. Review `report.json` before merging, especially:

- unexpected corpus-count drops;
- non-public skip counts;
- low-signal and truncation rates;
- recommendation sources without any cross-type neighbour;
- the maximum input-word count and release checksum.

Ordinary pull-request CI never loads the model: it validates the profile,
pagination, cards, incremental cache, eligibility rules, and binary release
schema with deterministic fixtures. The model stack is pinned separately in
`tools/embeddings/requirements-model.txt` (CPU-only torch).
