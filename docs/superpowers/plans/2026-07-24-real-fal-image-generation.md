# Real fal.ai Image Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `NotImplementedError` stub in `pipeline/fal_adapter.generate_image` with a real fal.ai Flux call that generates keyframe/thumbnail images and returns their bytes — the first real-visual deliverable of the YT-Automation video pipeline.

**Architecture:** `fal_adapter.generate_image(dry=False)` resolves the concrete Flux model from routing, calls fal.ai through a thin `_subscribe` seam, downloads the produced image via a `_download_bytes` seam, and returns `{"bytes", "cost_usd", "meta"}` — the exact shape `pipeline/executors.execute_keyframe` / `execute_thumbnail` already consume (`result.get("bytes")`). The two seams make the whole thing unit-testable with no network and no `fal_client` installed. A fixed `seed` (read from the prompt dict) gives character consistency (same seed + prompt = identical image).

**Tech Stack:** Python 3.12, `fal-client` (new dep), `httpx` (already a dep), `pytest` + `pytest-mock` (already dev deps).

## Global Constraints

- **Product name:** YT-Automation (branding only; no code identifiers change here).
- **Provider isolation:** `pipeline/fal_adapter.py` stays the ONLY module that imports `fal_client`. Imports of `fal_client` MUST remain lazy (inside functions), so the mock/dry path works without the package installed.
- **Per-tenant keys:** `FAL_KEY` is read from the environment, which the render worker sets per-job from the tenant Vault. Never hard-code or log a key.
- **No paid calls in CI:** every unit test monkeypatches the `_subscribe` / `_download_bytes` seams. Real fal calls live only in the opt-in acceptance test, which self-skips without `FAL_KEY`.
- **Return contract (unchanged):** `generate_image` returns a dict; the real branch MUST include `"bytes"` (raw image bytes), `"cost_usd"` (float), and `"meta"` (dict). `dry=True` behaviour is unchanged.
- **Image size:** vertical 9:16 — `IMAGE_SIZE = {"width": 1080, "height": 1920}`. The final render scales/crops anyway, so exact size is not load-bearing. Task 5's live test confirms fal accepts this custom size; if a fal model rejects it, switch `IMAGE_SIZE` to the preset string `"portrait_16_9"`.
- **Test layout:** new unit tests live FLAT in `tests/` (matching `tests/test_executors.py`), NOT in a `tests/` subdir. Acceptance tests live in `tests/acceptance/`.

---

### Task 1: Add the `fal-client` dependency and testable seams

**Files:**
- Modify: `pyproject.toml` (dependencies list)
- Modify: `pipeline/fal_adapter.py` (add two module-level seam functions)
- Test: `tests/test_fal_adapter_seams.py`

**Interfaces:**
- Produces: `pipeline.fal_adapter._subscribe(model_id: str, arguments: dict) -> dict` — thin wrapper over `fal_client.subscribe`, monkeypatched in tests.
- Produces: `pipeline.fal_adapter._download_bytes(url: str) -> bytes` — thin wrapper over `httpx.get(...).content`, monkeypatched in tests.

- [ ] **Step 1: Add the dependency**

In `pyproject.toml`, inside the `dependencies = [ ... ]` array, add this line after `"httpx>=0.27",`:

```toml
    "fal-client>=0.5",
```

- [ ] **Step 2: Install it**

Run: `cd /e/YouTube-Automation/amber-light && .venv/Scripts/python.exe -m pip install -e .`
Expected: installs `fal-client` and its deps, ends with `Successfully installed ... fal-client-...`

- [ ] **Step 3: Write the failing test for the seams**

Create `tests/test_fal_adapter_seams.py`:

```python
import pipeline.fal_adapter as fa


def test_subscribe_and_download_are_callable_seams(monkeypatch):
    # The seams exist and are overridable without any network / fal_client.
    monkeypatch.setattr(fa, "_subscribe", lambda model_id, arguments: {"ok": model_id})
    monkeypatch.setattr(fa, "_download_bytes", lambda url: b"IMG:" + url.encode())
    assert fa._subscribe("m", {"a": 1}) == {"ok": "m"}
    assert fa._download_bytes("http://x/y.png") == b"IMG:http://x/y.png"
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd /e/YouTube-Automation/amber-light && .venv/Scripts/python.exe -m pytest tests/test_fal_adapter_seams.py -v`
Expected: FAIL with `AttributeError: module 'pipeline.fal_adapter' has no attribute '_subscribe'`

- [ ] **Step 5: Add the seams**

In `pipeline/fal_adapter.py`, add these two functions at module level, directly below the module docstring / imports (above `generate_image`):

