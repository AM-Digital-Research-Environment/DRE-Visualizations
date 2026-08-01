#!/usr/bin/env python3
"""Build AMIRA's shared semantic map, recommendations, and vector release.

The source is the unauthenticated public Omeka API. Six profile-declared
corpora are converted to comparable, length-bounded archival cards, embedded
in one multilingual Gemini space, then projected with UMAP. Full vectors stay
in a gitignored incremental cache and release bundle; only compact derived JSON
is committed under ``asset/data/embeddings``.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import random
import re
import sys
import time
from array import array
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Sequence
from urllib.parse import urlencode
from urllib.request import Request, urlopen


REPO_ROOT = Path(__file__).resolve().parents[2]
PROFILE_PATH = REPO_ROOT / "config" / "amira-profile.json"
OUT_DIR = REPO_ROOT / "asset" / "data" / "embeddings"
CACHE_PATH = OUT_DIR / "cache.json"
RELEASE_DIR = OUT_DIR / "release"

API_BASE = os.environ.get(
    "OMEKA_API_BASE", "https://data.africamultiple.uni-bayreuth.de"
).rstrip("/")
MODEL = os.environ.get("GEMINI_EMBEDDING_MODEL", "gemini-embedding-2")
OUTPUT_DIMS = int(os.environ.get("GEMINI_EMBEDDING_DIMS", "768"))
TASK_PREFIX = os.environ.get(
    "GEMINI_EMBEDDING_TASK_PREFIX", "task: sentence similarity | query: "
)
BATCH_SIZE = int(os.environ.get("GEMINI_EMBEDDING_BATCH", "32"))
INTER_BATCH_DELAY_S = float(os.environ.get("GEMINI_EMBEDDING_DELAY_S", "0.5"))
FLUSH_EVERY_BATCHES = int(os.environ.get("GEMINI_EMBEDDING_FLUSH_EVERY", "5"))

CARD_MAX_WORDS = 900
LOW_SIGNAL_THRESHOLD = 100
SIMILAR_TOP_K = 12
UMAP_NEIGHBORS = 15
UMAP_MIN_DIST = 0.1
UMAP_SEED = 42
SCHEMA_VERSION = 1

TERM_RE = re.compile(r"^[a-z][a-z0-9]*:[A-Za-z][A-Za-z0-9]*$")
ID_RE = re.compile(r"^[a-z][a-z0-9-]*$")
TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"\s+")


@dataclass(frozen=True)
class CorpusConfig:
    id: str
    label: str
    selector: str
    selector_id: int
    text_fields: tuple[str, ...]


@dataclass
class Card:
    id: int
    corpus: str
    type_label: str
    title: str
    text: str
    content_hash: str
    input_chars: int
    input_words: int
    truncated: bool
    low_signal: bool
    languages: list[str]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def compact_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    tmp.replace(path)


def pretty_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    tmp.replace(path)


def load_profile(path: Path = PROFILE_PATH) -> tuple[dict[str, Any], list[CorpusConfig]]:
    profile = json.loads(path.read_text(encoding="utf-8"))
    item_sets = profile.get("itemSets")
    templates = profile.get("templates")
    raw_corpora = profile.get("embeddingCorpora")
    if not isinstance(item_sets, dict) or not isinstance(templates, dict):
        raise ValueError("AMIRA profile is missing item-set/template selectors")
    if not isinstance(raw_corpora, list) or not raw_corpora:
        raise ValueError("AMIRA profile has no embeddingCorpora")

    corpora: list[CorpusConfig] = []
    seen: set[str] = set()
    for raw in raw_corpora:
        if not isinstance(raw, dict):
            raise ValueError("embeddingCorpora entries must be objects")
        corpus_id = raw.get("id")
        label = raw.get("label")
        item_set_key = raw.get("itemSetKey")
        template_key = raw.get("templateKey")
        fields = raw.get("textFields")
        has_item_set = isinstance(item_set_key, str) and item_set_key in item_sets
        has_template = isinstance(template_key, str) and template_key in templates
        if (
            not isinstance(corpus_id, str)
            or not ID_RE.fullmatch(corpus_id)
            or corpus_id in seen
            or not isinstance(label, str)
            or not label.strip()
            or has_item_set == has_template
            or not isinstance(fields, list)
            or not fields
            or any(not isinstance(field, str) or not TERM_RE.fullmatch(field) for field in fields)
        ):
            raise ValueError(f"Invalid embedding corpus configuration: {raw!r}")
        selector = "item_set_id" if has_item_set else "resource_template_id"
        selector_id = item_sets[item_set_key] if has_item_set else templates[template_key]
        if not isinstance(selector_id, int) or selector_id < 1:
            raise ValueError(f"Invalid embedding selector id: {raw!r}")
        corpora.append(
            CorpusConfig(
                id=corpus_id,
                label=label.strip(),
                selector=selector,
                selector_id=selector_id,
                text_fields=tuple(fields),
            )
        )
        seen.add(corpus_id)
    return profile, corpora


def fetch_json(url: str, attempts: int = 4) -> Any:
    for attempt in range(1, attempts + 1):
        try:
            request = Request(url, headers={"User-Agent": "dre-embeddings/1.0"})
            with urlopen(request, timeout=90) as response:
                return json.load(response)
        except Exception:
            if attempt == attempts:
                raise
            time.sleep(3 * attempt)
    raise AssertionError("unreachable")


def fetch_corpus(corpus: CorpusConfig, fetcher: Callable[[str], Any] = fetch_json) -> list[dict]:
    items: list[dict] = []
    page = 1
    while True:
        query = urlencode({corpus.selector: corpus.selector_id, "per_page": 100, "page": page})
        batch = fetcher(f"{API_BASE}/api/items?{query}")
        if not isinstance(batch, list):
            raise ValueError(f"Omeka returned a non-list for {corpus.id}")
        items.extend(item for item in batch if isinstance(item, dict))
        if len(batch) < 100:
            return items
        page += 1
        time.sleep(0.15)


def value_text(value: Any) -> str:
    if not isinstance(value, dict):
        return ""
    for key in ("display_title", "@value", "@id"):
        candidate = value.get(key)
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return ""


def values(item: dict, term: str) -> list[str]:
    raw = item.get(term)
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for value in raw:
        text = value_text(value)
        if text and text not in seen:
            out.append(text)
            seen.add(text)
    return out


def linked_ids(item: dict, term: str) -> list[int]:
    out: list[int] = []
    for value in item.get(term) or []:
        if not isinstance(value, dict):
            continue
        item_id = value.get("value_resource_id")
        if isinstance(item_id, int) and item_id > 0 and item_id not in out:
            out.append(item_id)
    return out


def clean_text(text: str) -> str:
    return SPACE_RE.sub(" ", TAG_RE.sub(" ", text)).strip()


def title_of(item: dict) -> str:
    title = item.get("o:title")
    if isinstance(title, str) and title.strip():
        return clean_text(title)
    titles = values(item, "dcterms:title")
    return clean_text(titles[0]) if titles else f"Item {item.get('o:id', '')}".strip()


def relationship_context(
    item: dict,
    item_id: int,
    project_items: dict[int, dict],
    section_items: dict[int, dict],
) -> tuple[list[str], list[str]]:
    project_ids: list[int] = []
    section_ids: list[int] = []
    for term in ("dcterms:isPartOf", "dcterms:relation"):
        for linked_id in linked_ids(item, term):
            if linked_id in project_items and linked_id not in project_ids:
                project_ids.append(linked_id)
            if linked_id in section_items and linked_id not in section_ids:
                section_ids.append(linked_id)
    if item_id in project_items:
        project_ids = [item_id]
    for project_id in project_ids:
        for linked_id in linked_ids(project_items[project_id], "dcterms:isPartOf"):
            if linked_id in section_items and linked_id not in section_ids:
                section_ids.append(linked_id)
    return (
        [title_of(project_items[value]) for value in project_ids],
        [title_of(section_items[value]) for value in section_ids],
    )


def build_card(
    item: dict,
    corpus: CorpusConfig,
    project_items: dict[int, dict],
    section_items: dict[int, dict],
    max_words: int = CARD_MAX_WORDS,
    low_signal_threshold: int = LOW_SIGNAL_THRESHOLD,
) -> Card:
    item_id = item.get("o:id")
    if not isinstance(item_id, int) or item_id < 1:
        raise ValueError("Public Omeka item has no positive integer o:id")
    title = title_of(item)
    projects, sections = relationship_context(item, item_id, project_items, section_items)
    subjects = values(item, "dcterms:subject")
    places = values(item, "dcterms:spatial")
    languages = values(item, "dcterms:language")

    parts = [f"Title: {title}", f"Type: {corpus.label}"]
    if projects:
        parts.append("Project: " + "; ".join(projects))
    if sections:
        parts.append("Research section: " + "; ".join(sections))
    if subjects:
        parts.append("Subjects: " + "; ".join(subjects))
    if places:
        parts.append("Places: " + "; ".join(places))
    if languages:
        parts.append("Languages: " + "; ".join(languages))

    narrative = ""
    narrative_field = ""
    for field in corpus.text_fields:
        candidate = clean_text(" ".join(values(item, field)))
        if candidate:
            narrative = candidate
            narrative_field = field
            break
    if narrative:
        label = "Abstract" if "abstract" in narrative_field.lower() else "Description"
        parts.append(f"{label}: {narrative}")

    full_text = "\n".join(parts).strip()
    words = full_text.split()
    truncated = len(words) > max_words
    if truncated:
        full_text = " ".join(words[:max_words])
    input_chars = len(full_text)
    input_words = len(full_text.split())
    return Card(
        id=item_id,
        corpus=corpus.id,
        type_label=corpus.label,
        title=title,
        text=full_text,
        content_hash=hashlib.sha256(full_text.encode("utf-8")).hexdigest(),
        input_chars=input_chars,
        input_words=input_words,
        truncated=truncated,
        low_signal=input_chars < low_signal_threshold,
        languages=languages,
    )


def load_cards(
    corpora: Sequence[CorpusConfig],
    fetcher: Callable[[str], Any] = fetch_json,
) -> tuple[list[Card], dict[str, dict[str, int]]]:
    by_corpus: dict[str, list[dict]] = {}
    counts: dict[str, dict[str, int]] = {}
    for corpus in corpora:
        raw = fetch_corpus(corpus, fetcher)
        public = [item for item in raw if item.get("o:is_public") is True]
        by_corpus[corpus.id] = public
        counts[corpus.id] = {
            "fetched": len(raw),
            "public": len(public),
            "nonPublicSkipped": len(raw) - len(public),
        }
        print(f"  {corpus.id}: {len(public)} public item(s)")

    project_items = {
        item["o:id"]: item
        for item in by_corpus.get("projects", [])
        if isinstance(item.get("o:id"), int)
    }
    section_items = {
        item["o:id"]: item
        for item in by_corpus.get("sections", [])
        if isinstance(item.get("o:id"), int)
    }

    cards: list[Card] = []
    seen_ids: set[int] = set()
    for corpus in corpora:
        for item in by_corpus[corpus.id]:
            card = build_card(item, corpus, project_items, section_items)
            if card.id in seen_ids:
                raise ValueError(f"Item {card.id} appears in more than one embedding corpus")
            seen_ids.add(card.id)
            cards.append(card)
        corpus_cards = [card for card in cards if card.corpus == corpus.id]
        counts[corpus.id].update(
            {
                "cards": len(corpus_cards),
                "lowSignal": sum(card.low_signal for card in corpus_cards),
                "truncated": sum(card.truncated for card in corpus_cards),
            }
        )
    cards.sort(key=lambda card: card.id)
    return cards, counts


def empty_cache() -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "model": MODEL,
        "dims": OUTPUT_DIMS,
        "taskPrefix": TASK_PREFIX,
        "items": {},
    }


def load_cache(path: Path = CACHE_PATH) -> dict[str, Any]:
    if not path.is_file():
        return empty_cache()
    try:
        cache = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return empty_cache()
    compatible = (
        cache.get("schemaVersion") == SCHEMA_VERSION
        and cache.get("model") == MODEL
        and cache.get("dims") == OUTPUT_DIMS
        and cache.get("taskPrefix") == TASK_PREFIX
        and isinstance(cache.get("items"), dict)
    )
    return cache if compatible else empty_cache()


class GeminiEmbedder:
    def __init__(self, api_key: str):
        from google import genai

        self._client = genai.Client(api_key=api_key)

    def close(self) -> None:
        self._client.close()

    def __call__(self, texts: Sequence[str], retries: int = 5) -> list[list[float]]:
        from google.genai import types
        from google.genai.errors import APIError

        contents = [
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=TASK_PREFIX + text)],
            )
            for text in texts
        ]
        delay = 2.0
        for attempt in range(retries):
            try:
                response = self._client.models.embed_content(
                    model=MODEL,
                    contents=contents,
                    config=types.EmbedContentConfig(
                        output_dimensionality=OUTPUT_DIMS,
                        auto_truncate=False,
                    ),
                )
                vectors = [list(embedding.values or []) for embedding in response.embeddings or []]
                if len(vectors) != len(texts):
                    raise RuntimeError(
                        f"Gemini returned {len(vectors)} vectors for {len(texts)} Content objects"
                    )
                if any(len(vector) != OUTPUT_DIMS for vector in vectors):
                    raise RuntimeError("Gemini returned an unexpected embedding dimension")
                return vectors
            except APIError as error:
                status = getattr(error, "status_code", None) or getattr(error, "code", None)
                if status not in (429, 500, 502, 503, 504) or attempt == retries - 1:
                    raise
                time.sleep(delay + random.random())
                delay = min(delay * 2, 60)
        raise AssertionError("unreachable")


def update_cache(
    cards: Sequence[Card],
    cache: dict[str, Any],
    embed: Callable[[Sequence[str]], list[list[float]]],
    scope: str,
    cache_path: Path = CACHE_PATH,
) -> dict[str, int]:
    items: dict[str, Any] = cache["items"]
    live_ids = {str(card.id) for card in cards}
    stale = [item_id for item_id in items if item_id not in live_ids]
    for item_id in stale:
        del items[item_id]

    pending = [
        card
        for card in cards
        if scope == "all"
        or str(card.id) not in items
        or items[str(card.id)].get("hash") != card.content_hash
    ]
    reused = len(cards) - len(pending)
    batches_since_flush = 0
    try:
        for offset in range(0, len(pending), BATCH_SIZE):
            batch = pending[offset : offset + BATCH_SIZE]
            started = time.time()
            vectors = embed([card.text for card in batch])
            if len(vectors) != len(batch):
                raise RuntimeError("Embedding provider returned the wrong batch size")
            for card, vector in zip(batch, vectors):
                if len(vector) != OUTPUT_DIMS:
                    raise RuntimeError(f"Item {card.id} has {len(vector)} dimensions, expected {OUTPUT_DIMS}")
                items[str(card.id)] = {
                    "hash": card.content_hash,
                    "vector": vector,
                }
            batches_since_flush += 1
            print(f"  embedded {min(offset + len(batch), len(pending))}/{len(pending)}")
            if batches_since_flush >= FLUSH_EVERY_BATCHES:
                compact_json(cache_path, cache)
                batches_since_flush = 0
            elapsed = time.time() - started
            if INTER_BATCH_DELAY_S > elapsed and offset + BATCH_SIZE < len(pending):
                time.sleep(INTER_BATCH_DELAY_S - elapsed)
    except BaseException:
        # Preserve paid-for successful batches across API failures and Ctrl-C.
        compact_json(cache_path, cache)
        raise

    compact_json(cache_path, cache)
    return {"embedded": len(pending), "reused": reused, "staleRemoved": len(stale)}


def vector_matrix(cards: Sequence[Card], cache: dict[str, Any]):
    import numpy as np

    matrix = np.asarray(
        [cache["items"][str(card.id)]["vector"] for card in cards], dtype=np.float32
    )
    if matrix.shape != (len(cards), OUTPUT_DIMS):
        raise ValueError(f"Unexpected embedding matrix shape: {matrix.shape}")
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    if np.any(norms == 0):
        raise ValueError("Embedding matrix contains a zero vector")
    return matrix / norms


def project_and_cluster(matrix):
    import numpy as np
    import umap
    from sklearn.cluster import KMeans

    count = matrix.shape[0]
    if count == 1:
        return np.zeros((1, 2), dtype=np.float32), np.zeros(1, dtype=np.int32), 1
    if count == 2:
        # UMAP requires at least two neighbours. Keep the tiny-corpus contract
        # valid and deterministic without changing the normal projection path.
        coords = np.asarray([[-1.0, 0.0], [1.0, 0.0]], dtype=np.float32)
        return coords, np.asarray([0, 1], dtype=np.int32), 2
    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=min(UMAP_NEIGHBORS, count - 1),
        min_dist=UMAP_MIN_DIST,
        metric="cosine",
        random_state=UMAP_SEED,
        n_jobs=1,
    )
    coords = reducer.fit_transform(matrix)
    cluster_count = min(count, max(2, min(30, round(math.sqrt(count / 2)))))
    clusters = KMeans(n_clusters=cluster_count, random_state=UMAP_SEED, n_init="auto").fit_predict(matrix)
    return coords, clusters, cluster_count


def similar_items(cards: Sequence[Card], matrix, top_k: int = SIMILAR_TOP_K) -> dict[str, list[dict[str, Any]]]:
    import numpy as np

    eligible = [index for index, card in enumerate(cards) if not card.low_signal]
    if len(eligible) < 2:
        return {}
    eligible_matrix = matrix[eligible]
    output: dict[str, list[dict[str, Any]]] = {}
    k = min(top_k, len(eligible) - 1)
    for start in range(0, len(eligible), 256):
        source_indices = eligible[start : start + 256]
        scores = matrix[source_indices] @ eligible_matrix.T
        for row_index, source_index in enumerate(source_indices):
            source_position = start + row_index
            scores[row_index, source_position] = -np.inf
            candidate_positions = np.argpartition(scores[row_index], -k)[-k:]
            candidate_positions = candidate_positions[
                np.argsort(-scores[row_index, candidate_positions])
            ]
            output[str(cards[source_index].id)] = [
                {
                    "id": cards[eligible[position]].id,
                    "score": round(float(scores[row_index, position]), 6),
                }
                for position in candidate_positions
                if math.isfinite(float(scores[row_index, position]))
                and float(scores[row_index, position]) > 0
            ]
    return output


def catalog_entry(card: Card) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "title": card.title,
        "type": card.corpus,
        "typeLabel": card.type_label,
        "lowSignal": card.low_signal,
    }
    if card.languages:
        entry["languages"] = card.languages
    return entry


def recommendation_quality(
    cards: Sequence[Card], recommendations: dict[str, list[dict[str, Any]]]
) -> dict[str, Any]:
    by_id = {str(card.id): card for card in cards}
    cross_type = 0
    cross_language = 0
    examples: list[dict[str, Any]] = []
    scores: list[float] = []
    for source_id, neighbours in recommendations.items():
        source = by_id[source_id]
        if any(by_id[str(n["id"])].corpus != source.corpus for n in neighbours):
            cross_type += 1
        source_langs = set(source.languages)
        language_match = next(
            (
                n
                for n in neighbours
                if source_langs
                and set(by_id[str(n["id"])].languages)
                and source_langs.isdisjoint(by_id[str(n["id"])].languages)
            ),
            None,
        )
        if language_match:
            cross_language += 1
            if len(examples) < 12:
                target = by_id[str(language_match["id"])]
                examples.append(
                    {
                        "source": source.id,
                        "sourceLanguages": source.languages,
                        "target": target.id,
                        "targetLanguages": target.languages,
                        "score": language_match["score"],
                    }
                )
        scores.extend(float(neighbour["score"]) for neighbour in neighbours)
    return {
        "sources": len(recommendations),
        "sourcesWithCrossTypeNeighbour": cross_type,
        "sourcesWithCrossLanguageNeighbour": cross_language,
        "meanSimilarity": round(sum(scores) / len(scores), 6) if scores else None,
        "crossLanguageExamples": examples,
    }


def write_release(matrix, cards: Sequence[Card], generated_at: str) -> dict[str, Any]:
    RELEASE_DIR.mkdir(parents=True, exist_ok=True)
    vector_path = RELEASE_DIR / "vectors.f32"
    payload = array("f", matrix.astype("<f4", copy=False).ravel())
    if sys.byteorder != "little":
        payload.byteswap()
    vector_path.write_bytes(payload.tobytes())
    ids_payload = [
        {
            "id": card.id,
            "type": card.corpus,
            "lowSignal": card.low_signal,
            "contentHash": card.content_hash,
        }
        for card in cards
    ]
    compact_json(RELEASE_DIR / "ids.json", ids_payload)
    checksum = hashlib.sha256(vector_path.read_bytes()).hexdigest()
    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "model": MODEL,
        "dimensions": OUTPUT_DIMS,
        "dtype": "float32-le",
        "normalization": "l2",
        "count": len(cards),
        "taskPrefix": TASK_PREFIX,
        "rowOrder": "ids.json",
        "vectors": "vectors.f32",
        "vectorsSha256": checksum,
        "generatedAt": generated_at,
        "source": API_BASE,
        "sourceCommit": os.environ.get("GITHUB_SHA") or None,
    }
    pretty_json(RELEASE_DIR / "manifest.json", manifest)
    return manifest


def write_derived(
    cards: Sequence[Card],
    matrix,
    coords,
    clusters,
    cluster_count: int,
    recommendations: dict[str, list[dict[str, Any]]],
    corpus_counts: dict[str, dict[str, int]],
    cache_stats: dict[str, int],
) -> dict[str, Any]:
    generated_at = utc_now()
    counts = Counter(card.corpus for card in cards)
    map_payload = {
        "schemaVersion": SCHEMA_VERSION,
        "model": MODEL,
        "dimensions": OUTPUT_DIMS,
        "generatedAt": generated_at,
        "lowSignalThreshold": LOW_SIGNAL_THRESHOLD,
        "cardMaxWords": CARD_MAX_WORDS,
        "umap": {
            "neighbors": UMAP_NEIGHBORS,
            "minDist": UMAP_MIN_DIST,
            "metric": "cosine",
            "seed": UMAP_SEED,
        },
        "clustering": {"algorithm": "k-means", "clusters": cluster_count, "seed": UMAP_SEED},
        "types": dict(sorted(counts.items())),
        "items": [
            {
                "id": card.id,
                "x": round(float(coords[index][0]), 6),
                "y": round(float(coords[index][1]), 6),
                "type": card.corpus,
                "typeLabel": card.type_label,
                "cluster": int(clusters[index]),
                "lowSignal": card.low_signal,
                "title": card.title,
            }
            for index, card in enumerate(cards)
        ],
    }
    map_path = OUT_DIR / "map.json"
    similar_path = OUT_DIR / "similar.json"
    compact_json(map_path, map_payload)
    compact_json(
        similar_path,
        {
            "schemaVersion": SCHEMA_VERSION,
            "model": MODEL,
            "dimensions": OUTPUT_DIMS,
            "generatedAt": generated_at,
            "topK": SIMILAR_TOP_K,
            "catalog": {str(card.id): catalog_entry(card) for card in cards},
            "items": recommendations,
        },
    )
    quality = recommendation_quality(cards, recommendations)
    release_manifest = write_release(matrix, cards, generated_at)
    report = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": generated_at,
        "source": API_BASE,
        "model": MODEL,
        "dimensions": OUTPUT_DIMS,
        "taskPrefix": TASK_PREFIX,
        "cardPolicy": {
            "maxWords": CARD_MAX_WORDS,
            "lowSignalThresholdChars": LOW_SIGNAL_THRESHOLD,
            "allItemsShareTheSameLengthBudget": True,
        },
        "corpora": corpus_counts,
        "totals": {
            "cards": len(cards),
            "lowSignal": sum(card.low_signal for card in cards),
            "recommendable": sum(not card.low_signal for card in cards),
            "truncated": sum(card.truncated for card in cards),
            "maximumInputWords": max((card.input_words for card in cards), default=0),
        },
        "cache": cache_stats,
        "artifactBytes": {
            "map": map_path.stat().st_size,
            "similar": similar_path.stat().st_size,
        },
        "recommendations": quality,
        "release": release_manifest,
    }
    pretty_json(OUT_DIR / "report.json", report)
    return report


def validate_artifacts(out_dir: Path = OUT_DIR, release_dir: Path = RELEASE_DIR) -> dict[str, int]:
    """Fail closed when derived JSON and the vector release disagree."""
    paths = {
        "map": out_dir / "map.json",
        "similar": out_dir / "similar.json",
        "report": out_dir / "report.json",
        "ids": release_dir / "ids.json",
        "manifest": release_dir / "manifest.json",
        "vectors": release_dir / "vectors.f32",
    }
    missing = [str(path) for path in paths.values() if not path.is_file()]
    if missing:
        raise ValueError(f"Missing semantic artifacts: {', '.join(missing)}")

    try:
        map_data = json.loads(paths["map"].read_text(encoding="utf-8"))
        similar_data = json.loads(paths["similar"].read_text(encoding="utf-8"))
        report = json.loads(paths["report"].read_text(encoding="utf-8"))
        release_ids = json.loads(paths["ids"].read_text(encoding="utf-8"))
        manifest = json.loads(paths["manifest"].read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise ValueError(f"Unreadable semantic artifact: {exc}") from exc

    metadata = (map_data, similar_data, report, manifest)
    if any(payload.get("schemaVersion") != SCHEMA_VERSION for payload in metadata):
        raise ValueError("Semantic artifacts do not share the expected schema version.")
    if any(payload.get("model") != MODEL for payload in (map_data, similar_data, report, manifest)):
        raise ValueError("Semantic artifacts do not share the configured embedding model.")
    if any(payload.get("dimensions") != OUTPUT_DIMS for payload in (map_data, similar_data, report, manifest)):
        raise ValueError("Semantic artifacts do not share the configured vector dimensions.")

    map_items = map_data.get("items")
    catalog = similar_data.get("catalog")
    recommendations = similar_data.get("items")
    if not isinstance(map_items, list) or not isinstance(catalog, dict) or not isinstance(recommendations, dict):
        raise ValueError("Semantic map or recommendation payload has an invalid shape.")
    if not isinstance(release_ids, list):
        raise ValueError("Release ids.json must contain a list.")

    map_ids = [str(row.get("id")) for row in map_items]
    catalog_ids = list(catalog)
    vector_ids = [str(row.get("id")) for row in release_ids]
    if len(map_ids) != len(set(map_ids)) or len(vector_ids) != len(set(vector_ids)):
        raise ValueError("Semantic artifacts contain duplicate resource IDs.")
    if set(map_ids) != set(catalog_ids) or map_ids != vector_ids:
        raise ValueError("Map, recommendation catalog, and vector row IDs disagree.")

    low_signal_ids = {str(row["id"]) for row in map_items if row.get("lowSignal") is True}
    for source_id, neighbours in recommendations.items():
        if source_id not in catalog or source_id in low_signal_ids or not isinstance(neighbours, list):
            raise ValueError(f"Invalid recommendation source: {source_id}")
        for neighbour in neighbours:
            target_id = str(neighbour.get("id"))
            score = neighbour.get("score")
            if (
                target_id not in catalog
                or target_id == source_id
                or target_id in low_signal_ids
                or not isinstance(score, (int, float))
                or not math.isfinite(score)
                or score <= 0
            ):
                raise ValueError(f"Invalid recommendation {source_id} -> {target_id}")

    vector_bytes = paths["vectors"].read_bytes()
    expected_bytes = len(vector_ids) * OUTPUT_DIMS * 4
    if len(vector_bytes) != expected_bytes:
        raise ValueError(f"Vector byte length is {len(vector_bytes)}; expected {expected_bytes}.")
    if manifest.get("count") != len(vector_ids):
        raise ValueError("Vector manifest count does not match ids.json.")
    if manifest.get("vectorsSha256") != hashlib.sha256(vector_bytes).hexdigest():
        raise ValueError("Vector checksum does not match the release manifest.")

    totals = report.get("totals", {})
    if totals.get("cards") != len(map_ids) or totals.get("lowSignal") != len(low_signal_ids):
        raise ValueError("Build report totals do not match the public artifact set.")
    if report.get("artifactBytes") != {
        "map": paths["map"].stat().st_size,
        "similar": paths["similar"].stat().st_size,
    }:
        raise ValueError("Build report byte counts do not match the derived artifacts.")
    return {
        "cards": len(map_ids),
        "recommendationSources": len(recommendations),
        "lowSignal": len(low_signal_ids),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--scope", choices=("missing", "all"), default="missing")
    parser.add_argument(
        "--validate-profile",
        action="store_true",
        help="Validate and print corpus selectors without network or model access.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch public records and report card/cache counts without embedding.",
    )
    parser.add_argument(
        "--validate-artifacts",
        action="store_true",
        help="Validate the complete derived and vector artifact set without network access.",
    )
    args = parser.parse_args()

    if args.validate_artifacts:
        summary = validate_artifacts()
        print(
            f"Validated {summary['cards']} semantic cards and "
            f"{summary['recommendationSources']} recommendation sources."
        )
        return 0

    _, corpora = load_profile()
    if args.validate_profile:
        for corpus in corpora:
            print(f"{corpus.id}: {corpus.selector}={corpus.selector_id} ({', '.join(corpus.text_fields)})")
        return 0

    print(f"Fetching {len(corpora)} public corpora from {API_BASE}...")
    cards, corpus_counts = load_cards(corpora)
    if not cards:
        print("No public cards were built.", file=sys.stderr)
        return 1
    cache = load_cache()
    pending = sum(
        args.scope == "all"
        or str(card.id) not in cache["items"]
        or cache["items"][str(card.id)].get("hash") != card.content_hash
        for card in cards
    )
    print(
        f"Built {len(cards)} cards: {sum(card.low_signal for card in cards)} low-signal, "
        f"{sum(card.truncated for card in cards)} length-capped, {pending} to embed."
    )
    if args.dry_run:
        return 0

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("GEMINI_API_KEY (or GOOGLE_API_KEY) is required.", file=sys.stderr)
        return 2

    embedder = GeminiEmbedder(api_key)
    try:
        cache_stats = update_cache(cards, cache, embedder, args.scope)
    finally:
        embedder.close()
    matrix = vector_matrix(cards, cache)
    coords, clusters, cluster_count = project_and_cluster(matrix)
    recommendations = similar_items(cards, matrix)
    report = write_derived(
        cards,
        matrix,
        coords,
        clusters,
        cluster_count,
        recommendations,
        corpus_counts,
        cache_stats,
    )
    print(
        f"Wrote map/similar/report for {report['totals']['cards']} public items; "
        f"{report['recommendations']['sourcesWithCrossTypeNeighbour']} recommendation lists "
        "contain another resource type."
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Interrupted.", file=sys.stderr)
        raise SystemExit(130)
