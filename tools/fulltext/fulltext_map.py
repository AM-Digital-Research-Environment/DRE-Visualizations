#!/usr/bin/env python3
"""Offline evaluation prototype of a full-text semantic map (ILAM *African Music*).

Reads the private `items.jsonl` written by `harvest_fulltext.py`, cuts each
text into paragraph-aware passages of roughly 300-400 words, embeds them with
the same pinned model contract as the module's metadata cards
(`tools/embeddings/build_embeddings.py`, `docs/SEMANTIC_EMBEDDINGS.md`), and
averages each article's passages into one re-normalised vector in that space.

    python fulltext_map.py embed   --work-dir <private dir>
    python fulltext_map.py analyse --work-dir <private dir>

`analyse` lays the articles out with UMAP, clusters them with HDBSCAN, labels
clusters with c-TF-IDF keywords and lists ten neighbours per article, each
with the best-matching passage pair as its reason. It writes a private review
page and CSV that quote passages, and a public-ready map that carries no text
beyond titles and keywords. Nothing here is part of the module's build: the
work directory must stay outside the repository and is never published.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "embeddings"))
from build_embeddings import (  # noqa: E402  the module's model contract, not a copy of it
    INFERENCE_DTYPE,
    MODEL,
    MODEL_REVISION,
    OUTPUT_DIMS,
    TASK_PREFIX,
    UMAP_MIN_DIST,
    UMAP_NEIGHBORS,
    UMAP_SEED,
    GemmaEmbedder,
)

PASSAGE_TARGET_WORDS = 300
PASSAGE_MAX_WORDS = 400
PASSAGE_MIN_WORDS = 100
TOP_K = 10
SCHEMA = 1

PAGE_NUMBER_RE = re.compile(r"^\W*\d{1,4}\W*$")
SENTENCE_RE = re.compile(r"(?<=[.!?;:])\s+")


# --- Passages -----------------------------------------------------------------

def paragraphs(text: str, furniture: frozenset[str] = frozenset()) -> list[str]:
    """Paragraphs with line-break hyphenation joined and page furniture dropped.

    Page numbers and short lines repeated on many pages or across many articles
    (running heads such as "AFRICAN MUSIC SOCIETY JOURNAL") are layout, not
    content.
    """
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text.replace("\r", ""))
    raw = [re.sub(r"\s+", " ", block).strip() for block in re.split(r"\n\s*\n", text)]
    raw = [block for block in raw if block and not PAGE_NUMBER_RE.match(block)]
    short = Counter(block.lower() for block in raw if len(block.split()) <= 8)
    return [
        block for block in raw
        if not (len(block.split()) <= 8 and (short[block.lower()] >= 3 or block.lower() in furniture))
    ]


def corpus_furniture(items: list[dict], min_items: int = 20) -> frozenset[str]:
    """Short lines that recur in many articles: one running head per short text escapes the per-text count."""
    seen: Counter[str] = Counter()
    for item in items:
        seen.update({block.lower() for block in paragraphs(item["text"]) if len(block.split()) <= 8})
    return frozenset(line for line, count in seen.items() if count >= min_items)


def units(paragraph: str) -> list[list[str]]:
    words = paragraph.split()
    if len(words) <= PASSAGE_MAX_WORDS:
        return [words]
    out: list[list[str]] = []
    current: list[str] = []
    for sentence in SENTENCE_RE.split(paragraph):
        sentence_words = sentence.split()
        # An OCR table or run-on block has no sentence ends: cut it by words.
        while len(sentence_words) > PASSAGE_MAX_WORDS:
            out.append(sentence_words[:PASSAGE_TARGET_WORDS])
            sentence_words = sentence_words[PASSAGE_TARGET_WORDS:]
        if current and len(current) + len(sentence_words) > PASSAGE_MAX_WORDS:
            out.append(current)
            current = []
        current = current + sentence_words
    if current:
        out.append(current)
    return out


def passages(text: str, furniture: frozenset[str] = frozenset()) -> list[str]:
    out: list[list[str]] = []
    buffer: list[str] = []
    for paragraph in paragraphs(text, furniture):
        for unit in units(paragraph):
            if buffer and len(buffer) + len(unit) > PASSAGE_MAX_WORDS and len(buffer) >= PASSAGE_MIN_WORDS:
                out.append(buffer)
                buffer = []
            buffer = buffer + unit
            if len(buffer) >= PASSAGE_TARGET_WORDS:
                out.append(buffer)
                buffer = []
    if buffer:
        if out and len(buffer) < PASSAGE_MIN_WORDS:
            out[-1] = out[-1] + buffer
        else:
            out.append(buffer)
    return [" ".join(words) for words in out]


def load_items(work_dir: Path) -> list[dict]:
    with (work_dir / "items.jsonl").open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle]


def passage_table(items: list[dict]) -> list[dict]:
    furniture = corpus_furniture(items)
    rows = []
    for item in items:
        for index, text in enumerate(passages(item["text"], furniture)):
            rows.append({
                "item": item["id"],
                "index": index,
                "words": len(text.split()),
                "hash": hashlib.sha256(text.encode("utf-8")).hexdigest(),
                "text": text,
            })
    return rows


# --- Embedding ----------------------------------------------------------------

CACHE_KEY = f"{MODEL}@{MODEL_REVISION}|{TASK_PREFIX}|{INFERENCE_DTYPE}"
# The ONNX export of the same checkpoint, for machines where the reference
# stack is slow or will not install (on Windows ARM64 torchvision has no wheel
# and torch runs about three times slower than ONNX Runtime). It is accepted
# only after it reproduces vectors the reference encoder already cached.
ONNX_REPO = "onnx-community/embeddinggemma-2-ONNX"
ONNX_REVISION = "daa72c51243991dfcaf9f9137d2c573d8f7790c0"
ONNX_MIN_AGREEMENT = 0.99999


class OnnxGemmaEmbedder:
    """Text-only EmbeddingGemma 2 in ONNX Runtime: mean pooling over prompt and text, unit L2, float32."""

    def __init__(self, threads: int):
        import onnxruntime
        from huggingface_hub import hf_hub_download
        from transformers import AutoTokenizer

        hf_hub_download(ONNX_REPO, "onnx/model.onnx_data", revision=ONNX_REVISION)
        path = hf_hub_download(ONNX_REPO, "onnx/model.onnx", revision=ONNX_REVISION)
        options = onnxruntime.SessionOptions()
        options.intra_op_num_threads = threads
        self._session = onnxruntime.InferenceSession(path, options, providers=["CPUExecutionProvider"])
        self._tokenizer = AutoTokenizer.from_pretrained(MODEL, revision=MODEL_REVISION)

    def __call__(self, texts):
        import numpy as np

        encoded = self._tokenizer([TASK_PREFIX + text for text in texts], padding=True, return_tensors="np")
        feeds = {name: encoded[name].astype(np.int64) for name in ("input_ids", "attention_mask")}
        # The export always declares the multimodal inputs; text needs none of them.
        for name in ("image_features", "video_features", "audio_features"):
            feeds[name] = np.zeros((0, 512), np.float32)
        hidden = self._session.run(["last_hidden_state"], feeds)[0]
        mask = encoded["attention_mask"][..., None].astype(np.float32)
        vectors = (hidden * mask).sum(axis=1) / mask.sum(axis=1)
        vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)
        if vectors.shape != (len(texts), OUTPUT_DIMS) or not np.isfinite(vectors).all():
            raise RuntimeError("ONNX encoder returned an unexpected or non-finite result")
        return vectors.astype(np.float32)


def read_caches(work_dir: Path) -> dict:
    import numpy as np

    cache = {}
    for path in sorted(work_dir.glob("passage-cache*.npz")):
        stored = np.load(path)
        if str(stored["model"]) == CACHE_KEY:
            cache.update(zip(stored["hashes"].tolist(), stored["vectors"]))
    return cache


def write_cache(path: Path, cache: dict) -> None:
    import numpy as np

    hashes = list(cache)
    np.savez(
        path,
        model=np.array(CACHE_KEY),
        hashes=np.array(hashes),
        vectors=np.stack([cache[h] for h in hashes]) if hashes else np.zeros((0, OUTPUT_DIMS), np.float32),
    )


def embed(work_dir: Path, batch: int, engine: str, threads: int, shard: int, shards: int) -> int:
    import numpy as np

    items = load_items(work_dir)
    rows = passage_table(items)
    cache = read_caches(work_dir)
    todo = sorted({row["hash"]: row for row in rows if row["hash"] not in cache}.values(), key=lambda row: row["words"])
    todo = todo[shard::shards]
    print(f"{len(items)} items, {len(rows)} passages, {len(todo)} to embed in shard {shard + 1}/{shards}")
    if todo:
        if engine == "onnx":
            embedder = OnnxGemmaEmbedder(threads)
            by_hash = {row["hash"]: row["text"] for row in rows}
            reference = [h for h in cache if h in by_hash][:16]
            if len(reference) < 8:
                raise SystemExit("Run the reference engine first: the ONNX engine is checked against its cached vectors.")
            agreement = (embedder([by_hash[h] for h in reference]) * np.stack([cache[h] for h in reference])).sum(axis=1)
            print(f"ONNX agreement with reference vectors: min cosine {agreement.min():.7f}")
            if agreement.min() < ONNX_MIN_AGREEMENT:
                raise SystemExit("ONNX encoder disagrees with the reference encoder")
        else:
            embedder = GemmaEmbedder()
        shard_path = work_dir / ("passage-cache.npz" if shards == 1 else f"passage-cache.shard{shard}.npz")
        mine = dict(cache) if shards == 1 else {}
        started = time.time()
        for start in range(0, len(todo), batch):
            chunk = todo[start : start + batch]
            for row, vector in zip(chunk, embedder([row["text"] for row in chunk])):
                mine[row["hash"]] = np.asarray(vector, dtype=np.float32)
            done = start + len(chunk)
            if (start // batch) % 25 == 24 or done == len(todo):
                write_cache(shard_path, mine)
            rate = done / max(time.time() - started, 1e-9)
            print(f"\r{done}/{len(todo)} passages, {rate:.2f}/s, ~{(len(todo) - done) / rate / 60:.0f} min left", end="", flush=True)
        print()
        if shards > 1:
            return 0
        cache = read_caches(work_dir)

    missing = sum(1 for row in rows if row["hash"] not in cache)
    if missing:
        print(f"{missing} passages have no vector yet: let every shard finish, then run embed once without --shards.")
        return 1
    write_cache(work_dir / "passage-cache.npz", cache)
    for path in work_dir.glob("passage-cache.shard*.npz"):
        path.unlink()
    vectors = np.stack([cache[row["hash"]] for row in rows]).astype("<f4")
    if not np.isfinite(vectors).all():
        raise SystemExit("non-finite passage vector")
    np.save(work_dir / "passage-vectors.npy", vectors)
    with (work_dir / "passages.jsonl").open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps({k: row[k] for k in ("item", "index", "words", "text")}, ensure_ascii=False) + "\n")
    (work_dir / "embed-manifest.json").write_text(json.dumps({
        "schema": SCHEMA, "model": MODEL, "modelRevision": MODEL_REVISION, "taskPrefix": TASK_PREFIX,
        "inferenceDtype": INFERENCE_DTYPE, "dimensions": OUTPUT_DIMS, "normalization": "unit-l2",
        "pooling": "mean over prompt and text tokens", "onnxExport": f"{ONNX_REPO}@{ONNX_REVISION}",
        "onnxMinAgreement": ONNX_MIN_AGREEMENT,
        "passageWords": {"target": PASSAGE_TARGET_WORDS, "max": PASSAGE_MAX_WORDS, "min": PASSAGE_MIN_WORDS},
        "passages": len(rows), "items": len(items),
    }, indent=2), encoding="utf-8")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("stage", choices=("embed", "analyse"))
    parser.add_argument("--work-dir", required=True, type=Path)
    parser.add_argument("--batch", type=int, default=1)
    parser.add_argument("--engine", choices=("reference", "onnx"), default="reference",
                        help="reference: sentence-transformers, as in the module's build; onnx: the checked ONNX export")
    parser.add_argument("--threads", type=int, default=4, help="ONNX Runtime threads per process")
    parser.add_argument("--shard", type=int, default=0)
    parser.add_argument("--shards", type=int, default=1)
    parser.add_argument("--amira-dir", type=Path, help="a downloaded semantic-embeddings + semantic-inputs release, for the comparison with metadata cards")
    args = parser.parse_args()
    if args.stage == "embed":
        return embed(args.work_dir, args.batch, args.engine, args.threads, args.shard, args.shards)
    from fulltext_analyse import analyse

    return analyse(args.work_dir, args.amira_dir)


if __name__ == "__main__":
    raise SystemExit(main())