```python
def _subscribe(model_id: str, arguments: dict) -> dict:
    """Thin, monkeypatchable wrapper over fal_client.subscribe. Lazy import so
    the dry/mock path never needs fal_client installed."""
    import fal_client

    return fal_client.subscribe(model_id, arguments=arguments)


def _download_bytes(url: str) -> bytes:
    """Thin, monkeypatchable wrapper that fetches a produced asset URL."""
    import httpx

    return httpx.get(url, timeout=120).content
```

- [ ] **Step 6: Run it to verify it passes**

Run: `cd /e/YouTube-Automation/amber-light && .venv/Scripts/python.exe -m pytest tests/test_fal_adapter_seams.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /e/YouTube-Automation/amber-light
git add pyproject.toml pipeline/fal_adapter.py tests/test_fal_adapter_seams.py
git commit -m "feat(fal): add fal-client dep + testable subscribe/download seams"
```

---

### Task 2: Build the fal prompt string from a scene prompt dict

**Files:**
- Modify: `pipeline/fal_adapter.py` (add `_build_prompt`)
- Test: `tests/test_fal_build_prompt.py`

**Interfaces:**
- Produces: `pipeline.fal_adapter._build_prompt(prompt) -> str` — accepts a str (returned as-is) or a dict; composes a single prompt string from `subject`/`asset_query`, optional `style`, optional `character_reference`, plus a fixed cinematic vertical suffix.

- [ ] **Step 1: Write the failing test**

Create `tests/test_fal_build_prompt.py`:

```python
from pipeline.fal_adapter import _build_prompt


def test_build_prompt_from_dict_includes_subject_and_suffix():
    out = _build_prompt({"subject": "a lonely lighthouse at dawn"})
    assert "a lonely lighthouse at dawn" in out
    assert "vertical 9:16" in out


def test_build_prompt_includes_character_reference():
    out = _build_prompt({"subject": "hero walking", "character_reference": "REF123"})
    assert "REF123" in out


def test_build_prompt_passthrough_string():
    assert _build_prompt("already a prompt") == "already a prompt"


def test_build_prompt_empty_dict_is_safe():
    assert isinstance(_build_prompt({}), str)
    assert isinstance(_build_prompt(None), str)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /e/YouTube-Automation/amber-light && .venv/Scripts/python.exe -m pytest tests/test_fal_build_prompt.py -v`
Expected: FAIL with `ImportError: cannot import name '_build_prompt'`

- [ ] **Step 3: Implement `_build_prompt`**

In `pipeline/fal_adapter.py`, add below the seams:

```python
_PROMPT_SUFFIX = "cinematic, vertical 9:16, high detail, sharp focus"


def _build_prompt(prompt) -> str:
    """Compose a single fal.ai prompt string from a scene prompt (dict) or an
    already-built prompt (str)."""
    if isinstance(prompt, str):
        return prompt
    prompt = prompt or {}
    parts = [prompt.get("subject") or prompt.get("asset_query") or ""]
    if prompt.get("style"):
        parts.append(str(prompt["style"]))
    if prompt.get("character_reference"):
        parts.append(f"consistent character: {prompt['character_reference']}")
    parts.append(_PROMPT_SUFFIX)
    return ", ".join(p for p in parts if p)
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd /e/YouTube-Automation/amber-light && .venv/Scripts/python.exe -m pytest tests/test_fal_build_prompt.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
cd /e/YouTube-Automation/amber-light
git add pipeline/fal_adapter.py tests/test_fal_build_prompt.py
git commit -m "feat(fal): compose fal image prompt from scene prompt dict"
```

---

### Task 3: Implement the real `generate_image` path

**Files:**
- Modify: `pipeline/fal_adapter.py` (`generate_image` `dry=False` branch + `IMAGE_SIZE`)
- Test: `tests/test_fal_generate_image.py`

**Interfaces:**
- Consumes: `_subscribe`, `_download_bytes`, `_build_prompt` (Tasks 1-2); `image_model` + `IMAGE_COST_ESTIMATE` from `pipeline.model_routing`.
- Produces: `generate_image(prompt: dict, quality: str, project, dry=False)` returns `{"bytes": bytes, "cost_usd": float, "meta": {"model": str, "seed": int|None, "prompt": str, "nsfw": bool}}`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_fal_generate_image.py`:

```python
import pipeline.fal_adapter as fa


def _fake_result(url="http://fal/out.png", seed=42, nsfw=False):
    return {"images": [{"url": url, "width": 1080, "height": 1920}],
            "seed": seed, "has_nsfw_concepts": [nsfw]}


