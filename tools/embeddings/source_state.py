#!/usr/bin/env python3
"""Record the public site's state and decide whether a nightly build is due.

The embeddings workflow runs every night but builds only when the site has
changed since the last published build: a new publication revision (something
became private, publication was withdrawn), a new published snapshot (edits),
or another profile. The state is read from the site's public ``source.json``
and ``current.json`` and stored with each ``semantic-inputs-*`` release as
``source-state.json``; the next run compares against it.

Usage: ``source_state.py OUT.json [--previous PREVIOUS.json]``. Prints
``build=true`` or ``build=false`` (for ``$GITHUB_OUTPUT``) and the reason on
stderr.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Callable
from urllib.error import HTTPError
from urllib.request import Request, urlopen

PROFILE_PATH = Path(__file__).resolve().parents[2] / "config" / "amira-profile.json"


def fetch_json(url: str, attempts: int = 4) -> Any:
    """The decoded body, or None when the site answers 404 (nothing published).

    Other failures (timeouts, 5xx) are retried, as in build_embeddings.py.
    """
    for attempt in range(1, attempts + 1):
        try:
            with urlopen(Request(url, headers={"User-Agent": "dre-embeddings/1.0"}), timeout=60) as response:
                return json.load(response)
        except HTTPError as error:
            if error.code == 404:
                return None
            if attempt == attempts:
                raise
        except Exception:
            if attempt == attempts:
                raise
        time.sleep(3 * attempt)
    raise AssertionError("unreachable")


def capture(site_url: str, fetcher: Callable[[str], Any] = fetch_json) -> dict:
    source = fetcher(site_url + "/dre-data/source.json")
    if not isinstance(source, dict) or not source.get("revision"):
        raise ValueError("The site did not report its publication scope (dre-data/source.json).")
    current = fetcher(site_url + "/dre-data/current.json")
    return {
        "siteId": source.get("siteId"),
        "revision": source.get("revision"),
        "profile": source.get("profile"),
        "sourceChange": current.get("sourceChange") if isinstance(current, dict) else None,
    }


def decide(state: dict, previous: dict | None, local_profile: str) -> tuple[bool, str]:
    if state.get("profile") != local_profile:
        return False, "The site runs another profile than this branch; deploy the module first."
    if previous is None:
        return True, "No earlier build is published."
    changed = [key for key in ("siteId", "revision", "profile", "sourceChange") if state.get(key) != previous.get(key)]
    if changed:
        return True, "Changed since the last build: " + ", ".join(changed) + "."
    return False, "Nothing changed since the last build."


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("out", type=Path)
    parser.add_argument("--previous", type=Path)
    args = parser.parse_args()
    site_url = os.environ.get("OMEKA_SITE_URL", "").rstrip("/")
    if not site_url:
        print("Set OMEKA_SITE_URL to the canonical public site.", file=sys.stderr)
        return 2
    state = capture(site_url)
    args.out.write_text(json.dumps(state, sort_keys=True) + "\n", encoding="utf-8")
    previous = None
    if args.previous and args.previous.is_file():
        previous = json.loads(args.previous.read_text(encoding="utf-8"))
    local = hashlib.sha256(PROFILE_PATH.read_bytes().replace(b"\r\n", b"\n")).hexdigest()
    build, reason = decide(state, previous if isinstance(previous, dict) else None, local)
    print(f"build={'true' if build else 'false'}")
    print(reason, file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
