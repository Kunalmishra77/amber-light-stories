"""Asset Library reuse search. Before any fal.ai generation, check whether a
suitable asset already exists (characters/backgrounds/objects/environments).

Scoring is a simple, deterministic tag/keyword overlap (fraction of the
query's tokens found in the asset's tags) -- good enough for Phase 1; a
perceptual-hash / embedding similarity upgrade is reserved (assets.embedding,
assets.phash already exist in the schema) for later.
"""
import re

from app.supabase_client import get_supabase

_TOKEN_RE = re.compile(r"[a-zA-Zऀ-ॿ0-9]+")


def _tokenize(text: str) -> set[str]:
    return {t.lower() for t in _TOKEN_RE.findall(text or "")}


def _score(query_tokens: set[str], tags: list[str] | None) -> float:
    tag_tokens = {t.lower() for t in (tags or [])}
    if not query_tokens or not tag_tokens:
        return 0.0
    overlap = query_tokens & tag_tokens
    return len(overlap) / len(query_tokens)


def search(query: str, project_id: str, character_id: str | None = None,
           threshold: float = 0.82) -> dict | None:
    """Return the best-matching reusable asset row for `query`, or None."""
    sb = get_supabase()
    q = sb.table("assets").select("*").eq("project_id", project_id)
    if character_id:
        q = q.eq("character_id", character_id)
    rows = q.execute().data or []

    query_tokens = _tokenize(query)
    best, best_score = None, 0.0
    for row in rows:
        if row.get("reusable") is False:
            continue
        score = _score(query_tokens, row.get("tags"))
        if score > best_score:
            best, best_score = row, score

    if best is not None and best_score >= threshold:
        return best
    return None
