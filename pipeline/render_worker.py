"""Durable render worker — the M11 Job Engine's render executor.

FFmpeg + provider adapters can't run on Vercel's serverless Node runtime, so
render runs here, as a SEPARATE process that shares the ONE `jobs` table with
the web app. This worker claims ONLY `render.run` jobs (the web worker excludes
them), produces the real final MP4 via `pipeline.orchestrator.run_pipeline`,
uploads it to the Supabase Storage `assets` bucket TENANT-SCOPED, marks the
render/thumbnail/metadata pipeline stages done, advances the run to the next
stage, and completes the job — with the SAME lease/retry/backoff/DLQ semantics
as the Node engine.

Run:  .venv/Scripts/python -m pipeline.render_worker            (drain once)
      .venv/Scripts/python -m pipeline.render_worker --loop     (poll forever)

Idempotent + retry-safe: a render asset already present for the story is adopted
instead of re-rendered, so a crash mid-render never produces two videos, and
publish is separately idempotent (videos.idempotency_key).
"""
from __future__ import annotations

import argparse
import os
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

from app.config import get_settings
from app.supabase_client import get_supabase

BUCKET = "assets"
WORKER_NAME = f"render-worker-{os.getpid()}"

# The ElevenLabs voice used when a tenant hasn't chosen one. "Rachel" — a
# default voice available to every account, compatible with multilingual_v2.
DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"

# Retry/backoff mirrors web/src/lib/jobs/backoff.ts exactly.
BACKOFF_BASE_MS = 5000
BACKOFF_CAP_MS = 3_600_000

# The pipeline stages this worker produces output for, in order. run_pipeline
# genuinely produces all three, so all three are marked done together.
PRODUCED_STAGES = ["render", "thumbnail", "metadata"]

