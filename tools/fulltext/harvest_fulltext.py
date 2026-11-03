#!/usr/bin/env python3
"""Harvest the private full text (`bibo:content`) of one item set for offline evaluation.

This is the input of the full-text semantic map prototype
(`fulltext_map.py`), not part of the module's build: the text is private,
so the harvest needs an Omeka API key and its output must never be committed
or published. Standard library only, so it runs without the model stack.

    OMEKA_KEY_IDENTITY=... OMEKA_KEY_CREDENTIAL=... \
        python harvest_fulltext.py --work-dir <private dir> [--item-set 27724]

Writes `<work-dir>/items.jsonl` (one record per item, text included) and
`<work-dir>/harvest-report.json` (counts, items without text). The key travels
as query parameters, as Omeka S requires; error messages never echo the URL.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

API_BASE = os.environ.get("OMEKA_API_BASE", "https://data.africamultiple.uni-bayreuth.de").rstrip("/")
ILAM_ITEM_SET = 27724
PER_PAGE = 25


def value_texts(item: dict, term: str) -> list[str]:
    out = []
    for value in item.get(term) or []:
        if not isinstance(value, dict):
            continue
        text = value.get("@value") or value.get("display_title") or value.get("o:label") or ""
        if not text and value.get("@id") and value.get("type") == "uri":
            text = value["@id"]
        text = str(text).strip()
        if text:
            out.append(text)
    return out


def strip_html(text: str) -> str:
    # Content may arrive as HTML (the "html" data type); keep paragraph breaks.
    text = re.sub(r"(?i)<\s*(br|/p|/div|/h\d|/li)\s*/?>", "\n\n", text)
    text = re.sub(r"<[^>]+>", " ", text)
    return html.unescape(text)


def fetch(url: str, attempts: int = 4):
    for attempt in range(attempts):
        try:
            with urlopen(Request(url, headers={"Accept": "application/json", "User-Agent": "dre-fulltext-eval"}), timeout=120) as response:
                return json.load(response)
        except (HTTPError, URLError, TimeoutError) as error:
            reason = f"HTTP {error.code}" if isinstance(error, HTTPError) else type(error).__name__
            if attempt == attempts - 1 or (isinstance(error, HTTPError) and error.code in (401, 403)):
                raise SystemExit(f"Omeka API request failed ({reason}); check the key and OMEKA_API_BASE.") from None
            time.sleep(2 ** attempt)


def record(item: dict) -> dict:
    contents = [strip_html(text) for text in value_texts(item, "bibo:content")]
    return {
        "id": item["o:id"],
        "isPublic": item.get("o:is_public") is True,
        "title": (value_texts(item, "dcterms:title") or [item.get("o:title") or ""])[0],
        "date": (value_texts(item, "dcterms:created") or value_texts(item, "dcterms:date") or [""])[0],
        "authors": value_texts(item, "marcrel:aut") or value_texts(item, "dcterms:creator"),
        "description": value_texts(item, "dcterms:description"),
        "abstract": (value_texts(item, "dcterms:abstract") or [""])[0],
        "subjects": value_texts(item, "dcterms:subject"),
        "doi": (value_texts(item, "bibo:doi") or [""])[0],
        "url": (value_texts(item, "fabio:hasURL") or [""])[0],
        "text": "\n\n".join(text for text in contents if text.strip()),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--work-dir", required=True, type=Path, help="private output directory, outside any repository")
    parser.add_argument("--item-set", type=int, default=ILAM_ITEM_SET)
    args = parser.parse_args()

    identity = os.environ.get("OMEKA_KEY_IDENTITY", "")
    credential = os.environ.get("OMEKA_KEY_CREDENTIAL", "")
    if not identity or not credential:
        print("Set OMEKA_KEY_IDENTITY and OMEKA_KEY_CREDENTIAL: bibo:content is private.", file=sys.stderr)
        return 2

    args.work_dir.mkdir(parents=True, exist_ok=True)
    records: list[dict] = []
    page = 1
    while True:
        query = urlencode({
            "item_set_id": args.item_set, "per_page": PER_PAGE, "page": page,
            "sort_by": "id", "sort_order": "asc",
            "key_identity": identity, "key_credential": credential,
        })
        batch = fetch(f"{API_BASE}/api/items?{query}")
        if not batch:
            break
        records.extend(record(item) for item in batch)
        print(f"\rpage {page}: {len(records)} items", end="", flush=True)
        page += 1
    print()

    with (args.work_dir / "items.jsonl").open("w", encoding="utf-8") as handle:
        for row in records:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")

    without = [{"id": r["id"], "title": r["title"]} for r in records if not r["text"].strip()]
    report = {
        "itemSet": args.item_set,
        "items": len(records),
        "withText": len(records) - len(without),
        "withoutText": len(without),
        "withoutTextItems": without,
        "words": sum(len(r["text"].split()) for r in records),
    }
    (args.work_dir / "harvest-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{report['items']} items, {report['withText']} with text, {report['withoutText']} without, {report['words']:,} words")
    if report["withText"] == 0:
        print("No item carried bibo:content: is the key allowed to see private values?", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
