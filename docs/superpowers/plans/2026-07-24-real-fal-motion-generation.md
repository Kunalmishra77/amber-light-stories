# Real fal.ai Motion (Image-to-Video) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `NotImplementedError` stub in `pipeline/fal_adapter.generate_motion` with a real fal.ai image-to-video call that animates a scene's keyframe still into a short MP4 clip — the second real-visual deliverable of the YT-Automation pipeline (after real image generation, already merged).

**Architecture:** `generate_motion(dry=False)` uploads the local keyframe to fal storage (new `_upload_file` seam), resolves the i2v model from routing by tier, calls fal.ai through the existing `_subscribe` seam with `{prompt, image_url, duration}`, downloads the produced MP4 via the existing `_download_bytes` seam, and returns `{"bytes", "cost_usd", "meta"}` — the exact shape `pipeline/executors.execute_motion` already consumes (`result.get("bytes")`). The seams make it unit-testable with no network.

**Tech Stack:** Python 3.12, `fal-client` (already a dep), `httpx` (already a dep), `pytest` + `pytest-mock`.

## Global Constraints

- **Product name:** YT-Automation (branding only; no code identifiers change here).
- **Provider isolation:** `pipeline/fal_adapter.py` stays the ONLY pipeline module importing `fal_client`, and imports stay lazy (inside functions).
- **Per-tenant keys:** `FAL_KEY` from the environment (render worker sets it per-job from the tenant Vault). Never hard-code or log a key.
- **No paid calls in CI:** every unit test monkeypatches the `_upload_file` / `_subscribe` / `_download_bytes` seams. Real fal calls live only in the opt-in acceptance test, which self-skips without `FAL_KEY`.
- **Return contract:** `generate_motion(dry=False)` returns a dict with `"bytes"` (raw MP4 bytes), `"cost_usd"` (float), and `"meta"` (dict). `dry=True` behaviour is UNCHANGED. `generate_image` is UNCHANGED.
- **Input handling:** the first arg (named `image_url` in the existing signature) is what `execute_motion` passes — `str(image_path)`, a LOCAL file path. A value already starting with `http://`/`https://` is used as-is; any other value is uploaded via `_upload_file` first.
- **Duration:** `"5"` (seconds) — Kling/LTX accept the string `"5"` or `"10"`. Clips are per-scene shorts.
- **Test layout:** new unit tests live FLAT in `tests/` (matching `tests/test_executors.py`), NOT `tests/pipeline/`. Acceptance tests in `tests/acceptance/`.

---

### Task 1: Add the `_upload_file` seam and the default motion prompt

**Files:**
- Modify: `pipeline/fal_adapter.py` (add `_upload_file` seam + `_MOTION_PROMPT` constant)
- Test: `tests/test_fal_upload_seam.py`

**Interfaces:**
- Produces: `pipeline.fal_adapter._upload_file(path: str) -> str` — thin wrapper over `fal_client.upload_file`, monkeypatched in tests.
- Produces: `pipeline.fal_adapter._MOTION_PROMPT: str` — a generic cinematic-motion prompt used when the caller supplies none.

- [ ] **Step 1: Write the failing test**

Create `tests/test_fal_upload_seam.py`:

```python
import pipeline.fal_adapter as fa


def test_upload_file_is_a_monkeypatchable_seam(monkeypatch):
    monkeypatch.setattr(fa, "_upload_file", lambda path: "https://fal.storage/" + path)
    assert fa._upload_file("/tmp/x.png") == "https://fal.storage//tmp/x.png"


def test_motion_prompt_is_a_nonempty_string():
    assert isinstance(fa._MOTION_PROMPT, str) and fa._MOTION_PROMPT.strip()
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /e/YouTube-Automation/amber-light && .venv/Scripts/python.exe -m pytest tests/test_fal_upload_seam.py -v`
Expected: FAIL with `AttributeError: module 'pipeline.fal_adapter' has no attribute '_upload_file'`

- [ ] **Step 3: Add the seam and constant**

In `pipeline/fal_adapter.py`, add directly below the existing `_download_bytes` seam:

```python
def _upload_file(path: str) -> str:
    """Thin, monkeypatchable wrapper over fal_client.upload_file. Uploads a
    local file to fal storage and returns a public URL for use as image_url."""
    import fal_client

    return fal_client.upload_file(path)


_MOTION_PROMPT = "subtle cinematic camera motion, gentle natural movement, smooth"
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd /e/YouTube-Automation/amber-light && .venv/Scripts/python.exe -m pytest tests/test_fal_upload_seam.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
cd /e/YouTube-Automation/amber-light
git add pipeline/fal_adapter.py tests/test_fal_upload_seam.py
git commit -m "feat(fal): add upload_file seam + default motion prompt"
```