def test_generate_image_real_returns_bytes_cost_meta(monkeypatch):
    captured = {}

    def fake_subscribe(model_id, arguments):
        captured["model_id"] = model_id
        captured["arguments"] = arguments
        return _fake_result()

    monkeypatch.setattr(fa, "_subscribe", fake_subscribe)
    monkeypatch.setattr(fa, "_download_bytes", lambda url: b"PNGDATA:" + url.encode())

    project = {"id": "p1", "model_routing": {}}  # {} -> DEFAULT_ROUTING
    result = fa.generate_image({"subject": "a red door"}, "High", project, dry=False)

    assert result["bytes"] == b"PNGDATA:http://fal/out.png"
    assert result["cost_usd"] == 0.035  # IMAGE_COST_ESTIMATE["High"]
    assert result["meta"]["model"] == "fal-ai/flux/dev"  # High -> flux/dev
    assert result["meta"]["seed"] == 42
    assert result["meta"]["nsfw"] is False
    assert "a red door" in captured["arguments"]["prompt"]
    assert captured["arguments"]["image_size"] == {"width": 1080, "height": 1920}


def test_generate_image_raises_when_no_images(monkeypatch):
    monkeypatch.setattr(fa, "_subscribe", lambda m, a: {"images": []})
    monkeypatch.setattr(fa, "_download_bytes", lambda url: b"")
    try:
        fa.generate_image({"subject": "x"}, "Medium", {"model_routing": {}}, dry=False)
        assert False, "expected RuntimeError"
    except RuntimeError as e:
        assert "no image" in str(e).lower()
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /e/YouTube-Automation/amber-light && .venv/Scripts/python.exe -m pytest tests/test_fal_generate_image.py -v`
Expected: FAIL with `NotImplementedError` (the current stub) on the first test.

- [ ] **Step 3: Replace the `dry=False` branch**

In `pipeline/fal_adapter.py`, add the size constant near the top (below `_PROMPT_SUFFIX`):

```python
IMAGE_SIZE = {"width": 1080, "height": 1920}  # vertical 9:16
```

Then replace the `dry=False` body of `generate_image` (the `import fal_client` + `raise NotImplementedError(...)` lines) with:

```python
    from pipeline.model_routing import IMAGE_COST_ESTIMATE, image_model

    routing = (project or {}).get("model_routing") or {}
    model_id = image_model(routing, quality)
    prompt_text = _build_prompt(prompt)
    arguments = {
        "prompt": prompt_text,
        "image_size": IMAGE_SIZE,
        "num_images": 1,
        "output_format": "png",
        "enable_safety_checker": True,
    }
    seed = prompt.get("seed") if isinstance(prompt, dict) else None
    if seed is not None:
        arguments["seed"] = int(seed)

    result = _subscribe(model_id, arguments)
    images = result.get("images") or []
    if not images:
        raise RuntimeError(f"fal.ai returned no image for model {model_id}")

    data = _download_bytes(images[0]["url"])
    nsfw = bool((result.get("has_nsfw_concepts") or [False])[0])
    return {
        "bytes": data,
        "cost_usd": IMAGE_COST_ESTIMATE.get(quality, IMAGE_COST_ESTIMATE["Medium"]),
        "meta": {
            "model": model_id,
            "seed": result.get("seed", seed),
            "prompt": prompt_text,
            "nsfw": nsfw,
        },
    }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd /e/YouTube-Automation/amber-light && .venv/Scripts/python.exe -m pytest tests/test_fal_generate_image.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Run the full existing suite to confirm nothing regressed**

Run: `cd /e/YouTube-Automation/amber-light && .venv/Scripts/python.exe -m pytest -q`
Expected: all pass (dry-run/mock tests still green — the `dry=True` path is untouched).

- [ ] **Step 6: Commit**

```bash
cd /e/YouTube-Automation/amber-light
git add pipeline/fal_adapter.py tests/test_fal_generate_image.py
git commit -m "feat(fal): real Flux image generation (dry=False) with seed + nsfw flag"
```

---

### Task 4: Character-consistency seed and NSFW behaviour, verified end-of-adapter

**Files:**
- Test: `tests/test_fal_image_seed_nsfw.py`
- (No new source — this task locks the seed/NSFW behaviour with dedicated tests; if a test fails, fix `generate_image` from Task 3.)

**Interfaces:**
- Consumes: `generate_image` (Task 3).

- [ ] **Step 1: Write the failing/So-far-uncovered test**

Create `tests/test_fal_image_seed_nsfw.py`:

