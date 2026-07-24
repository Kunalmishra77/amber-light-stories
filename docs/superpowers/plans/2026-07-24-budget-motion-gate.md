# Budget-Safe Motion Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the per-video budget on the expensive AI-motion step. Today `plan_scene` (the budget-aware decision engine) decides `motion_action = "ai_animation"` ONLY when a scene is HIGH-importance AND the `CostGovernor` can still afford it — otherwise `"local_ffmpeg"` (free). But `run_pipeline` calls `executors.execute_motion(..., live=live, ...)` unconditionally, so the executor does a paid fal image-to-video call whenever the scene's own `motion_type == "ai_animation"`, IGNORING the plan's budget decision. That is the $2-cap leak. This change makes the executor honor the plan.

**Architecture:** Add a tiny pure helper `_motion_live(live, plan)` to `pipeline/orchestrator.py` that returns `True` only when the run is live AND the plan approved AI motion for this scene. Use its result as the `live` argument to `execute_motion`. When it returns `False`, `execute_motion` renders a free local Ken-Burns clip (its existing `live=False` behaviour). No change to `plan_scene`, the governor, or `execute_motion` itself.

**Tech Stack:** Python 3.12, `pytest`.

## Global Constraints

- **Product name:** YT-Automation (branding only).
- **Budget invariant:** the paid fal image-to-video call MUST run only for scenes where `plan["motion_action"] == "ai_animation"` (which `plan_scene` sets only when HIGH-importance AND `governor.can_afford`). This bounds total motion spend to the governor's budget.
- **No behavior change to the affordable/HIGH case:** when the plan DID approve AI motion, `execute_motion` must still receive `live=True` (real AI motion), exactly as before.
- **Scope:** ONLY the motion `live` gating in `run_pipeline` + the pure helper. Do NOT change `plan_scene`, `CostGovernor`, `execute_motion`, or the image path (images always generate; that's a separate, low-cost concern).
- **Test layout:** new unit tests FLAT in `tests/`.

---

### Task 1: Gate AI motion on the plan's budget decision

**Files:**
- Modify: `pipeline/orchestrator.py` (add `_motion_live`; use it in the `execute_motion` call inside `run_pipeline`)
- Test: `tests/test_orchestrator_budget_gate.py`

**Interfaces:**
- Produces: `pipeline.orchestrator._motion_live(live: bool, plan: dict) -> bool` — `True` iff `live` is truthy AND `plan.get("motion_action") == "ai_animation"`.
- Consumes: the existing per-scene `plan` dict from `plan_scene` (already computed in the loop as `plan`), and `executors.execute_motion(..., live=..., ...)`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_orchestrator_budget_gate.py`:

```python
from pipeline.orchestrator import _motion_live


def test_motion_live_true_when_live_and_plan_approves_ai():
    assert _motion_live(True, {"motion_action": "ai_animation"}) is True


def test_motion_live_false_when_plan_downgraded_to_local():
    # plan_scene sets local_ffmpeg when the scene is not HIGH or the budget
    # is exhausted — the paid call must NOT run.
    assert _motion_live(True, {"motion_action": "local_ffmpeg"}) is False


def test_motion_live_false_when_not_live():
    assert _motion_live(False, {"motion_action": "ai_animation"}) is False


def test_motion_live_false_when_action_missing():
    assert _motion_live(True, {}) is False
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /e/YouTube-Automation/amber-light && .venv/Scripts/python.exe -m pytest tests/test_orchestrator_budget_gate.py -v`
Expected: FAIL with `ImportError: cannot import name '_motion_live' from 'pipeline.orchestrator'`

- [ ] **Step 3: Add the helper**

In `pipeline/orchestrator.py`, add this function at module level (e.g. directly above `def run_pipeline`):

```python
def _motion_live(live: bool, plan: dict) -> bool:
    """AI image-to-video (a paid fal call) runs only when the run is live AND
    the budget-aware plan approved AI motion for this scene. `plan_scene` sets
    motion_action='ai_animation' only for HIGH-importance scenes the
    CostGovernor can still afford; every other case is 'local_ffmpeg' (free),
    so gating on it enforces the per-video budget on the expensive step."""
    return bool(live) and plan.get("motion_action") == "ai_animation"
```

- [ ] **Step 4: Use it in `run_pipeline`**

In `pipeline/orchestrator.py`, inside `run_pipeline`'s per-scene loop, find the `execute_motion` call:

```python
        executors.execute_motion(scene, keyframe_path, motion_path, live=live,
                                  routing=routing, seconds=seconds)
```

Change the `live=live` argument to `live=_motion_live(live, plan)`:

```python
        executors.execute_motion(scene, keyframe_path, motion_path,
                                  live=_motion_live(live, plan),
                                  routing=routing, seconds=seconds)
```

Leave every other line (the `_insert_asset` call guarded by `plan["motion_action"] == "ai_animation"`, the timing, etc.) unchanged.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd /e/YouTube-Automation/amber-light && .venv/Scripts/python.exe -m pytest tests/test_orchestrator_budget_gate.py -v`
Expected: PASS (4 passed)

- [ ] **Step 6: Run the full suite (no regressions)**

Run: `cd /e/YouTube-Automation/amber-light && .venv/Scripts/python.exe -m pytest -q`
Expected: all pass. (Mock-mode runs are unaffected: with `live=False`, `_motion_live` returns `False` — the same value `live` already was, so behaviour is identical.)

- [ ] **Step 7: Commit**

```bash
cd /e/YouTube-Automation/amber-light
git add pipeline/orchestrator.py tests/test_orchestrator_budget_gate.py
git commit -m "fix(budget): gate paid AI motion on plan_scene's budget decision (enforce per-video cap)"
```

---

## Out of scope (follow-on)

- **Image-cost gating** — images always generate (needed for a keyframe) and are cheap (~$0.01–0.035 each); `plan_scene` already accounts for them in the governor, so total spend tracks the plan. A hard image-cap would require threading the plan's downgraded quality into `execute_keyframe` and is deferred.
- **Passing actual (vs estimated) cost back into the governor** — the estimates in `model_routing` are close enough for the cap; reconciling real invoice cost is a later refinement.

## Self-review notes

- **Spec coverage:** enforces the "$2 hard cap" requirement on the expensive motion step (design spec §5).
- **Placeholder scan:** none — exact helper code + exact call-site change.
- **Type consistency:** `_motion_live(live: bool, plan: dict) -> bool` used identically in the helper, the `run_pipeline` call site, and all four tests; `plan["motion_action"]` string values (`"ai_animation"`, `"local_ffmpeg"`) match `pipeline/decision.py`.