---

### Task 2: Implement the real `generate_motion` path

**Files:**
- Modify: `pipeline/fal_adapter.py` (`generate_motion` `dry=False` branch)
- Test: `tests/test_fal_generate_motion.py`

**Interfaces:**
- Consumes: `_upload_file`, `_subscribe`, `_download_bytes` (existing seams); `motion_model` + `MOTION_COST_ESTIMATE` from `pipeline.model_routing`.
- Produces: `generate_motion(image_url: str, tier: str, project, dry=False)` returns `{"bytes": bytes, "cost_usd": float, "meta": {"model": str, "tier": str, "duration": str}}`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_fal_generate_motion.py`:

```python
import pipeline.fal_adapter as fa


def test_generate_motion_uploads_local_path_then_returns_video_bytes(monkeypatch):
    captured = {}

    monkeypatch.setattr(fa, "_upload_file", lambda path: "https://fal.storage/" + path)

    def fake_subscribe(model_id, arguments):
        captured["model_id"] = model_id
        captured["arguments"] = arguments
        return {"video": {"url": "https://fal/out.mp4"}}

    monkeypatch.setattr(fa, "_subscribe", fake_subscribe)
    monkeypatch.setattr(fa, "_download_bytes", lambda url: b"MP4:" + url.encode())

    project = {"id": "p1", "model_routing": {}}  # {} -> DEFAULT_ROUTING
    result = fa.generate_motion("/tmp/scene.png", "standard", project, dry=False)

    assert result["bytes"] == b"MP4:https://fal/out.mp4"
    assert result["cost_usd"] == 0.35  # MOTION_COST_ESTIMATE["standard"]
    assert result["meta"]["model"] == "fal-ai/kling-video/v1.6/standard/image-to-video"
    assert result["meta"]["tier"] == "standard"
    # the local path was uploaded and the resulting URL passed as image_url
    assert captured["arguments"]["image_url"] == "https://fal.storage//tmp/scene.png"
    assert captured["arguments"]["duration"] == "5"
    assert captured["arguments"]["prompt"] == fa._MOTION_PROMPT


def test_generate_motion_passes_through_http_url_without_upload(monkeypatch):
    def boom(path):
        raise AssertionError("_upload_file must not be called for an http url")

    monkeypatch.setattr(fa, "_upload_file", boom)
    monkeypatch.setattr(fa, "_subscribe",
                        lambda m, a: {"video": {"url": "https://fal/out.mp4"}})
    monkeypatch.setattr(fa, "_download_bytes", lambda url: b"x")
    r = fa.generate_motion("https://cdn/img.png", "cheap", {"model_routing": {}}, dry=False)
    assert r["cost_usd"] == 0.15  # MOTION_COST_ESTIMATE["cheap"]


def test_generate_motion_raises_when_no_video(monkeypatch):
    monkeypatch.setattr(fa, "_upload_file", lambda path: "https://u/x")
    monkeypatch.setattr(fa, "_subscribe", lambda m, a: {"video": {}})
    monkeypatch.setattr(fa, "_download_bytes", lambda url: b"")
    try:
        fa.generate_motion("/tmp/x.png", "standard", {"model_routing": {}}, dry=False)
        assert False, "expected RuntimeError"
    except RuntimeError as e:
        assert "no video" in str(e).lower()
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /e/YouTube-Automation/amber-light && .venv/Scripts/python.exe -m pytest tests/test_fal_generate_motion.py -v`
Expected: FAIL with `NotImplementedError` (the current stub) on the first test.

- [ ] **Step 3: Replace the `dry=False` branch**

In `pipeline/fal_adapter.py`, replace the `dry=False` body of `generate_motion` (the `import fal_client` + `raise NotImplementedError(...)` lines) with:

```python
    from pipeline.model_routing import MOTION_COST_ESTIMATE, motion_model

    routing = (project or {}).get("model_routing") or {}
    model_id = motion_model(routing, tier)
    src = image_url
    uploaded_url = src if src.startswith(("http://", "https://")) else _upload_file(src)
    arguments = {
        "prompt": _MOTION_PROMPT,
        "image_url": uploaded_url,
        "duration": "5",
    }

    result = _subscribe(model_id, arguments)
    video = result.get("video") or {}
    url = video.get("url")
    if not url:
        raise RuntimeError(f"fal.ai returned no video for model {model_id}")

    data = _download_bytes(url)
    return {
        "bytes": data,
        "cost_usd": MOTION_COST_ESTIMATE.get(tier, MOTION_COST_ESTIMATE["standard"]),
        "meta": {"model": model_id, "tier": tier, "duration": "5"},
    }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd /e/YouTube-Automation/amber-light && .venv/Scripts/python.exe -m pytest tests/test_fal_generate_motion.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Run the full existing suite**

