"""Prompt cache: never pay fal.ai twice for the same (prompt, model, params).

`cache_key` is a pure, deterministic function. `get`/`put` are thin wrappers
around the `prompt_cache` Supabase table, kept mockable — callers (e.g. the
decision engine) receive this module itself (or any object exposing the
same `get`/`put` interface) so they never import Supabase directly.
"""
import hashlib
import json

from app.supabase_client import get_supabase


def cache_key(prompt, model: str, params: dict | None = None) -> str:
    """sha256 of the normalized (prompt, model, params) tuple. Deterministic
    regardless of dict key ordering."""
    normalized = json.dumps(
        {"prompt": prompt, "model": model, "params": params or {}},
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def get(key: str, project_id: str | None = None) -> dict | None:
    sb = get_supabase()
    q = sb.table("prompt_cache").select("*").eq("hash", key)
    if project_id:
        q = q.eq("project_id", project_id)
    rows = q.limit(1).execute().data
    return rows[0] if rows else None


def put(key: str, kind: str, model: str, asset_id: str | None, prompt,
        project_id: str | None = None) -> dict:
    sb = get_supabase()
    row = sb.table("prompt_cache").insert({
        "project_id": project_id,
        "hash": key,
        "kind": kind,
        "model": model,
        "asset_id": asset_id,
        "prompt": prompt,
    }).execute().data
    return row[0] if row else {}