```python
import pipeline.fal_adapter as fa


def test_seed_is_forwarded_for_character_consistency(monkeypatch):
    captured = {}
    monkeypatch.setattr(fa, "_subscribe",
                        lambda m, a: captured.update(a) or {"images": [{"url": "u"}], "seed": 7})
    monkeypatch.setattr(fa, "_download_bytes", lambda url: b"x")
    fa.generate_image({"subject": "hero", "seed": 7}, "Medium", {"model_routing": {}}, dry=False)
    assert captured["seed"] == 7


def test_no_seed_means_no_seed_arg(monkeypatch):
    captured = {}
    monkeypatch.setattr(fa, "_subscribe",
                        lambda m, a: captured.update(a) or {"images": [{"url": "u"}]})
    monkeypatch.setattr(fa, "_download_bytes", lambda url: b"x")
    fa.generate_image({"subject": "hero"}, "Medium", {"model_routing": {}}, dry=False)
    assert "seed" not in captured


def test_nsfw_flag_surfaced_in_meta(monkeypatch):
    monkeypatch.setattr(fa, "_subscribe",
                        lambda m, a: {"images": [{"url": "u"}], "has_nsfw_concepts": [True]})
    monkeypatch.setattr(fa, "_download_bytes", lambda url: b"x")
    r = fa.generate_image({"subject": "x"}, "Low", {"model_routing": {}}, dry=False)
    assert r["meta"]["nsfw"] is True
```

- [ ] **Step 2: Run it**

Run: `cd /e/YouTube-Automation/amber-light && .venv/Scripts/python.exe -m pytest tests/test_fal_image_seed_nsfw.py -v`
Expected: PASS (3 passed) — Task 3's implementation already satisfies these. If any fail, fix `generate_image` to match, then re-run.

- [ ] **Step 3: Commit**

```bash
cd /e/YouTube-Automation/amber-light
git add tests/test_fal_image_seed_nsfw.py
git commit -m "test(fal): lock seed forwarding + nsfw surfacing for image gen"
```

---

### Task 5: Opt-in live acceptance test (real fal.ai call)

**Files:**
- Create: `tests/acceptance/test_fal_image_live.py`

**Interfaces:**
- Consumes: `generate_image` (Task 3) + a real `FAL_KEY` in the environment.

- [ ] **Step 1: Write the acceptance test (self-skipping)**

Create `tests/acceptance/test_fal_image_live.py`:

```python
"""Opt-in: makes a REAL fal.ai image call. Skips unless FAL_KEY is set.
Run with: FAL_KEY=... pytest tests/acceptance/test_fal_image_live.py -v -s
"""
import os

import pytest

from pipeline.fal_adapter import generate_image


@pytest.mark.skipif(not os.environ.get("FAL_KEY"), reason="FAL_KEY not set")
def test_real_flux_image_generates_png_bytes():
    result = generate_image(
        {"subject": "a cozy reading nook by a rainy window, warm light"},
        "Medium",
        {"id": "acceptance", "model_routing": {}},
        dry=False,
    )
    data = result["bytes"]
    assert isinstance(data, (bytes, bytearray)) and len(data) > 1000
    # PNG magic number, since we request output_format=png
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    assert result["cost_usd"] > 0
    print(f"\n  generated {len(data)} bytes via {result['meta']['model']}")
```

- [ ] **Step 2: Verify it SKIPS without a key**

Run: `cd /e/YouTube-Automation/amber-light && .venv/Scripts/python.exe -m pytest tests/acceptance/test_fal_image_live.py -v`
Expected: 1 skipped (`FAL_KEY not set`).

- [ ] **Step 3: (Manual, owner) Verify it PASSES with a real key**

With a funded fal.ai key:
Run: `cd /e/YouTube-Automation/amber-light && FAL_KEY=<real-key> .venv/Scripts/python.exe -m pytest tests/acceptance/test_fal_image_live.py -v -s`
Expected: PASS, prints the generated byte count + model. Confirms a real PNG comes back.

- [ ] **Step 4: Commit**

```bash
cd /e/YouTube-Automation/amber-light
git add tests/acceptance/test_fal_image_live.py
git commit -m "test(fal): opt-in live acceptance test for real image generation"
```

---

## Out of scope (follow-on plans)

- **Real motion (image-to-video)** — `generate_motion(dry=False)` (Kling/LTX). Next plan.
- **Live budget enforcement** — gating the actual executor calls through `CostGovernor` in live mode (currently the governor only plans; `execute_keyframe` calls fal unconditionally). Next plan.
- Hook/script quality, styled captions, Hindi font — separate P1 plans.

## Self-review notes

- **Spec coverage:** implements the "real AI images (fal Flux)" part of P1 §7 and the keyframe-first consistency mechanism (seed) from §4. Motion, captions, hook/script, font, budget-gating are explicitly deferred above.
- **Placeholder scan:** none — every step has exact code/commands.
- **Type consistency:** `_subscribe`/`_download_bytes`/`_build_prompt`/`IMAGE_SIZE` names are identical across Tasks 1-5; return dict keys (`bytes`/`cost_usd`/`meta`) match the executor's existing `result.get("bytes")` consumer.
