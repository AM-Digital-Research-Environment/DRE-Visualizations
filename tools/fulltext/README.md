# Full-text semantic map

Maps the ILAM *African Music* journal (item set 27724) by its full text instead
of its metadata card. The scripts run offline and are not part of the module
(`/tools` is `export-ignore`d from the zip). Two outputs:

- the **review** outputs (`analyse`), for curators and experts, which quote the
  matching passages and stay private;
- the **public map** (`export`), `config/fulltext-maps/<collection slug>.json`,
  which the module ships: the collection's Photo Browsing block shows it as its
  "By content" view (`src/FeaturedCollections/ContentMap.php`,
  `asset/js/item-set-content-map.js`). It holds Omeka ids, coordinates, group
  numbers and neighbour scores, nothing quoted from the texts, and the block
  shows only the records of the current public gallery snapshot.

The full text (`bibo:content`) is private. The harvest needs an API key, and
everything the scripts write (texts, passages, vectors, review pages) belongs
in a work directory **outside the repository**. Never commit or publish it.

## Run

```bash
# 1. Harvest (standard library only)
OMEKA_KEY_IDENTITY=... OMEKA_KEY_CREDENTIAL=... python harvest_fulltext.py --work-dir <private dir>

# 2. Passages and vectors (requirements-model.txt, plus onnxruntime for --engine onnx)
python fulltext_map.py embed --work-dir <private dir>                       # reference encoder first
python fulltext_map.py embed --work-dir <private dir> --engine onnx --threads 8 --batch 8

# 3. Layout, clusters, neighbours, review outputs
python fulltext_map.py analyse --work-dir <private dir> [--amira-dir <downloaded releases>]

# 4. The public map the module ships (numpy, umap-learn, scikit-learn)
python fulltext_map.py export --work-dir <private dir> --out ../../config/fulltext-maps/international-library-of-african-music-ilam.json
```

```bash
# 5. Word counts by year and the countries each article names (standard library only)
python fulltext_map.py features --work-dir <private dir> --out ../../config/fulltext-maps/international-library-of-african-music-ilam.json --words-out ../../asset/data/fulltext/international-library-of-african-music-ilam-words.json

# 6. Optional, experimental: name the groups (needs no private data)
python fulltext_map.py label --out ../../config/fulltext-maps/international-library-of-african-music-ilam.json --labels labels/international-library-of-african-music-ilam.json
```

Run them in this order: `export` rewrites the map file, `features` adds the
places to it, `label` the group names. `export` reuses the cached passage
vectors, so after `embed` has run once it needs no model. Re-run it after the full text changes, commit the file and
release the module; the map changes on the site with the module update.

`--amira-dir` takes a folder holding a `semantic-embeddings-v1-*` release
(`vectors.f32`, `ids.json`, `manifest.json`) and the `map.php` of the matching
`semantic-inputs-*` release, both public. With it, the analysis checks that the
full-text vectors share the metadata cards' space and compares the two sets of
neighbours.

## Method

- **Passages:** paragraphs, with hyphenation joined and page furniture dropped
  (page numbers; short lines repeated on three or more pages of one text or in
  twenty or more articles, such as running heads), packed into passages of
  300-400 words. A paragraph over 400 words is cut at sentence ends; a last
  passage under 100 words joins the one before.
- **Model contract:** the module's own, imported from
  `tools/embeddings/build_embeddings.py`: `google/embeddinggemma-2` at the pinned
  revision, the `task: sentence similarity | query: ` prefix, float32, mean
  pooling, unit L2. Passage vectors therefore live in the AMIRA space.
  `--engine onnx` runs the fp32 ONNX export of the same checkpoint
  (`onnx-community/embeddinggemma-2-ONNX`, pinned) for machines where the
  reference stack is slow or will not install (Windows ARM64: no torchvision
  wheel, and torch about three times slower). It refuses to run unless it
  reproduces vectors the reference encoder cached to cosine 0.99999.
- **Article vector:** the mean of its passage vectors, re-normalised.
- **Map:** 2-D UMAP with the module's settings; HDBSCAN on a 10-D UMAP;
  c-TF-IDF keywords per cluster. Both run on the article vectors with the
  corpus mean removed: every article shares a strong "African music journal"
  direction (median pair cosine 0.87), and on raw vectors HDBSCAN finds one
  cluster of three quarters of the journal. Neighbour scores stay raw cosine.
- **Neighbours:** ten per article by cosine, each with its best-matching
  passage pair (the highest passage-to-passage cosine) and the rarest words the
  two passages share, as the reason a reviewer can check.
- **Flags** mark likely artefacts: journal furniture by title (books received,
  contributors, editorial, back matter…), texts under 300 words, OCR noise
  (under 80% of tokens read as words), pairs whose matching passages are both
  list-like (references, discographies), and duplicate texts.
- **Public map** (`export`): before the layout it leaves out the items with no
  text of their own (identical text, or article vectors at cosine 0.99 or more:
  a review or notes section's text attached to every item in it), journal
  furniture by title and texts under 300 words; for ILAM that leaves 657 of the
  935 articles with text. Layout and groups as above, recomputed on what is
  left; eight neighbours per article. Groups carry no labels: full-text
  keywords would quote the texts, and title words proved misleading
  (publishers' names labelled the review groups).
- **Words** (`features`): for every word found in at least ten of the
  articles on the map, its occurrences in each year beside the year's total
  word count (`asset/data/fulltext/<collection>-words.json`, about 290 KiB
  gzipped). Aggregates only, as HathiTrust's extracted features do for works
  still in copyright: no article is identified and word order is gone. The
  gallery's Words view charts them per 10,000 words.
- **Places** (`features`): for each article, the countries its text names at
  least three times, by present or colonial name, adjective, or a few regions
  and cities (Buganda, Zanzibar, Lagos…), after cutting the journal's own
  addresses and university affiliations, which named South Africa in articles
  about anywhere else. A bare "Congo" counts for the Democratic Republic of the
  Congo. Africa and the African Americas only: European and North American
  names mostly come from publishers' addresses. Written into the map file and
  filtered with it, so only public records count; the gallery's Places view
  shows them.
- **Group labels** (`label`, experimental): `labels/<collection>.json` names
  each group and who named it. The ILAM labels were written by an AI model
  (Claude Opus 5.5) from the public titles of each group's articles, never from
  the full text. The page marks them as AI-generated wherever they appear, and
  shows none if the file does not say who made them. A label is applied only
  while its group keeps the size recorded beside it, so a re-export that
  changes the groups drops the labels instead of misplacing them.

## Outputs (in the work directory)

| File | Audience | Contains |
| --- | --- | --- |
| `review.html` | curators, private | map, neighbours, scores and the matching passages |
| `review.csv` | curators, private | one row per neighbour pair, passage excerpts, columns to mark meaningful / artefact / unsure |
| `map-public.html`, `map-public.json` | public-ready | titles, coordinates, clusters, keywords, neighbour scores; no full-text passages |
| `analysis-report.json` | team | coverage, passage counts, clusters, score distribution, AMIRA comparison |

`export` writes outside the work directory, into the repository: the only
output meant to be committed.

Keyword labels are no evidence that a cluster means something: on random
vectors c-TF-IDF still produces plausible-looking labels. Judge the clusters
and neighbours by their passages.
