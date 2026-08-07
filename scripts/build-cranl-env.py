#!/usr/bin/env python3
"""Build .env.cranl.local from Netlify env + .env.local. Never prints secret values."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CRANL_URL = os.environ.get("CRANL_URL", "https://arabicbuzz-fooc9h.cranl.net").rstrip("/")
OUT = ROOT / ".env.cranl.local"

SKIP = {
    "NETLIFY_AUTH_TOKEN",
    "NETLIFY_SITE_ID",
    "CRANL_API_KEY",
    "LOCAL_STORAGE_ROOT",
    "MAC_SYNC_PORT",
    "OLLAMA_BASE_URL",
    "STORAGE_BACKEND",
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_POOLER_REGION",
}


def load_dotenv(path: Path) -> dict[str, str]:
    vals: dict[str, str] = {}
    if not path.exists():
        return vals
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k:
            vals[k] = v
    return vals


def main() -> int:
    netlify_json = Path("/tmp/netlify-env.json")
    if not netlify_json.exists():
        print("missing /tmp/netlify-env.json", file=sys.stderr)
        return 1

    raw = json.loads(netlify_json.read_text())
    vals: dict[str, str] = {}
    for e in raw:
        key = e.get("key")
        vs = e.get("values") or []
        chosen = None
        for v in vs:
            ctx = (v.get("context") or "").lower()
            if ctx in ("production", "all", ""):
                chosen = v.get("value")
                if ctx == "production":
                    break
        if chosen is None and vs:
            chosen = vs[0].get("value")
        if key and chosen is not None:
            vals[str(key)] = str(chosen)

    local = load_dotenv(ROOT / ".env.local")
    for k, v in local.items():
        if k in SKIP or not v:
            continue
        if k not in vals:
            vals[k] = v

    for k in list(vals):
        if k.startswith("NETLIFY_") or k == "CRANL_API_KEY" or k in SKIP:
            vals.pop(k, None)

    vals["NEXT_PUBLIC_APP_URL"] = CRANL_URL
    vals["APP_URL"] = CRANL_URL
    vals["NODE_ENV"] = "production"
    vals["PORT"] = "3000"
    vals["HOSTNAME"] = "0.0.0.0"

    lines = [f"{k}={vals[k]}" for k in sorted(vals)]
    OUT.write_text("\n".join(lines) + "\n")
    print(f"wrote {OUT.name} with {len(vals)} keys")
    print("keys=" + ",".join(sorted(vals)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
