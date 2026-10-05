"""Scope and revision contract shared by offline public-data builders."""
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import urlparse

PREFIX = "<?php http_response_code(404); exit; ?>\n"


def read_scope(fetcher, api_base: str, profile: Path) -> dict:
    site_url = os.environ.get("OMEKA_SITE_URL", "").rstrip("/")
    if not site_url or urlparse(site_url).netloc != urlparse(api_base).netloc:
        raise ValueError("Set OMEKA_SITE_URL to the canonical public site on OMEKA_API_BASE.")
    scope = fetcher(site_url + "/dre-data/source.json")
    if not isinstance(scope, dict) or type(scope.get("siteId")) is not int or scope["siteId"] < 1:
        raise ValueError("Invalid canonical source scope")
    if scope.get("profile") != hashlib.sha256(profile.read_bytes().replace(b"\r\n", b"\n")).hexdigest() or not scope.get("revision"):
        raise ValueError("The installed profile differs from the builder profile, or revision is missing")
    return scope


def verify_scope(scope: dict, fetcher, api_base: str, profile: Path) -> None:
    if read_scope(fetcher, api_base, profile) != scope:
        raise ValueError("The public corpus changed during harvesting; discard this run and retry.")


def read_json(path: Path):
    raw = path.read_text(encoding="utf-8")
    return json.loads(raw[len(PREFIX):] if raw.startswith(PREFIX) else raw)


def encode_json(path: Path, payload, **kwargs) -> str:
    return (PREFIX if path.suffix == ".php" else "") + json.dumps(payload, **kwargs) + "\n"
