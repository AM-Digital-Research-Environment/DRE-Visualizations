"""Export stage of the full-text map: the public file the Photo Browsing block reads.

Called by `fulltext_map.py export`. Writes `config/fulltext-maps/<collection>.json`,
which the module ships: the ILAM gallery shows it as its "By content" view.

The file carries Omeka ids, map coordinates, group numbers and neighbour
scores. Groups are not labelled: keywords drawn from the full text would quote
it, and words drawn from the titles proved misleading (publishers' names label
the review groups). Nothing in it is quoted or
derived word by word from the private full text, and the block shows a row only
when the record is in the current public gallery snapshot, so an item made
private since the export disappears from the map at the next regeneration.

Left out before the layout, so they neither show nor shape the map:

- shared text: items with no text of their own, which carry the whole review or
  notes section they sit in (identical text, or article vectors at cosine 0.99
  or more), so they would all be one another's nearest neighbours;
- journal furniture by title (contributors, books received, back matter…);
- texts under 300 words, too short to place reliably.
"""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from fulltext_analyse import CLUSTER_UMAP_DIMS, FURNITURE_TITLE_RE, HDBSCAN_MIN_CLUSTER, HDBSCAN_MIN_SAMPLES
from fulltext_map import MODEL, MODEL_REVISION, TASK_PREFIX, UMAP_MIN_DIST, UMAP_NEIGHBORS, UMAP_SEED, load_items

SCHEMA_VERSION = 1
SHARED_TEXT_COSINE = 0.99
MIN_WORDS = 300
NEIGHBOURS = 8


def export(work_dir: Path, out_path: Path, item_set: int) -> int:
    import hashlib

    import numpy as np
    import umap
    from sklearn.cluster import HDBSCAN

    items = {item["id"]: item for item in load_items(work_dir)}
    with (work_dir / "passages.jsonl").open(encoding="utf-8") as handle:
        passages = [json.loads(line) for line in handle]
    vectors = np.load(work_dir / "passage-vectors.npy")
    by_item: dict[int, list[int]] = {}
    for row, passage in enumerate(passages):
        by_item.setdefault(passage["item"], []).append(row)

    ids = sorted(by_item)
    articles = np.stack([vectors[by_item[i]].mean(axis=0) for i in ids])
    articles /= np.linalg.norm(articles, axis=1, keepdims=True)
    texts = {i: " ".join(passages[row]["text"] for row in by_item[i]) for i in ids}

    digest = Counter(hashlib.sha256(texts[i].encode("utf-8")).hexdigest() for i in ids)
    similarity = articles @ articles.T
    np.fill_diagonal(similarity, -1.0)
    excluded: dict[str, set[int]] = {
        "sharedText": {i for k, i in enumerate(ids)
                       if digest[hashlib.sha256(texts[i].encode("utf-8")).hexdigest()] > 1
                       or similarity[k].max() >= SHARED_TEXT_COSINE},
        "furniture": {i for i in ids if FURNITURE_TITLE_RE.search(items[i]["title"].strip())},
        "short": {i for i in ids if len(texts[i].split()) < MIN_WORDS},
    }
    # Only public items: the block filters by the live snapshot as well, but the
    # file should not name a record the harvest already saw as private.
    dropped = set().union(*excluded.values()) | {i for i in ids if items[i].get("isPublic") is not True}
    keep = [k for k, i in enumerate(ids) if i not in dropped]
    kept_ids = [ids[k] for k in keep]
    kept = articles[keep]

    # As in the analysis: layout and groups on mean-centred vectors (every
    # article shares a strong "African music journal" direction), neighbour
    # scores on the raw cosine.
    centred = kept - kept.mean(axis=0)
    centred /= np.linalg.norm(centred, axis=1, keepdims=True)
    layout = umap.UMAP(n_components=2, n_neighbors=UMAP_NEIGHBORS, min_dist=UMAP_MIN_DIST, metric="cosine", random_state=UMAP_SEED).fit_transform(centred)
    reduced = umap.UMAP(n_components=CLUSTER_UMAP_DIMS, n_neighbors=UMAP_NEIGHBORS, min_dist=0.0, metric="cosine", random_state=UMAP_SEED).fit_transform(centred)
    raw_labels = HDBSCAN(min_cluster_size=HDBSCAN_MIN_CLUSTER, min_samples=HDBSCAN_MIN_SAMPLES).fit_predict(reduced)
    order = [label for label, _ in Counter(int(l) for l in raw_labels if l >= 0).most_common()]
    renumber = {label: rank + 1 for rank, label in enumerate(order)}
    labels = [renumber.get(int(l), 0) for l in raw_labels]
    span = layout.max(axis=0) - layout.min(axis=0)
    layout = (layout - layout.min(axis=0)) / np.where(span == 0, 1, span)

    sizes = Counter(label for label in labels if label)

    scores = kept @ kept.T
    np.fill_diagonal(scores, -np.inf)
    neighbours = {}
    for k, item_id in enumerate(kept_ids):
        ranked = np.argsort(-scores[k])[:NEIGHBOURS]
        neighbours[str(item_id)] = [[kept_ids[j], round(float(scores[k, j]), 4)] for j in ranked]

    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "itemSetId": item_set,
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "model": {"name": MODEL, "revision": MODEL_REVISION, "taskPrefix": TASK_PREFIX},
        "counts": {
            "items": len(items), "withText": len(ids), "shown": len(kept_ids),
            "excluded": {key: len(value) for key, value in excluded.items()},
            "passages": len(passages),
        },
        "groups": [{"id": label, "size": sizes[label]} for label in sorted(sizes)],
        "items": [[item_id, round(float(layout[k][0]), 4), round(float(layout[k][1]), 4), labels[k]] for k, item_id in enumerate(kept_ids)],
        "neighbours": neighbours,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(payload["counts"], indent=2))
    print(f"{len(payload['groups'])} groups, {sum(1 for l in labels if not l)} articles in none")
    return 0


def label(map_path: Path, labels_path: Path) -> int:
    """Name the groups of an exported map from a labels file (`labels/<collection>.json`).

    Labels are an experiment, made from public data only (an AI model read the
    titles of each group's articles), and the page says so. A label applies
    only while its group keeps the size recorded beside it, so a re-export that
    changes the groups drops the labels rather than putting them on the wrong
    group. Needs no private data: it reads and rewrites the public map.
    """
    payload = json.loads(map_path.read_text(encoding="utf-8"))
    labels = json.loads(labels_path.read_text(encoding="utf-8"))
    applied = skipped = 0
    for group in payload["groups"]:
        group.pop("label", None)
        entry = labels["groups"].get(str(group["id"]))
        if entry and entry.get("size") == group["size"] and str(entry.get("label", "")).strip():
            group["label"] = str(entry["label"]).strip()[:80]
            applied += 1
        else:
            skipped += 1
    payload.pop("labels", None)
    if applied:
        payload["labels"] = {"by": labels["labelledBy"], "from": labels["from"], "date": labels["date"]}
    map_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")
    print(f"{applied} groups labelled, {skipped} without a label")
    return 0