# Provider env vars the render executors read via app.config.get_settings().
# Set PER JOB from the tenant's Vault so each render uses THAT tenant's keys.
TENANT_ENV = {
    "openai": "OPENAI_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "elevenlabs": "ELEVENLABS_API_KEY",
    "fal": "FAL_KEY",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _backoff_ms(attempt: int) -> int:
    a = max(1, int(attempt))
    return min(BACKOFF_BASE_MS * (2 ** (a - 1)), BACKOFF_CAP_MS)


def claim_render_jobs(sb, limit: int = 1) -> list[dict]:
    """Lease up to `limit` ready render jobs (the shared atomic claim RPC)."""
    res = sb.rpc(
        "claim_jobs",
        {
            "p_worker": WORKER_NAME,
            "p_limit": limit,
            "p_now": _now_iso(),
            "p_include_types": ["render.run"],
        },
    ).execute()
    return res.data or []


def complete_job(sb, job_id: str, checkpoint: dict) -> None:
    now = _now_iso()
    sb.table("jobs").update(
        {
            "status": "succeeded",
            "finished_at": now,
            "locked_by": None,
            "locked_at": None,
            "lease_expires_at": None,
            "last_error": None,
            "checkpoint": checkpoint,
            "updated_at": now,
        }
    ).eq("id", job_id).execute()


def fail_job(sb, job: dict, message: str) -> str:
    """Requeue with backoff while attempts remain, else dead-letter (DLQ)."""
    now = _now_iso()
    attempts = int(job.get("attempts") or 0)
    max_attempts = int(job.get("max_attempts") or 1)
    message = (message or "render failed")[:1000]

    if attempts >= max_attempts:
        sb.table("jobs").update(
            {
                "status": "dead",
                "dead_at": now,
                "last_error": message,
                "locked_by": None,
                "locked_at": None,
                "lease_expires_at": None,
                "updated_at": now,
            }
        ).eq("id", job["id"]).execute()
        _escalate_dead(sb, job, message)
        return "dead"

    run_after = datetime.fromtimestamp(
        time.time() + _backoff_ms(attempts) / 1000.0, tz=timezone.utc
    ).isoformat()
    sb.table("jobs").update(
        {
            "status": "queued",
            "run_after": run_after,
            "last_error": message,
            "locked_by": None,
            "locked_at": None,
            "lease_expires_at": None,
            "updated_at": now,
        }
    ).eq("id", job["id"]).execute()
    return "queued"


def release_job(sb, job_id: str) -> None:
    """Return a claimed job to the queue WITHOUT consuming the outcome (e.g. an
    emergency stop is active). Mirrors the Node engine's release()."""
    now = _now_iso()
    sb.table("jobs").update(
        {"status": "queued", "locked_by": None, "locked_at": None,
         "lease_expires_at": None, "updated_at": now}
    ).eq("id", job_id).execute()


def _escalate_dead(sb, job: dict, reason: str) -> None:
    try:
        sb.table("event_log").insert(
            {
                "tenant_id": job.get("tenant_id"),
                "level": "error",
                "source": "render-worker",
                "message": f"Render job dead-lettered: {reason}"[:1000],
                "meta": {"job_id": job["id"], "job_type": job.get("type")},
            }
        ).execute()
        if job.get("tenant_id"):
            # One open incident per failing render, like the Node dead-letter path.
            sb.table("security_incidents").insert(
                {
                    "tenant_id": job["tenant_id"],
                    "title": "Video render failed permanently",
                    "summary": reason[:1000],
                    "severity": "high",
                    "status": "open",
                    "category": "operational",
                    "source": "job.dead",
                    "dedupe_key": f"job.dead:{job['id']}",
                }
            ).execute()
    except Exception:
        pass  # escalation must never mask the original failure


def _is_halted(sb, tenant_id: str) -> bool:
    """Respect the workspace emergency stop and the platform-wide stop."""
    try:
        entry = (
            sb.table("config_entries")
            .select("id, config_versions!config_entries_active_fk(value)")
            .eq("scope_type", "platform")
            .eq("namespace", "ops")
            .eq("key", "platform_stop")
            .execute()
            .data
        )
        for row in entry or []:
            versions = row.get("config_versions")
            v = versions[0] if isinstance(versions, list) else versions
            if v and (v.get("value") or {}).get("stopped"):
                return True
        sched = (
            sb.table("schedules").select("emergency_stop").eq("tenant_id", tenant_id).execute().data
        )
        if sched and sched[0].get("emergency_stop"):
            return True
    except Exception:
        return False  # fail open — a config read must not freeze rendering
    return False


def _resolve_tenant_credential(sb, tenant_id: str, provider: str) -> str | None:
    """Read a tenant's provider secret from the Vault (service-role RPC)."""
    try:
        res = sb.rpc("get_credential", {"p_tenant": tenant_id, "p_provider": provider}).execute()
        val = res.data
        return val if isinstance(val, str) and val else None
    except Exception:
        return None


def _apply_tenant_env(sb, tenant_id: str) -> tuple[dict, bool]:
    """Load the tenant's provider keys into the environment for THIS job.

    Returns (saved_env, live) — `live` is True when the render can use real
    visuals/voice (fal + ElevenLabs present). The worker processes one job at a
    time, so per-job env mutation is safe. get_settings() is cache-cleared so it
    re-reads the freshly set env.
    """
    saved: dict[str, str | None] = {}
    present: dict[str, bool] = {}
    for provider, env_key in TENANT_ENV.items():
        secret = _resolve_tenant_credential(sb, tenant_id, provider)
        saved[env_key] = os.environ.get(env_key)
        present[provider] = bool(secret)
        if secret:
            os.environ[env_key] = secret
    # Per-tenant voice: the voice_id the client chose (stored in the Vault as
    # the "elevenlabs_voice" credential), else a sensible multilingual default.
    # Registered in `saved` so _restore_env reverts it after the job.
    voice_id = _resolve_tenant_credential(sb, tenant_id, "elevenlabs_voice") or DEFAULT_VOICE_ID
    saved["ELEVENLABS_VOICE_ID"] = os.environ.get("ELEVENLABS_VOICE_ID")
    os.environ["ELEVENLABS_VOICE_ID"] = voice_id
    try:
        get_settings.cache_clear()  # type: ignore[attr-defined]
    except Exception:
        pass
    # A live render needs both the visual (fal) and voice (ElevenLabs) providers.
    live = present.get("fal", False) and present.get("elevenlabs", False)
    return saved, live


def _restore_env(saved: dict) -> None:
    for k, v in saved.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v
    try:
        get_settings.cache_clear()  # type: ignore[attr-defined]
    except Exception:
        pass


def _resolve_project_id(sb, tenant_id: str, story_project_id: str | None) -> str:
    """A real projects.id for the render.

    run_pipeline writes its own asset/stage rows keyed on project_id (a uuid
    column), so a valid project is required — the orchestrator's default
    "mock-project" string is not a uuid and breaks those inserts. Reuse the
    story's project, else the tenant's first project, else create a minimal one.
    """
    if story_project_id:
        return story_project_id
    existing = (
        sb.table("projects").select("id").eq("tenant_id", tenant_id)
        .order("created_at").limit(1).execute().data
    )
    if existing:
        return existing[0]["id"]
    created = (
        sb.table("projects")
        .insert({"tenant_id": tenant_id, "name": "Default project"})
        .execute()
        .data
    )
    return created[0]["id"]


def _existing_render_asset(sb, tenant_id: str, story_id: str) -> str | None:
    """A bucket-relative render path already produced for this story, or None.
    This is what makes a retry adopt the prior render instead of duplicating."""
    rows = (
        sb.table("assets")
        .select("storage_path")
        .eq("tenant_id", tenant_id)
        .eq("story_id", story_id)
        .eq("kind", "render")
        .order("created_at", desc=True)
        .limit(5)
        .execute()
        .data
        or []
    )
    for r in rows:
        p = r.get("storage_path") or ""
        if p and "\\" not in p and not p.startswith("http"):
            return p  # already a bucket path
    return None


def _upload_asset(sb, tenant_id: str, run_id: str, local_path: Path, kind: str,
                  content_type: str) -> str:
    """Upload a produced file to the private assets bucket, tenant-scoped, and
    return the bucket-relative path. Overwrites on retry (idempotent)."""
    bucket_path = f"{tenant_id}/renders/{run_id}/{local_path.name}"
    with open(local_path, "rb") as fh:
        data = fh.read()
    storage = sb.storage.from_(BUCKET)
    try:
        storage.upload(
            bucket_path, data,
            {"content-type": content_type, "upsert": "true"},
        )
    except Exception:
        # Some storage3 versions reject upsert on create; update in place.
        storage.update(bucket_path, data, {"content-type": content_type})
    return bucket_path


def _record_asset(sb, tenant_id: str, project_id: str | None, story_id: str,
                  kind: str, bucket_path: str, meta: dict) -> None:
    """Insert a tenant-scoped asset row the web publish path can find. Cleans up
    any earlier local-path row for the same story/kind so publish never picks a
    stale non-bucket path."""
    sb.table("assets").delete().eq("tenant_id", tenant_id).eq("story_id", story_id).eq(
        "kind", kind
    ).execute()
    sb.table("assets").insert(
        {
            "tenant_id": tenant_id,
            "project_id": project_id,
            "story_id": story_id,
            "kind": kind,
            "storage_path": bucket_path,
            "meta": meta,
        }
    ).execute()


def _advance_after_render(sb, tenant_id: str, run_id: str) -> None:
    """Mark render/thumbnail/metadata done and move the run to the next
    reviewable stage. Advancement stays simple and deterministic: the produced
    stages are marked done, and the next non-terminal stage becomes
    awaiting_review for the human. Approval gates (M15) still apply on the human
    approve actions downstream — this only surfaces the work."""
    stages = (
        sb.table("pipeline_stages")
        .select("id, stage, seq, status")
        .eq("run_id", run_id)
        .eq("tenant_id", tenant_id)
        .order("seq")
        .execute()
        .data
        or []
    )
    now = _now_iso()
    produced = set(PRODUCED_STAGES)
    render_seq = next((s["seq"] for s in stages if s["stage"] == "render"), None)

    for s in stages:
        if s["stage"] in produced and s["status"] not in ("done", "approved"):
            sb.table("pipeline_stages").update(
                {"status": "done", "approved_at": now, "updated_at": now}
            ).eq("id", s["id"]).execute()

    # The next stage after the produced set becomes the current review point.
    nxt = None
    for s in stages:
        if render_seq is not None and s["seq"] > render_seq and s["stage"] not in produced:
            nxt = s
            break

    if nxt:
        sb.table("pipeline_stages").update(
            {"status": "awaiting_review", "review_due_at": now, "updated_at": now}
        ).eq("id", nxt["id"]).execute()
        sb.table("pipeline_runs").update(
            {"current_stage": nxt["stage"], "status": "running"}
        ).eq("id", run_id).execute()
    else:
        sb.table("pipeline_runs").update(
            {"status": "running"}
        ).eq("id", run_id).execute()


def process_render_job(sb, job: dict) -> str:
    """Render one job end to end. Returns 'succeeded' | 'queued' | 'dead'."""
    tenant_id = job.get("tenant_id")
    payload = job.get("payload") or {}
    run_id = payload.get("runId")
    story_id = payload.get("storyId")

    if not tenant_id or not run_id or not story_id:
        return fail_job(sb, job, "render job payload missing tenantId/runId/storyId")

    # Respect stops — re-queue (don't burn an attempt) until the stop lifts.
    if _is_halted(sb, tenant_id):
        release_job(sb, job["id"])
        return "queued"

    # Idempotency: adopt an existing render instead of producing a second one.
    existing = _existing_render_asset(sb, tenant_id, story_id)
    if existing:
        _advance_after_render(sb, tenant_id, run_id)
        complete_job(sb, job["id"], {"adopted": existing, "already_rendered": True})
        return "succeeded"

    saved_env, live = _apply_tenant_env(sb, tenant_id)
    try:
        from pipeline.orchestrator import run_pipeline

        story = (
            sb.table("stories").select("project_id").eq("id", story_id).single().execute().data
        )
        project_id = _resolve_project_id(sb, tenant_id, (story or {}).get("project_id"))

        # Isolated output dir per run.
        out_dir = Path(get_settings().storage_dir) / "renders" / str(run_id)
        result = run_pipeline(story_id, live=live, project_id=project_id, out_dir=out_dir)

        final_path = Path(result["final_path"])
        if not final_path.exists() or final_path.stat().st_size == 0:
            raise RuntimeError("render produced no output file")

        render_path = _upload_asset(sb, tenant_id, run_id, final_path, "render", "video/mp4")
        _record_asset(
            sb, tenant_id, project_id, story_id, "render", render_path,
            {"live": live, "cost_usd": result.get("cost", 0.0),
             "duration_sec": result.get("voice_duration_sec")},
        )

        thumb = Path(result.get("thumbnail") or "")
        if thumb.exists():
            thumb_path = _upload_asset(sb, tenant_id, run_id, thumb, "thumbnail", "image/png")
            _record_asset(sb, tenant_id, project_id, story_id, "thumbnail", thumb_path,
                          {"live": live})

        _advance_after_render(sb, tenant_id, run_id)

        # Best-effort notify — never fail the job on a notification error.
        try:
            sb.table("notifications").insert(
                {
                    "tenant_id": tenant_id,
                    "kind": "render_complete",
                    "category": "publishing",
                    "title": "Your video is rendered",
                    "body": "The final video is ready to review and publish.",
                    "link": "/pipeline",
                }
            ).execute()
        except Exception:
            pass

        complete_job(
            sb, job["id"],
            {"render_path": render_path, "live": live, "cost_usd": result.get("cost", 0.0)},
        )
        return "succeeded"
    except Exception as exc:  # noqa: BLE001 — engine boundary: classify + retry
        return fail_job(sb, job, f"{type(exc).__name__}: {exc}")
    finally:
        _restore_env(saved_env)


def drain_once(limit: int = 5) -> dict:
    sb = get_supabase()
    jobs = claim_render_jobs(sb, limit)
    summary = {"claimed": len(jobs), "succeeded": 0, "queued": 0, "dead": 0}
    for job in jobs:
        try:
            outcome = process_render_job(sb, job)
        except Exception as exc:  # noqa: BLE001
            traceback.print_exc()
            outcome = fail_job(sb, job, f"worker crash: {exc}")
        if outcome == "succeeded":
            summary["succeeded"] += 1
        elif outcome == "dead":
            summary["dead"] += 1
        else:
            summary["queued"] += 1
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Amber Light durable render worker")
    parser.add_argument("--loop", action="store_true", help="poll continuously")
    parser.add_argument("--interval", type=float, default=10.0, help="poll interval seconds")
    parser.add_argument("--limit", type=int, default=1, help="max jobs per drain")
    args = parser.parse_args()

    if not args.loop:
        print(drain_once(args.limit))
        return

    print(f"[render-worker] {WORKER_NAME} polling every {args.interval}s")
    while True:
        try:
            summary = drain_once(args.limit)
            if summary["claimed"]:
                print(f"[render-worker] {summary}")
        except Exception:  # noqa: BLE001
            traceback.print_exc()
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
