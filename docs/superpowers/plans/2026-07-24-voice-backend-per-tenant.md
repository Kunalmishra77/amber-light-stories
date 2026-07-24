# Per-Tenant Voice in the Render Worker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make rendered videos use the tenant's chosen ElevenLabs voice — the render worker sets `ELEVENLABS_VOICE_ID` per job from the tenant's Vault `elevenlabs_voice` credential, falling back to a sensible multilingual default. This is the backend half of the "client picks their voice" feature; the portal dropdown that WRITES the credential is a separate follow-on block.

**Architecture:** `pipeline/render_worker._apply_tenant_env` already loads each tenant's provider API keys into the per-job environment via `_resolve_tenant_credential(sb, tenant_id, provider)`. We add one more resolution: read the `elevenlabs_voice` credential (the stored `voice_id` string), set `ELEVENLABS_VOICE_ID` to it (or `DEFAULT_VOICE_ID` when unset), and register it in the `saved` dict so `_restore_env` reverts it after the job. The existing `ElevenLabsAdapter` already reads `get_settings().elevenlabs_voice_id` (backed by that env var) and `_apply_tenant_env` already cache-clears settings, so no adapter change is needed.

**Tech Stack:** Python 3.12, `pytest` + `pytest-mock`.

## Global Constraints

- **Product name:** YT-Automation (branding only; no code identifiers change here).
- **Vault-only tenant data:** the voice_id comes from the tenant's Vault via the existing `_resolve_tenant_credential(sb, tenant_id, "elevenlabs_voice")`. No new table, no schema change.
- **Per-job isolation:** the worker processes one job at a time; `ELEVENLABS_VOICE_ID` MUST be added to the `saved` dict returned by `_apply_tenant_env` so `_restore_env` reverts it after each job (no cross-tenant leakage).
- **Default:** `DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"` — ElevenLabs "Rachel", a default voice available to all accounts and compatible with `eleven_multilingual_v2` (Hindi + English). Used when the tenant has not chosen one.
- **No paid calls / no network in tests:** unit tests monkeypatch `pipeline.render_worker._resolve_tenant_credential`; `_apply_tenant_env` is called with a dummy `sb` (never used directly once that function is patched).
- **Scope:** ONLY the render-worker voice wiring. Do NOT change the `live` gating semantics, the `ElevenLabsAdapter`, or add the portal UI (separate blocks).
- **Test layout:** new unit tests live FLAT in `tests/` (matching `tests/test_executors.py`), NOT a `tests/pipeline/` subdir.

---

### Task 1: Wire the tenant's voice into `_apply_tenant_env`

**Files:**
- Modify: `pipeline/render_worker.py` (add `DEFAULT_VOICE_ID`; extend `_apply_tenant_env`)
- Test: `tests/test_render_worker_voice.py`

**Interfaces:**
- Consumes: `pipeline.render_worker._resolve_tenant_credential(sb, tenant_id, provider) -> str | None` (existing); `_apply_tenant_env(sb, tenant_id) -> tuple[dict, bool]` (existing); `_restore_env(saved: dict) -> None` (existing).
- Produces: after `_apply_tenant_env`, `os.environ["ELEVENLABS_VOICE_ID"]` equals the tenant's stored voice_id or `DEFAULT_VOICE_ID`; the returned `saved` dict contains the prior `ELEVENLABS_VOICE_ID` value so `_restore_env` reverts it.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_render_worker_voice.py`:

