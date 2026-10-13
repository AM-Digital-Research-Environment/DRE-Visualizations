from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "build_embeddings.py"
SPEC = importlib.util.spec_from_file_location("dre_build_embeddings", SCRIPT)
assert SPEC and SPEC.loader
emb = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = emb
SPEC.loader.exec_module(emb)


def value(text: str, item_id: int | None = None) -> dict:
    row = {"type": "literal", "display_title": text}
    if item_id is not None:
        row.update({"type": "resource:item", "value_resource_id": item_id})
    return row


def item(item_id: int, title: str, *, public: bool = True, **properties) -> dict:
    return {
        "o:id": item_id,
        "o:is_public": public,
        "o:title": title,
        **properties,
    }


class EmbeddingBuildTests(unittest.TestCase):
    def test_repository_profile_resolves_six_mixed_selectors(self):
        _, corpora = emb.load_profile()
        self.assertEqual(6, len(corpora))
        self.assertEqual(("podcasts", "item_set_id", 39095), (
            corpora[0].id, corpora[0].selector, corpora[0].selector_id
        ))
        self.assertEqual(("research-items", "resource_template_id", 10), (
            corpora[-1].id, corpora[-1].selector, corpora[-1].selector_id
        ))

    def test_scope_revision_and_guarded_envelope(self):
        from unittest.mock import patch
        import scoped_source
        expected = {"siteId": 1, "revision": "revision-1", "profile": emb.hashlib.sha256(emb.PROFILE_PATH.read_bytes().replace(b"\r\n", b"\n")).hexdigest()}
        with patch.dict(emb.os.environ, {"OMEKA_SITE_URL": emb.API_BASE + "/s/test"}):
            self.assertEqual(expected, scoped_source.read_scope(lambda _: expected, emb.API_BASE, emb.PROFILE_PATH))
            with self.assertRaises(ValueError):
                scoped_source.verify_scope(expected, lambda _: dict(expected, revision="revision-2"), emb.API_BASE, emb.PROFILE_PATH)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "guarded.php"
            emb.compact_json(path, {"scope": expected, "items": []})
            self.assertTrue(path.read_text().startswith(scoped_source.PREFIX))
            self.assertEqual(expected, emb.read_json(path)["scope"])

    def test_profile_rejects_authority_corpora_and_full_text(self):
        import copy

        profile = emb.read_json(emb.PROFILE_PATH)
        cases = []
        authority_template = copy.deepcopy(profile)
        authority_template["embeddingCorpora"][3] = {
            "id": "persons", "label": "Person", "templateKey": "persons", "textFields": ["dcterms:description"],
        }
        cases.append(authority_template)
        authority_set = copy.deepcopy(profile)
        authority_set["embeddingCorpora"][0]["itemSetKey"] = "subject"
        cases.append(authority_set)
        full_text = copy.deepcopy(profile)
        full_text["embeddingCorpora"][2]["textFields"].append("bibo:content")
        cases.append(full_text)
        for case in cases:
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "profile.json"
                path.write_text(json.dumps(case), encoding="utf-8")
                with self.assertRaises(ValueError):
                    emb.load_profile(path)

    def test_repository_cards_read_abstracts_not_full_text(self):
        _, corpora = emb.load_profile()
        for corpus in corpora:
            self.assertNotIn("bibo:content", corpus.text_fields, corpus.id)

    def test_value_precedence_and_public_fetch_pagination(self):
        self.assertEqual("Linked title", emb.value_text({
            "display_title": "Linked title", "@value": "Literal", "@id": "https://example.test"
        }))
        corpus = emb.CorpusConfig("projects", "Project", "resource_template_id", 5, ("dcterms:abstract",))
        calls = []

        def fetch(url: str):
            calls.append(url)
            return [item(i, f"Project {i}") for i in range(1, 101)] if len(calls) == 1 else []

        rows = emb.fetch_corpus(corpus, fetch, scope={"siteId": 1})
        self.assertEqual(100, len(rows))
        self.assertEqual(2, len(calls))
        self.assertIn("resource_template_id=5", calls[0])
        self.assertIn("site_id=1", calls[0])
        self.assertIn("is_public=1", calls[0])

    def test_card_uses_project_section_context_and_caps_long_text(self):
        section = item(20, "Knowledges")
        project = item(10, "Plural Archives", **{
            "dcterms:isPartOf": [value("Knowledges", 20)]
        })
        research_item = item(1, "Archive recording", **{
            "dcterms:isPartOf": [value("Plural Archives", 10)],
            "dcterms:subject": [value("Oral history")],
            "dcterms:spatial": [value("Ghana")],
            "dcterms:language": [value("English")],
            "dcterms:description": [{"@value": " ".join(f"word{i}" for i in range(50))}],
        })
        corpus = emb.CorpusConfig(
            "research-items", "Research item", "resource_template_id", 10,
            ("dcterms:description",),
        )
        card = emb.build_card(research_item, corpus, {10: project}, {20: section}, max_words=25)
        self.assertIn("Project: Plural Archives", card.text)
        self.assertIn("Research section: Knowledges", card.text)
        self.assertTrue(card.truncated)
        self.assertEqual(25, card.input_words)

    def test_low_signal_ignores_inherited_project_context(self):
        section = item(20, "Knowledges and their long research-section name")
        project = item(10, "A project title that is long enough to fill a card on its own", **{
            "dcterms:isPartOf": [value("Knowledges", 20)]
        })
        corpus = emb.CorpusConfig(
            "research-items", "Research item", "resource_template_id", 10,
            ("dcterms:description",),
        )
        thin = item(1, "BA-0014/f", **{
            "dcterms:isPartOf": [value("Project", 10)],
            "dcterms:subject": [value("Youth")],
            "dcterms:description": [{"@value": "scanned document"}],
        })
        card = emb.build_card(thin, corpus, {10: project}, {20: section})
        self.assertGreater(card.input_chars, emb.LOW_SIGNAL_THRESHOLD)
        self.assertTrue(card.low_signal)

        placeholder = item(2, "Untitled", **{
            "dcterms:description": [{"@value": "x" * 90}],
        })
        self.assertTrue(emb.build_card(placeholder, corpus, {}, {}).low_signal)

        described = item(3, "Interview with a griot", **{
            "dcterms:description": [{"@value": "Recorded in Bamako about praise songs, patronage and the memory of the Mande empire."}],
        })
        self.assertFalse(emb.build_card(described, corpus, {}, {}).low_signal)

    def test_nonpublic_records_never_become_cards(self):
        corpus = emb.CorpusConfig("projects", "Project", "resource_template_id", 5, ("dcterms:abstract",))

        def fetch(url: str):
            return [item(1, "Public"), item(2, "Private", public=False)]

        # Keep the fake response to one page.
        original = emb.fetch_corpus
        try:
            emb.fetch_corpus = lambda _corpus, _fetcher, _scope: fetch("")
            cards, counts = emb.load_cards([corpus], fetch)
        finally:
            emb.fetch_corpus = original
        self.assertEqual([1], [card.id for card in cards])
        self.assertEqual(1, counts["projects"]["nonPublicSkipped"])

    def test_incremental_cache_embeds_only_changed_cards_and_drops_stale(self):
        old_dims, old_batch = emb.OUTPUT_DIMS, emb.BATCH_SIZE
        emb.OUTPUT_DIMS, emb.BATCH_SIZE = 3, 2
        try:
            cards = [
                emb.Card(1, "a", "A", "One", "one", "h1", 3, 1, False, True, []),
                emb.Card(2, "b", "B", "Two", "two", "h2-new", 3, 1, False, False, []),
            ]
            cache = emb.empty_cache()
            cache["items"] = {
                "1": {"hash": "h1", "vector": [1.0, 0.0, 0.0]},
                "2": {"hash": "h2-old", "vector": [0.0, 1.0, 0.0]},
                "99": {"hash": "stale", "vector": [0.0, 0.0, 1.0]},
            }
            batches = []

            def fake_embed(texts):
                batches.append(list(texts))
                return [[0.0, 1.0, 0.0] for _ in texts]

            with tempfile.TemporaryDirectory() as directory:
                stats = emb.update_cache(cards, cache, fake_embed, "missing", Path(directory) / "cache.json")
            self.assertEqual([["two"]], batches)
            self.assertEqual({"embedded": 1, "reused": 1, "sharedWithIdenticalCard": 0, "staleRemoved": 1}, stats)
            self.assertNotIn("99", cache["items"])
        finally:
            emb.OUTPUT_DIMS, emb.BATCH_SIZE = old_dims, old_batch

    def test_identical_cards_are_embedded_once(self):
        old_dims = emb.OUTPUT_DIMS
        emb.OUTPUT_DIMS = 2
        try:
            cards = [
                emb.Card(1, "research-items", "Research item", "News", "same", "h", 4, 1, False, False, []),
                emb.Card(2, "research-items", "Research item", "News", "same", "h", 4, 1, False, False, []),
                emb.Card(3, "research-items", "Research item", "Other", "other", "o", 5, 1, False, False, []),
            ]
            cache = emb.empty_cache()
            batches = []

            def fake_embed(texts):
                batches.append(list(texts))
                return [[1.0, 0.0] for _ in texts]

            with tempfile.TemporaryDirectory() as directory:
                stats = emb.update_cache(cards, cache, fake_embed, "missing", Path(directory) / "cache.json")
            self.assertEqual([["same", "other"]], batches)
            self.assertEqual(2, stats["embedded"])
            self.assertEqual(1, stats["sharedWithIdenticalCard"])
            self.assertEqual({"1", "2", "3"}, set(cache["items"]))
        finally:
            emb.OUTPUT_DIMS = old_dims

    def test_similarity_excludes_low_signal_sources_and_neighbours(self):
        import numpy as np

        cards = [
            emb.Card(1, "podcasts", "Podcast", "One", "", "a", 200, 20, False, False, ["English"]),
            emb.Card(2, "publications", "Publication", "Two", "", "b", 200, 20, False, False, ["French"]),
            emb.Card(3, "projects", "Project", "Three", "", "c", 20, 2, False, True, ["English"]),
        ]
        matrix = np.asarray([[1.0, 0.0], [0.9, 0.1], [1.0, 0.0]], dtype=np.float32)
        matrix /= np.linalg.norm(matrix, axis=1, keepdims=True)
        similar = emb.similar_items(cards, matrix, top_k=2)
        self.assertEqual({"1", "2"}, set(similar))
        self.assertEqual(2, similar["1"][0]["id"])
        self.assertNotIn(3, [row["id"] for neighbours in similar.values() for row in neighbours])

    def test_similarity_skips_identical_cards(self):
        import numpy as np

        cards = [
            emb.Card(1, "research-items", "Research item", "News", "", "same", 200, 20, False, False, []),
            emb.Card(2, "research-items", "Research item", "News", "", "same", 200, 20, False, False, []),
            emb.Card(3, "research-items", "Research item", "News", "", "same", 200, 20, False, False, []),
            emb.Card(4, "publications", "Publication", "Article", "", "a", 200, 20, False, False, []),
            emb.Card(5, "podcasts", "Podcast", "Episode", "", "b", 200, 20, False, False, []),
        ]
        matrix = np.asarray(
            [[1.0, 0.0], [1.0, 0.0], [1.0, 0.0], [0.9, 0.1], [0.5, 0.5]], dtype=np.float32
        )
        matrix /= np.linalg.norm(matrix, axis=1, keepdims=True)
        similar = emb.similar_items(cards, matrix, top_k=2)
        self.assertEqual([4, 5], [row["id"] for row in similar["1"]])
        # One card per distinct text: the twins of 1 appear once in 4's list.
        self.assertEqual(1, sum(row["id"] in (1, 2, 3) for row in similar["4"]))

    def test_two_record_projection_does_not_enter_invalid_umap_mode(self):
        import numpy as np

        coords, clusters, count = emb.project_and_cluster(
            np.asarray([[1.0, 0.0], [0.0, 1.0]], dtype=np.float32)
        )
        self.assertEqual((2, 2), coords.shape)
        self.assertEqual([0, 1], clusters.tolist())
        self.assertEqual(2, count)

    def test_projection_smoke_uses_the_pinned_umap_stack(self):
        import numpy as np

        matrix = np.random.default_rng(42).normal(size=(12, 6)).astype(np.float32)
        matrix /= np.linalg.norm(matrix, axis=1, keepdims=True)
        coords, clusters, count = emb.project_and_cluster(matrix)
        self.assertEqual((12, 2), coords.shape)
        self.assertTrue(np.isfinite(coords).all())
        self.assertEqual(12, len(clusters))
        self.assertGreaterEqual(count, 2)

    def test_release_vectors_are_little_endian_and_checksummed(self):
        import numpy as np

        old_dir, old_dims = emb.RELEASE_DIR, emb.OUTPUT_DIMS
        try:
            with tempfile.TemporaryDirectory() as directory:
                emb.RELEASE_DIR = Path(directory)
                emb.OUTPUT_DIMS = 2
                cards = [emb.Card(7, "projects", "Project", "Seven", "", "h", 200, 20, False, False, [])]
                manifest = emb.write_release(np.asarray([[0.25, 0.75]], dtype=np.float32), cards, "2026-01-01T00:00:00Z")
                raw = (Path(directory) / "vectors.f32").read_bytes()
                self.assertEqual(hashlib.sha256(raw).hexdigest(), manifest["vectorsSha256"])
                self.assertEqual("float32-le", manifest["dtype"])
                self.assertEqual(8, len(raw))
                self.assertEqual(7, json.loads((Path(directory) / "ids.json").read_text())[0]["id"])
        finally:
            emb.RELEASE_DIR, emb.OUTPUT_DIMS = old_dir, old_dims

    def test_derived_artifacts_match_the_frontend_schema(self):
        import numpy as np

        old_out, old_release, old_dims = emb.OUT_DIR, emb.RELEASE_DIR, emb.OUTPUT_DIMS
        try:
            with tempfile.TemporaryDirectory() as directory:
                emb.OUT_DIR = Path(directory)
                emb.RELEASE_DIR = Path(directory) / "release"
                emb.OUTPUT_DIMS = 2
                cards = [
                    emb.Card(1, "podcasts", "Podcast", "Episode", "", "a", 200, 20, False, False, ["English"]),
                    emb.Card(2, "publications", "Publication", "Article", "", "b", 200, 20, False, False, ["French"]),
                ]
                report = emb.write_derived(
                    cards,
                    np.asarray([[1.0, 0.0], [0.8, 0.2]], dtype=np.float32),
                    np.asarray([[-1.0, 0.0], [1.0, 0.0]], dtype=np.float32),
                    np.asarray([0, 1], dtype=np.int32),
                    2,
                    {"1": [{"id": 2, "score": 0.8}], "2": [{"id": 1, "score": 0.8}]},
                    {
                        "podcasts": {"fetched": 1, "public": 1, "nonPublicSkipped": 0, "cards": 1, "lowSignal": 0, "truncated": 0},
                        "publications": {"fetched": 1, "public": 1, "nonPublicSkipped": 0, "cards": 1, "lowSignal": 0, "truncated": 0},
                    },
                    {"embedded": 2, "reused": 0, "staleRemoved": 0},
                )
                map_data = emb.read_json(Path(directory) / "map.php")
                similar_data = emb.read_json(Path(directory) / "similar.php")
                self.assertEqual(1, map_data["schemaVersion"])
                self.assertEqual(
                    {"id", "x", "y", "type", "typeLabel", "cluster", "lowSignal", "title"},
                    set(map_data["items"][0]),
                )
                self.assertEqual("Episode", similar_data["catalog"]["1"]["title"])
                self.assertEqual(2, similar_data["items"]["1"][0]["id"])
                self.assertEqual(2, report["totals"]["cards"])
                self.assertEqual(
                    {"cards": 2, "recommendationSources": 2, "lowSignal": 0},
                    emb.validate_artifacts(emb.OUT_DIR, emb.RELEASE_DIR),
                )
        finally:
            emb.OUT_DIR, emb.RELEASE_DIR, emb.OUTPUT_DIMS = old_out, old_release, old_dims

    def test_artifact_validation_rejects_a_tampered_vector_release(self):
        import numpy as np

        old_out, old_release, old_dims = emb.OUT_DIR, emb.RELEASE_DIR, emb.OUTPUT_DIMS
        try:
            with tempfile.TemporaryDirectory() as directory:
                emb.OUT_DIR = Path(directory)
                emb.RELEASE_DIR = Path(directory) / "release"
                emb.OUTPUT_DIMS = 2
                cards = [
                    emb.Card(1, "projects", "Project", "One", "", "a", 200, 20, False, False, []),
                    emb.Card(2, "sections", "Section", "Two", "", "b", 200, 20, False, False, []),
                ]
                emb.write_derived(
                    cards,
                    np.asarray([[1.0, 0.0], [0.8, 0.2]], dtype=np.float32),
                    np.asarray([[-1.0, 0.0], [1.0, 0.0]], dtype=np.float32),
                    np.asarray([0, 1], dtype=np.int32),
                    2,
                    {"1": [{"id": 2, "score": 0.8}], "2": [{"id": 1, "score": 0.8}]},
                    {},
                    {"embedded": 2, "reused": 0, "staleRemoved": 0},
                )
                (emb.RELEASE_DIR / "vectors.f32").write_bytes(b"tampered")
                with self.assertRaisesRegex(ValueError, "Vector byte length"):
                    emb.validate_artifacts(emb.OUT_DIR, emb.RELEASE_DIR)
        finally:
            emb.OUT_DIR, emb.RELEASE_DIR, emb.OUTPUT_DIMS = old_out, old_release, old_dims


if __name__ == "__main__":
    unittest.main()
