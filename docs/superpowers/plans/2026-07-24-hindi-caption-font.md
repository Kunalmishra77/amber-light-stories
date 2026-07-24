# Hindi/Devanagari Caption Font Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the launch-blocker where Hindi/Devanagari captions and title cards render as blank/boxes. Bundle a Devanagari+Latin font (Mukta, OFL) into `media/fonts/`; the render pipeline already prefers `media/fonts/*.ttf`, so this single addition makes both FFmpeg subtitle burn-in (`pipeline/render.py`) and Pillow title cards (`pipeline/executors.py`) render Hindi AND English correctly.

**Architecture:** No code change to the render logic. `pipeline/render.py._default_font_file()` and `pipeline/executors.py._font()` both already check `media/fonts/` for `*.ttf` FIRST and use the first match. Dropping `Mukta-Regular.ttf` there makes it the caption/card font for all languages. Mukta covers Devanagari + Latin, so English is unaffected. Verified locally: PIL renders both `नमस्ते` (1902 bright px) and `Hello` (3205 px) with this font.

**Tech Stack:** Python 3.12, Pillow (already a dep), `pytest`. The font is a binary asset fetched from the Google Fonts OFL repo.

## Global Constraints

- **Product name:** YT-Automation (branding only).
- **Font:** **Mukta** (`Mukta-Regular.ttf`) by Ek Type, **SIL Open Font License** — free to bundle and redistribute. Its OFL license text MUST be bundled alongside as `media/fonts/OFL-Mukta.txt`.
- **Placement:** `media/fonts/Mukta-Regular.ttf`. This directory already exists (contains `.gitkeep`) and is copied into the render-worker Docker image (`Dockerfile` does `COPY media ./media`).
- **No code changes to render logic:** `render.py`/`executors.py` already prefer `media/fonts/*.ttf`. Do not modify their font-resolution code.
- **Coverage requirement:** the bundled font must render BOTH Devanagari and Latin (Mukta does).
- **Test layout:** new unit tests FLAT in `tests/`.
- **Test text encoding:** write Devanagari in tests as Unicode escapes (e.g. `"नमस्ते"` = नमस्ते) so the test is robust regardless of source-file/console encoding.

---

### Task 1: Bundle the font + license and verify Devanagari rendering

**Files:**
- Create: `media/fonts/Mukta-Regular.ttf` (binary, downloaded)
- Create: `media/fonts/OFL-Mukta.txt` (license, downloaded)
- Test: `tests/test_caption_font.py`

**Interfaces:**
- Consumes: `pipeline.render._default_font_file() -> str | None` (existing); `pipeline.executors._font(px_size) -> ImageFont` (existing).
- Produces: `media/fonts/Mukta-Regular.ttf` present, so both font resolvers return it.

- [ ] **Step 1: Download the font + its license**

Run:
```bash
cd /e/YouTube-Automation/amber-light
curl -sL -o media/fonts/Mukta-Regular.ttf "https://github.com/google/fonts/raw/main/ofl/mukta/Mukta-Regular.ttf"
curl -sL -o media/fonts/OFL-Mukta.txt "https://github.com/google/fonts/raw/main/ofl/mukta/OFL.txt"
```
Verify the font is a real TrueType file (not an HTML error page):
```bash
cd /e/YouTube-Automation/amber-light && python -c "p='media/fonts/Mukta-Regular.ttf'; b=open(p,'rb').read(); print('size',len(b)); assert len(b)>100000; assert b[:4] in (b'\x00\x01\x00\x00', b'true', b'OTTO', b'ttcf'), b[:4]; print('valid TrueType')"
```
Expected: `size 432248` (approx), `valid TrueType`.

- [ ] **Step 2: Write the failing test**

Create `tests/test_caption_font.py`:

```python
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT = Path("media/fonts/Mukta-Regular.ttf")
DEVANAGARI = "नमस्ते"  # नमस्ते


def _bright_pixels(font, text):
    img = Image.new("RGB", (700, 200), (0, 0, 0))
    ImageDraw.Draw(img).text((20, 60), text, font=font, fill=(255, 255, 255))
    return sum(1 for p in img.getdata() if p[0] > 200)


def test_bundled_font_present_and_valid():
    assert FONT.is_file(), "media/fonts/Mukta-Regular.ttf must be bundled"
    assert FONT.stat().st_size > 100_000


def test_font_renders_devanagari_and_latin():
    font = ImageFont.truetype(str(FONT), 60)
    assert _bright_pixels(font, DEVANAGARI) > 500, "Devanagari must render (glyphs, not boxes)"
    assert _bright_pixels(font, "Hello") > 500, "Latin must render"
    assert _bright_pixels(font, "") == 0, "control: empty string draws nothing"


def test_render_pipeline_picks_up_bundled_font():
    from pipeline.render import _default_font_file
    resolved = _default_font_file()
    assert resolved is not None and resolved.endswith("Mukta-Regular.ttf")


def test_executors_font_loads_from_bundle():
    from pipeline.executors import _font
    # _font() checks media/fonts/*.ttf first; it must return a usable font.
    font = _font(48)
    assert font is not None
```

- [ ] **Step 3: Run it to verify it passes** (the font was added in Step 1, so these pass immediately)

Run: `cd /e/YouTube-Automation/amber-light && .venv/Scripts/python.exe -m pytest tests/test_caption_font.py -v`
Expected: PASS (4 passed). If `test_render_pipeline_picks_up_bundled_font` fails, confirm `media/fonts/` contains ONLY `Mukta-Regular.ttf` (plus `.gitkeep`/`OFL-Mukta.txt`, which aren't `*.ttf`), since `_default_font_file` returns the first `*.ttf` alphabetically.

- [ ] **Step 4: Run the full suite (no regressions)**

Run: `cd /e/YouTube-Automation/amber-light && .venv/Scripts/python.exe -m pytest -q`
Expected: all pass. (Existing render/executor tests still green — the font resolvers now return Mukta instead of a system font, but both are valid fonts.)

- [ ] **Step 5: Commit (force-add the binary — media/fonts may be lightly ignored)**

```bash
cd /e/YouTube-Automation/amber-light
git add media/fonts/Mukta-Regular.ttf media/fonts/OFL-Mukta.txt tests/test_caption_font.py
git status --short   # confirm the .ttf is staged (not ignored)
git commit -m "feat(captions): bundle Mukta font (Devanagari+Latin) so Hindi captions render"
```
If `git status` shows the `.ttf` was NOT staged (a `.gitignore` excludes it), run `git add -f media/fonts/Mukta-Regular.ttf` and re-commit; note it in your report.

---

## Out of scope (follow-on blocks)

- **Word-by-word highlighted captions** (karaoke-style) — a larger render-styling change.
- **Per-language font selection** — one font (Mukta) covers both scripts, so not needed now.
- Verifying FFmpeg subtitle burn-in on the production Linux worker (the local Windows FFmpeg has fontconfig/path quirks; PIL verification here proves the font's Devanagari coverage, and Linux+fontconfig renders it via `fontfile=` as `render.py` already does).

## Self-review notes

- **Spec coverage:** fixes launch-blocker #3 (Hindi caption font) from the design spec §10.
- **Placeholder scan:** none — exact download URLs, exact test code.
- **Type consistency:** `FONT` path and `Mukta-Regular.ttf` filename identical across steps; `_default_font_file`/`_font` signatures match the existing `render.py`/`executors.py`.
