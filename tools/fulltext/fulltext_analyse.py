"""Analysis stage of the full-text map prototype: layout, clusters, neighbours, review outputs.

Called by `fulltext_map.py analyse`. Writes into the private work directory:

- `review.html` / `review.csv`: for curators, with the matching passages;
- `map-public.html` / `map-public.json`: titles, coordinates, clusters,
  keyword labels and neighbour scores only, no full-text passages;
- `analysis-report.json`: coverage, passage counts, clusters, score
  distribution.
"""

from __future__ import annotations

import csv
import html
import json
import math
import re
from collections import Counter
from pathlib import Path

from fulltext_map import MODEL, MODEL_REVISION, TASK_PREFIX, TOP_K, UMAP_MIN_DIST, UMAP_NEIGHBORS, UMAP_SEED, load_items

SITE_ITEM_URL = "https://data.africamultiple.uni-bayreuth.de/s/amira/item/{}"
HDBSCAN_MIN_CLUSTER = 10
HDBSCAN_MIN_SAMPLES = 4
CLUSTER_UMAP_DIMS = 10
KEYWORDS = 8
CSV_EXCERPT_WORDS = 120

# Titles of journal furniture rather than articles: listings, notices, front and back matter.
FURNITURE_TITLE_RE = re.compile(
    r"(?i)books?\b.*\breceived|publications received|records? received|received by the library|contributors|"
    r"editorial|back ?matter|front ?matter|^contents|^index|letters? to the editor|annual general meeting|"
    r"notes and news|news and notes|^notes$|obituar|correspondence|^list of|errat|corrigend|announcement|"
    r"^african music,? vol|^journal of|^membership|^officers|^the society|^society news|^reports?$|^track \d|"
    r"tracklist|subscri|publications of ilam|for sale\b|from the editor|word from the editor|^news from ilam"
)
WORD_RE = re.compile(r"[A-Za-z][A-Za-z'-]+")
TOKEN_RE = r"(?u)\b[a-zA-Z][a-zA-Z'-]{2,}\b"
EXTRA_STOP = {
    "also", "one", "two", "three", "would", "could", "may", "might", "see", "said", "pp", "vol", "fig", "ibid",
    "op", "cit", "etc", "however", "thus", "used", "use", "many", "much", "well", "new", "first", "time", "way",
    "made", "make", "like", "another", "within", "upon", "often", "even", "still", "though", "although", "page",
    # A few articles are in French; their function words would otherwise label a cluster.
    "les", "des", "une", "est", "pas", "dans", "pour", "par", "sur", "qui", "que", "avec", "aux", "son", "ses",
    "mais", "plus", "sont", "elle", "cette", "comme", "leur", "leurs", "nous", "vous", "ils", "elles", "été",
    "fait", "entre", "tout", "tous", "même", "sans", "aussi", "dont", "ont", "peut",
}


def decade_of(date: str) -> str:
    match = re.match(r"(\d{3})\d", date or "")
    return f"{match.group(1)}0s" if match else "undated"


def ocr_quality(text: str) -> float:
    """Share of whitespace tokens that read as words: OCR debris and tables score low."""
    tokens = text.split()
    if not tokens:
        return 0.0
    return sum(1 for token in tokens if re.fullmatch(r"[\"'(\[]?[A-Za-z][A-Za-z'-]*[.,;:!?)\]\"']*", token)) / len(tokens)


def list_like(text: str) -> bool:
    """A references list, discography or price list: dense in years, numbers and initials."""
    tokens = text.split()
    if not tokens:
        return False
    years = sum(1 for token in tokens if re.search(r"\b(1[89]|20)\d\d\b", token))
    numbers = sum(1 for token in tokens if re.fullmatch(r"\W*\d[\d.,:/-]*\W*", token))
    initials = sum(1 for token in tokens if re.fullmatch(r"[A-Z]\.(?:[A-Z]\.)*,?", token))
    return (years + numbers + initials) / len(tokens) > 0.12 or years / len(tokens) > 0.05