```python
import os

import pipeline.render_worker as rw


def _patch_credentials(monkeypatch, mapping):
    """Make _resolve_tenant_credential return mapping[provider] (or None)."""
    monkeypatch.setattr(rw, "_resolve_tenant_credential",
                        lambda sb, tenant_id, provider: mapping.get(provider))


def test_apply_tenant_env_sets_chosen_voice(monkeypatch):
    _patch_credentials(monkeypatch, {"elevenlabs": "el-key", "elevenlabs_voice": "VOICE_XYZ"})
    monkeypatch.delenv("ELEVENLABS_VOICE_ID", raising=False)
    saved, _live = rw._apply_tenant_env(object(), "tenant-1")
    try:
        assert os.environ["ELEVENLABS_VOICE_ID"] == "VOICE_XYZ"
        assert "ELEVENLABS_VOICE_ID" in saved
    finally:
        rw._restore_env(saved)


def test_apply_tenant_env_falls_back_to_default_voice(monkeypatch):
    _patch_credentials(monkeypatch, {})  # nothing stored
    monkeypatch.delenv("ELEVENLABS_VOICE_ID", raising=False)
    saved, _live = rw._apply_tenant_env(object(), "tenant-1")
    try:
        assert os.environ["ELEVENLABS_VOICE_ID"] == rw.DEFAULT_VOICE_ID
    finally:
        rw._restore_env(saved)


def test_restore_env_reverts_voice(monkeypatch):
    _patch_credentials(monkeypatch, {"elevenlabs_voice": "VOICE_XYZ"})
    monkeypatch.setenv("ELEVENLABS_VOICE_ID", "ORIGINAL")
    saved, _live = rw._apply_tenant_env(object(), "tenant-1")
    assert os.environ["ELEVENLABS_VOICE_ID"] == "VOICE_XYZ"
    rw._restore_env(saved)
    assert os.environ["ELEVENLABS_VOICE_ID"] == "ORIGINAL"
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd /e/YouTube-Automation/amber-light && .venv/Scripts/python.exe -m pytest tests/test_render_worker_voice.py -v`
Expected: FAIL — `AttributeError: module 'pipeline.render_worker' has no attribute 'DEFAULT_VOICE_ID'` (and the voice env is never set).

- [ ] **Step 3: Add the constant**

In `pipeline/render_worker.py`, add near the other module constants (just below `WORKER_NAME = ...`):

```python
# The ElevenLabs voice used when a tenant hasn't chosen one. "Rachel" — a
# default voice available to every account, compatible with multilingual_v2.
DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"
```

- [ ] **Step 4: Wire the voice into `_apply_tenant_env`**

In `pipeline/render_worker.py`, inside `_apply_tenant_env`, AFTER the `for provider, env_key in TENANT_ENV.items():` loop and BEFORE the `get_settings.cache_clear()` call, insert:

```python
    # Per-tenant voice: the voice_id the client chose (stored in the Vault as
    # the "elevenlabs_voice" credential), else a sensible multilingual default.
    # Registered in `saved` so _restore_env reverts it after the job.
    voice_id = _resolve_tenant_credential(sb, tenant_id, "elevenlabs_voice") or DEFAULT_VOICE_ID
    saved["ELEVENLABS_VOICE_ID"] = os.environ.get("ELEVENLABS_VOICE_ID")
    os.environ["ELEVENLABS_VOICE_ID"] = voice_id
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd /e/YouTube-Automation/amber-light && .venv/Scripts/python.exe -m pytest tests/test_render_worker_voice.py -v`
Expected: PASS (3 passed)

- [ ] **Step 6: Run the full suite**

Run: `cd /e/YouTube-Automation/amber-light && .venv/Scripts/python.exe -m pytest -q`
Expected: all pass (no regressions).

- [ ] **Step 7: Commit**

```bash
cd /e/YouTube-Automation/amber-light
git add pipeline/render_worker.py tests/test_render_worker_voice.py
git commit -m "feat(voice): render worker sets ELEVENLABS_VOICE_ID per tenant (default fallback)"
```

---

## Out of scope (follow-on blocks)

- **Portal voice picker** — the ElevenLabs `voices.search()` list endpoint, a web API route to fetch the client's voices, the settings dropdown, and saving the selection via `store_credential(..., "elevenlabs_voice", voice_id)`. That block WRITES the credential this block READS.
- **Voice independent of visuals** — today `live` requires BOTH fal and ElevenLabs; decoupling real voice from real visuals is a separate change.
- **Per-character voices** — later phase.

## Self-review notes

- **Spec coverage:** delivers the render-side of "client picks their voice" (P2). The picker UI and provider-decoupling are explicitly deferred above.
- **Placeholder scan:** none — every step has exact code/commands.
- **Type consistency:** `DEFAULT_VOICE_ID` (str) and the `saved["ELEVENLABS_VOICE_ID"]` key are used identically in the implementation and all three tests; `_apply_tenant_env`/`_restore_env`/`_resolve_tenant_credential` signatures match the existing `render_worker.py`.
