# Full-text semantic map: evaluation prototype

An offline prototype that maps the ILAM *African Music* journal (item set
27724) by its full text instead of its metadata card, for curators and experts
to judge before anything is published. It is not part of the module: nothing
here runs in Omeka, changes `config/amira-profile.json` or feeds a release, and
`/tools` is `export-ignore`d from the module zip.

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
```

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

## Outputs (in the work directory)

| File | Audience | Contains |
| --- | --- | --- |
| `review.html` | curators, private | map, neighbours, scores and the matching passages |
| `review.csv` | curators, private | one row per neighbour pair, passage excerpts, columns to mark meaningful / artefact / unsure |
| `map-public.html`, `map-public.json` | public-ready | titles, coordinates, clusters, keywords, neighbour scores; no full-text passages |
| `analysis-report.json` | team | coverage, passage counts, clusters, score distribution, AMIRA comparison |

Keyword labels are no evidence that a cluster means something: on random
vectors c-TF-IDF still produces plausible-looking labels. Judge the clusters
and neighbours by their passages.