def ctfidf_keywords(docs_by_cluster: dict[int, list[str]], all_docs: list[str]) -> dict[int, list[str]]:
    import numpy as np
    from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, CountVectorizer

    vectorizer = CountVectorizer(
        stop_words=sorted(ENGLISH_STOP_WORDS | EXTRA_STOP), token_pattern=TOKEN_RE,
        ngram_range=(1, 2), min_df=3, max_df=0.9, lowercase=True,
    )
    vectorizer.fit(all_docs)
    vocabulary = vectorizer.get_feature_names_out()
    clusters = sorted(docs_by_cluster)
    counts = np.vstack([np.asarray(vectorizer.transform([" ".join(docs_by_cluster[c])]).sum(axis=0)).ravel() for c in clusters]).astype(float)
    tf = counts / np.maximum(counts.sum(axis=1, keepdims=True), 1)
    average_words = counts.sum(axis=1).mean()
    idf = np.log(1 + average_words / np.maximum(counts.sum(axis=0), 1))
    scores = tf * idf
    out: dict[int, list[str]] = {}
    for row, cluster in enumerate(clusters):
        chosen: list[str] = []
        for index in np.argsort(-scores[row]):
            term = vocabulary[index]
            if any(term in other or other in term for other in chosen):
                continue
            chosen.append(term)
            if len(chosen) == KEYWORDS:
                break
        out[cluster] = chosen
    return out


def amira_comparison(amira_dir: Path, ids: list[int], articles) -> dict:
    """Compare full-text vectors with the module's public metadata-card release.

    Both use one model contract, so an article's full-text vector should land
    nearer its own card than other ILAM cards (the same-space check). The card
    neighbours show what full text adds over metadata, and the nearest records
    of other AMIRA corpora are the links a public map could offer.
    """
    import numpy as np
    from scoped_source import read_json

    manifest = json.loads((amira_dir / "manifest.json").read_text(encoding="utf-8"))
    if (manifest["model"], manifest["modelRevision"], manifest["taskPrefix"]) != (MODEL, MODEL_REVISION, TASK_PREFIX):
        raise SystemExit("The AMIRA vector release was built with another model contract")
    rows = json.loads((amira_dir / "ids.json").read_text(encoding="utf-8"))
    cards = np.fromfile(amira_dir / "vectors.f32", dtype="<f4").reshape(len(rows), manifest["dimensions"])
    titles = {row["id"]: row for row in read_json(amira_dir / "map.php")["items"]}
    row_of = {row["id"]: index for index, row in enumerate(rows)}
    ilam = set(ids)

    own = np.stack([cards[row_of[i]] for i in ids])
    cross = articles @ own.T  # full text of article i against the card of article j
    own_score = np.diag(cross)
    rank = (cross > own_score[:, None]).sum(axis=1) + 1
    card_similarity = own @ own.T
    np.fill_diagonal(card_similarity, -np.inf)
    low_signal = np.array([rows[row_of[i]]["lowSignal"] for i in ids])
    metadata_neighbours = {}
    for k, item_id in enumerate(ids):
        if low_signal[k]:
            continue
        scores = np.where(low_signal, -np.inf, card_similarity[k])
        metadata_neighbours[item_id] = [ids[j] for j in np.argsort(-scores)[:TOP_K]]

    others = [index for index, row in enumerate(rows) if row["id"] not in ilam and not row["lowSignal"]]
    other_scores = articles @ cards[others].T
    bridges = {}
    for k, item_id in enumerate(ids):
        bridges[item_id] = []
        for j in np.argsort(-other_scores[k])[:3]:
            record = rows[others[j]]
            label = titles.get(record["id"], {})
            bridges[item_id].append({
                "id": record["id"], "type": label.get("typeLabel", record["type"]), "title": label.get("title", ""),
                "score": round(float(other_scores[k, j]), 4),
            })
    off_diagonal = cross[~np.eye(len(ids), dtype=bool)]
    return {
        "metadataNeighbours": metadata_neighbours,
        "bridges": bridges,
        "summary": {
            "release": manifest.get("generatedAt"),
            "ownCardScore": {"median": round(float(np.median(own_score)), 4), "p05": round(float(np.quantile(own_score, 0.05)), 4)},
            "otherIlamCardScore": {"median": round(float(np.median(off_diagonal)), 4), "p95": round(float(np.quantile(off_diagonal, 0.95)), 4)},
            "ownCardRank1": int((rank == 1).sum()), "ownCardTop10": int((rank <= 10).sum()), "articles": len(ids),
            "ownCardRank1HighSignal": int(((rank == 1) & ~low_signal).sum()), "highSignal": int((~low_signal).sum()),
            "bridgeTypes": dict(Counter(b["type"] for item_id in ids for b in bridges[item_id][:1])),
        },
    }


