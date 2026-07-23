"""Render-worker failure-path tests (Phase 7). Real DB, isolated ZZ tenants."""
import uuid
import time
from app.supabase_client import get_supabase
from pipeline import render_worker as rw

sb = get_supabase()
P = F = 0


def ok(cond, name):
    global P, F
    if cond:
        P += 1
    else:
        F += 1
        print("FAIL:", name)


def mk_tenant(label):
    s = str(uuid.uuid4())[:8]
    return sb.table("tenants").insert(
        {"name": f"ZZ-fail-{label}-{s}", "slug": f"zz-fail-{label}-{s}", "status": "active"}
    ).execute().data[0]["id"]


def mk_render_job(tid, run_id, story_id, attempts=1, max_attempts=5):
    return sb.table("jobs").insert({
        "tenant_id": tid, "type": "render.run", "status": "running",
        "idempotency_key": f"render:run:{run_id}", "attempts": attempts,
        "max_attempts": max_attempts, "payload": {"runId": run_id, "storyId": story_id},
    }).execute().data[0]


def mk_story_run(tid, with_scenes=True):
    sid = sb.table("stories").insert(
        {"tenant_id": tid, "topic": "Fail test", "logline": "x", "moral": "y",
         "duration_seconds": 20, "status": "draft"}
    ).execute().data[0]["id"]
    if with_scenes:
        for i in range(2):
            sb.table("scenes").insert(
                {"tenant_id": tid, "story_id": sid, "seq": i, "start_sec": i * 10,
                 "end_sec": (i + 1) * 10, "narration": f"Scene {i}.", "subtitle": f"S{i}",
                 "importance": "MEDIUM", "motion_type": "ken_burns",
                 "recommended_quality": "standard", "animate": False,
                 "prompt": {"camera": "Push-in", "lighting": "Soft",
                            "emotion": "Calm", "environment": "Field"}}
            ).execute()
    rid = sb.table("pipeline_runs").insert(
        {"tenant_id": tid, "story_id": sid, "status": "rendering", "current_stage": "render"}
    ).execute().data[0]["id"]
    for i, st in enumerate(["render", "thumbnail", "metadata", "compliance_pre_publish"]):
        sb.table("pipeline_stages").insert(
            {"tenant_id": tid, "run_id": rid, "stage": st, "seq": 21 + i,
             "status": "running" if st == "render" else "pending"}
        ).execute()
    return sid, rid


def cleanup(tid):
    for t in ("jobs", "assets", "pipeline_stages", "pipeline_runs", "scenes", "stories",
              "notifications", "event_log", "security_incidents", "schedules", "projects"):
        sb.table(t).delete().eq("tenant_id", tid).execute()
    sb.table("tenants").delete().eq("id", tid).execute()


# ---- 1) Missing story payload -> retry, then DLQ at exhaustion ----
tid = mk_tenant("badpayload")
try:
    job = sb.table("jobs").insert({
        "tenant_id": tid, "type": "render.run", "status": "running",
        "idempotency_key": f"render:run:{uuid.uuid4()}", "attempts": 1, "max_attempts": 3,
        "payload": {"runId": None, "storyId": None},
    }).execute().data[0]
    outcome = rw.process_render_job(sb, job)
    ok(outcome == "queued", "missing payload with attempts<max -> requeued")
    j = sb.table("jobs").select("status,run_after,last_error").eq("id", job["id"]).single().execute().data
    ok(j["status"] == "queued" and j["run_after"] is not None, "requeue set a backoff run_after")

    # Now exhaust: attempts == max_attempts -> dead
    job2 = {**job, "attempts": 3, "max_attempts": 3}
    outcome2 = rw.process_render_job(sb, job2)
    ok(outcome2 == "dead", "missing payload at attempts==max -> dead-lettered")
    j2 = sb.table("jobs").select("status,dead_at").eq("id", job["id"]).single().execute().data
    ok(j2["status"] == "dead" and j2["dead_at"] is not None, "DLQ row marked dead with dead_at")
    inc = sb.table("security_incidents").select("id,source,dedupe_key").eq("tenant_id", tid).execute().data
    ok(any(i["source"] == "job.dead" for i in inc), "a dead render raised an operational incident")
    ev = sb.table("event_log").select("id,source").eq("tenant_id", tid).eq("source", "render-worker").execute().data
    ok(len(ev) >= 1, "the dead render was escalated to event_log")
finally:
    cleanup(tid)

# ---- 2) Emergency stop -> released (not failed), no attempt burn ----
tid = mk_tenant("estop")
try:
    sid, rid = mk_story_run(tid)
    sb.table("schedules").insert({"tenant_id": tid, "emergency_stop": True}).execute()
    job = mk_render_job(tid, rid, sid, attempts=1)
    outcome = rw.process_render_job(sb, job)
    ok(outcome == "queued", "emergency stop -> job released back to queue")
    j = sb.table("jobs").select("status,attempts,dead_at").eq("id", job["id"]).single().execute().data
    ok(j["status"] == "queued" and j["dead_at"] is None, "stopped job is queued, not dead")
    # No render asset produced under a stop.
    a = sb.table("assets").select("id").eq("tenant_id", tid).eq("kind", "render").execute().data
    ok(len(a) == 0, "no video was rendered while stopped")
finally:
    cleanup(tid)

# ---- 3) Idempotency: an existing render asset is adopted, not re-rendered ----
tid = mk_tenant("idem")
try:
    sid, rid = mk_story_run(tid)
    # Pre-seed a render asset with a bucket-shaped path (as a prior render would).
    sb.table("assets").insert({
        "tenant_id": tid, "story_id": sid, "kind": "render",
        "storage_path": f"{tid}/renders/{rid}/final.mp4", "meta": {"seeded": True},
    }).execute()
    job = mk_render_job(tid, rid, sid)
    t0 = time.time()
    outcome = rw.process_render_job(sb, job)
    elapsed = time.time() - t0
    ok(outcome == "succeeded", "existing render -> job succeeds by adoption")
    ok(elapsed < 5, f"adoption skipped the render (fast: {elapsed:.1f}s)")
    a = sb.table("assets").select("id").eq("tenant_id", tid).eq("story_id", sid).eq("kind", "render").execute().data
    ok(len(a) == 1, "still exactly one render asset (no duplicate)")
    j = sb.table("jobs").select("checkpoint").eq("id", job["id"]).single().execute().data
    ok((j["checkpoint"] or {}).get("already_rendered") is True, "checkpoint records the adoption")
finally:
    cleanup(tid)

# ---- 4) Tenant isolation: worker for tenant A never touches tenant B's data ----
tidA = mk_tenant("isoA")
tidB = mk_tenant("isoB")
try:
    sidA, ridA = mk_story_run(tidA)
    sidB, ridB = mk_story_run(tidB)
    # A render asset seeded for A only.
    sb.table("assets").insert({
        "tenant_id": tidA, "story_id": sidA, "kind": "render",
        "storage_path": f"{tidA}/renders/{ridA}/final.mp4", "meta": {},
    }).execute()
    # existing-render lookup for B must NOT see A's asset
    ok(rw._existing_render_asset(sb, tidB, sidA) is None,
       "isolation: B's worker cannot resolve A's render asset")
    ok(rw._existing_render_asset(sb, tidA, sidA) is not None,
       "A's worker resolves A's own render asset")
finally:
    cleanup(tidA)
    cleanup(tidB)

print(f"\nRender failure paths: {P} passed, {F} failed")
raise SystemExit(1 if F else 0)