Run: `cd /e/YouTube-Automation/amber-light && .venv/Scripts/python.exe -m pytest -q`
Expected: all pass (existing mock/dry tests still green — `dry=True` path untouched).

- [ ] **Step 6: Commit**

```bash
cd /e/YouTube-Automation/amber-light
git add pipeline/fal_adapter.py tests/test_fal_generate_motion.py
git commit -m "feat(fal): real image-to-video motion generation (dry=False)"
```

---

### Task 3: Opt-in live acceptance test (real fal.ai i2v call)

**Files:**
- Create: `tests/acceptance/test_fal_motion_live.py`

**Interfaces:**
- Consumes: `generate_image` + `generate_motion` (real) + a real `FAL_KEY`.

- [ ] **Step 1: Write the acceptance test (self-skipping)**

Create `tests/acceptance/test_fal_motion_live.py`:

```python
"""Opt-in: makes a REAL fal.ai image + image-to-video call. Skips unless FAL_KEY
is set. Run: FAL_KEY=... pytest tests/acceptance/test_fal_motion_live.py -v -s
"""
import os
import tempfile
from pathlib import Path

import pytest

from pipeline.fal_adapter import generate_image, generate_motion


@pytest.mark.skipif(not os.environ.get("FAL_KEY"), reason="FAL_KEY not set")
def test_real_image_then_motion_produces_mp4_bytes():
    # First a real keyframe, written to a temp file.
    img = generate_image(
        {"subject": "a paper boat drifting on a calm pond, soft light"},
        "Medium",
        {"id": "acceptance", "model_routing": {}},
        dry=False,
    )
    with tempfile.TemporaryDirectory() as d:
        keyframe = Path(d) / "keyframe.png"
        keyframe.write_bytes(img["bytes"])

        clip = generate_motion(str(keyframe), "cheap", {"id": "acceptance", "model_routing": {}}, dry=False)

    data = clip["bytes"]
    assert isinstance(data, (bytes, bytearray)) and len(data) > 10000
    # ISO-BMFF/MP4 files carry an 'ftyp' box near the start.
    assert b"ftyp" in data[:64]
    assert clip["cost_usd"] > 0
    print(f"\n  motion clip {len(data)} bytes via {clip['meta']['model']}")
```

- [ ] **Step 2: Verify it SKIPS without a key**

Run: `cd /e/YouTube-Automation/amber-light && .venv/Scripts/python.exe -m pytest tests/acceptance/test_fal_motion_live.py -v`
Expected: 1 skipped (`FAL_KEY not set`).

- [ ] **Step 3: (Manual, owner) Verify it PASSES with a real key**

With a funded fal.ai key:
Run: `cd /e/YouTube-Automation/amber-light && FAL_KEY=<real-key> .venv/Scripts/python.exe -m pytest tests/acceptance/test_fal_motion_live.py -v -s`
Expected: PASS, prints the clip byte count + model. Confirms a real MP4 comes back. (Uses the `cheap` LTX tier to keep the check inexpensive.)

- [ ] **Step 4: Commit**

```bash
cd /e/YouTube-Automation/amber-light
git add tests/acceptance/test_fal_motion_live.py
git commit -m "test(fal): opt-in live acceptance test for image-to-video motion"
```

---

## Out of scope (follow-on plans)

- Live budget enforcement (gating actual executor calls through `CostGovernor`).
- Per-scene motion prompts (deriving a motion description from scene content instead of the generic `_MOTION_PROMPT`).
- Passing `duration`/tier through from the scene/executor rather than the fixed `"5"`/executor-hardcoded `standard`.

## Self-review notes

- **Spec coverage:** implements the "real image-to-video clips (Kling/LTX)" part of P1 §7. Budget-gating and per-scene motion prompts explicitly deferred above.
- **Placeholder scan:** none — every step has exact code/commands.
- **Type consistency:** `_upload_file`/`_MOTION_PROMPT` names identical across Tasks 1-3; return dict keys (`bytes`/`cost_usd`/`meta`) match the executor's `result.get("bytes")` consumer; model id `fal-ai/kling-video/v1.6/standard/image-to-video` matches `DEFAULT_ROUTING["motion"]["standard"]` in `pipeline/model_routing.py`.