def excerpt(text: str, words: int) -> str:
    parts = text.split()
    return " ".join(parts[:words]) + (" …" if len(parts) > words else "")


def analyse(work_dir: Path, amira_dir: Path | None = None) -> int:
    import numpy as np
    import umap
    from sklearn.cluster import HDBSCAN
    from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

    items = {item["id"]: item for item in load_items(work_dir)}
    with (work_dir / "passages.jsonl").open(encoding="utf-8") as handle:
        passages = [json.loads(line) for line in handle]
    vectors = np.load(work_dir / "passage-vectors.npy")

    # Article vector: the mean of its passage vectors, re-normalised to unit L2.
    by_item: dict[int, list[int]] = {}
    for row, passage in enumerate(passages):
        by_item.setdefault(passage["item"], []).append(row)
    ids = sorted(by_item)
    articles = np.stack([vectors[by_item[i]].mean(axis=0) for i in ids])
    articles /= np.linalg.norm(articles, axis=1, keepdims=True)
    position = {item_id: index for index, item_id in enumerate(ids)}

    meta = []
    for item_id in ids:
        item = items[item_id]
        text = " ".join(passages[row]["text"] for row in by_item[item_id])
        flags = []
        if FURNITURE_TITLE_RE.search(item["title"].strip()):
            flags.append("furniture")
        words = len(text.split())
        if words < 300:
            flags.append("short")
        quality = ocr_quality(text)
        if quality < 0.8:
            flags.append("ocr")
        meta.append({
            "id": item_id, "title": item["title"], "date": item["date"], "year": item["date"][:4],
            "decade": decade_of(item["date"]), "authors": item["authors"], "words": words,
            "passages": len(by_item[item_id]), "ocr": round(quality, 3), "flags": flags,
        })
    passage_list_like = [list_like(passage["text"]) for passage in passages]

    # Layout and clusters. Every article shares a strong "African music journal"
    # direction (median pair cosine 0.87), so on raw vectors HDBSCAN finds one
    # cluster of 745 plus journal furniture. Layout and clusters therefore use
    # the vectors with the corpus mean removed; neighbour scores stay raw cosine,
    # comparable with the module's. The 2-D layout uses the module's UMAP
    # settings; the clusters come from a 10-D UMAP, as HDBSCAN works poorly on
    # 768 dimensions.
    centred = articles - articles.mean(axis=0)
    centred /= np.linalg.norm(centred, axis=1, keepdims=True)
    layout = umap.UMAP(n_components=2, n_neighbors=UMAP_NEIGHBORS, min_dist=UMAP_MIN_DIST, metric="cosine", random_state=UMAP_SEED).fit_transform(centred)
    reduced = umap.UMAP(n_components=CLUSTER_UMAP_DIMS, n_neighbors=UMAP_NEIGHBORS, min_dist=0.0, metric="cosine", random_state=UMAP_SEED).fit_transform(centred)
    labels = HDBSCAN(min_cluster_size=HDBSCAN_MIN_CLUSTER, min_samples=HDBSCAN_MIN_SAMPLES).fit_predict(reduced)
    # Number clusters by size so cluster 1 is the largest.
    order = [label for label, _ in Counter(int(l) for l in labels if l >= 0).most_common()]
    renumber = {label: rank + 1 for rank, label in enumerate(order)}
    labels = [renumber.get(int(l), 0) for l in labels]
    span = layout.max(axis=0) - layout.min(axis=0)
    layout = (layout - layout.min(axis=0)) / np.where(span == 0, 1, span)

    docs = [" ".join(passages[row]["text"] for row in by_item[item_id]) for item_id in ids]
    docs_by_cluster: dict[int, list[str]] = {}
    for doc, label in zip(docs, labels):
        if label:
            docs_by_cluster.setdefault(label, []).append(doc)
    keywords = ctfidf_keywords(docs_by_cluster, docs)
    clusters = []
    for label in sorted(docs_by_cluster):
        members = [m for m, l in zip(meta, labels) if l == label]
        decades = Counter(m["decade"] for m in members)
        clusters.append({
            "id": label, "size": len(members), "keywords": keywords[label],
            "decades": dict(sorted(decades.items())),
            "furnitureShare": round(sum("furniture" in m["flags"] for m in members) / len(members), 3),
            "examples": [m["title"] for m in sorted(members, key=lambda m: -m["words"])[:4]],
        })

    # Neighbours, each with the best-matching passage pair as its reason.
    similarity = articles @ articles.T
    off_diagonal = np.sort(similarity[np.triu_indices(len(ids), k=1)])
    stop = ENGLISH_STOP_WORDS | EXTRA_STOP
    document_frequency: Counter[str] = Counter()
    passage_terms = []
    for passage in passages:
        terms = {w.lower() for w in WORD_RE.findall(passage["text"]) if len(w) > 3 and w.lower() not in stop}
        passage_terms.append(terms)
        document_frequency.update(terms)

    def shared_terms(a: int, b: int) -> list[str]:
        common = passage_terms[a] & passage_terms[b]
        return sorted(common, key=lambda t: (document_frequency[t], t))[:6]

    neighbours: dict[int, list[dict]] = {}
    for i, item_id in enumerate(ids):
        scores = similarity[i].copy()
        scores[i] = -np.inf
        ranked = np.argsort(-scores)[:TOP_K]
        rows_i = by_item[item_id]
        out = []
        for j in ranked:
            rows_j = by_item[ids[j]]
            pair = vectors[rows_i] @ vectors[rows_j].T
            a, b = np.unravel_index(int(np.argmax(pair)), pair.shape)
            pa, pb = rows_i[a], rows_j[b]
            flags = sorted(set(meta[i]["flags"]) | set(meta[j]["flags"]))
            if passage_list_like[pa] and passage_list_like[pb]:
                flags.append("list-passages")
            if scores[j] > 0.995:
                flags.append("duplicate")
            out.append({
                "id": ids[j], "score": round(float(scores[j]), 4),
                "percentile": round(100 * float(np.searchsorted(off_diagonal, scores[j])) / len(off_diagonal), 2),
                "passageScore": round(float(pair[a, b]), 4), "sourcePassage": int(pa), "neighbourPassage": int(pb),
                "sharedTerms": shared_terms(pa, pb), "flags": flags,
            })
        neighbours[item_id] = out

    amira = amira_comparison(amira_dir, ids, articles) if amira_dir else None
    overlap = []
    if amira:
        for item_id in ids:
            card_neighbours = set(amira["metadataNeighbours"].get(item_id, []))
            for n in neighbours[item_id]:
                n["metadataNeighbour"] = n["id"] in card_neighbours
            if card_neighbours:
                overlap.append(sum(n["metadataNeighbour"] for n in neighbours[item_id]))

    def quantiles(values) -> dict[str, float]:
        values = np.asarray(values, dtype=float)
        return {key: round(float(np.quantile(values, q)), 4) for key, q in (("min", 0), ("p05", .05), ("p25", .25), ("median", .5), ("p75", .75), ("p95", .95), ("max", 1))}

    rank1 = [neighbours[i][0]["score"] for i in ids]
    rank10 = [neighbours[i][-1]["score"] for i in ids]
    all_neighbour = [n["score"] for i in ids for n in neighbours[i]]
    passage_scores = [n["passageScore"] for i in ids for n in neighbours[i]]
    flagged_pairs = sum(1 for i in ids for n in neighbours[i] if n["flags"])
    passage_words = [p["words"] for p in passages]
    all_items = list(items.values())
    report = {
        "model": MODEL, "modelRevision": MODEL_REVISION, "taskPrefix": TASK_PREFIX,
        "coverage": {
            "items": len(all_items), "withText": len(ids), "withoutText": len(all_items) - len(ids),
            "withoutTextByDecade": dict(sorted(Counter(decade_of(i["date"]) for i in all_items if i["id"] not in by_item).items())),
            "furnitureTitles": sum("furniture" in m["flags"] for m in meta),
            "lowOcrQuality": sum("ocr" in m["flags"] for m in meta),
            "short": sum("short" in m["flags"] for m in meta),
        },
        "passages": {
            "count": len(passages), "unique": len({p["text"] for p in passages}),
            "perArticle": quantiles([len(by_item[i]) for i in ids]), "words": quantiles(passage_words),
            "listLike": sum(passage_list_like),
        },
        "clustering": {
            "algorithm": "HDBSCAN on 10-D UMAP of mean-centred article vectors", "minClusterSize": HDBSCAN_MIN_CLUSTER, "minSamples": HDBSCAN_MIN_SAMPLES,
            "clusters": len(clusters), "unclustered": sum(1 for l in labels if not l),
        },
        "scores": {
            "allPairs": quantiles(off_diagonal), "rank1": quantiles(rank1), "rank10": quantiles(rank10),
            "neighbours": quantiles(all_neighbour), "bestPassagePair": quantiles(passage_scores),
            "neighbourPairs": len(all_neighbour), "flaggedPairs": flagged_pairs,
        },
        "clusters": clusters,
    }
    if amira:
        report["amira"] = {
            **amira["summary"],
            "metadataOverlap": {
                "articles": len(overlap), "meanSharedOfTen": round(sum(overlap) / max(len(overlap), 1), 2),
                "noneShared": sum(1 for o in overlap if o == 0),
            },
        }
    (work_dir / "analysis-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    points = [
        {**m, "x": round(float(layout[k][0]), 5), "y": round(float(layout[k][1]), 5), "cluster": labels[k], "url": SITE_ITEM_URL.format(m["id"]),
         "bridges": amira["bridges"][m["id"]] if amira else []}
        for k, m in enumerate(meta)
    ]
    cluster_info = [{"id": c["id"], "size": c["size"], "keywords": c["keywords"]} for c in clusters]

    # Private review outputs: neighbours with their reasons, passages quoted.
    used = sorted({n[key] for i in ids for n in neighbours[i] for key in ("sourcePassage", "neighbourPassage")})
    private = {
        "private": True, "points": points, "clusters": cluster_info, "report": report,
        "neighbours": {str(i): neighbours[i] for i in ids},
        "passages": {str(row): {"item": passages[row]["item"], "index": passages[row]["index"], "text": passages[row]["text"], "listLike": passage_list_like[row]} for row in used},
    }
    write_page(work_dir / "review.html", private, "ILAM full-text map: review")

    with (work_dir / "review.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow([
            "source_id", "source_title", "source_year", "rank", "neighbour_id", "neighbour_title", "neighbour_year",
            "article_score", "score_percentile", "passage_score", "same_cluster", "also_metadata_neighbour", "flags", "shared_terms",
            "source_passage", "neighbour_passage", "meaningful", "artefact", "unsure", "notes",
        ])
        for i in ids:
            source = meta[position[i]]
            for rank, n in enumerate(neighbours[i], start=1):
                target = meta[position[n["id"]]]
                writer.writerow([
                    i, source["title"], source["year"], rank, n["id"], target["title"], target["year"],
                    n["score"], n["percentile"], n["passageScore"], labels[position[i]] == labels[position[n["id"]]] and labels[position[i]] > 0,
                    n.get("metadataNeighbour", ""), " ".join(n["flags"]), " ".join(n["sharedTerms"]),
                    excerpt(passages[n["sourcePassage"]]["text"], CSV_EXCERPT_WORDS),
                    excerpt(passages[n["neighbourPassage"]]["text"], CSV_EXCERPT_WORDS), "", "", "", "",
                ])

    # Public-ready map: no passages, no shared terms, nothing quoted from the full text.
    public_points = [{k: p[k] for k in ("id", "title", "year", "decade", "authors", "x", "y", "cluster", "url", "bridges")} for p in points]
    public = {
        "private": False, "points": public_points, "clusters": cluster_info,
        "neighbours": {str(i): [{"id": n["id"], "score": n["score"]} for n in neighbours[i]] for i in ids},
        "model": {"name": MODEL, "revision": MODEL_REVISION, "prefix": TASK_PREFIX},
    }
    (work_dir / "map-public.json").write_text(json.dumps(public, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    write_page(work_dir / "map-public.html", public, "ILAM semantic map")

    print(json.dumps({k: report[k] for k in ("coverage", "passages", "clustering", "scores", "amira") if k in report}, indent=2))
    for c in clusters:
        print(f"{c['id']:>3} {c['size']:>4}  {', '.join(c['keywords'])}")
    return 0


def write_page(path: Path, payload: dict, title: str) -> None:
    template = (Path(__file__).with_name("review_template.html")).read_text(encoding="utf-8")
    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    page = template.replace("__TITLE__", html.escape(title)).replace("__DATA__", data)
    path.write_text(page, encoding="utf-8")
