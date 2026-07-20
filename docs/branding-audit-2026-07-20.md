# Repository Branding Audit — "Amber Light" → "YT-Automation"

**Status: Audit only — NOTHING renamed. Awaiting approval of the migration plan.**
**Date: 2026-07-20 · Canonical product name: `YT-Automation`**

---

## 0. Executive finding (read this first)

**The platform/product is already named "YT Automation."** It was renamed at the product layer back in Phase 6 (P6.1): `platform_settings.platform_name = "YT Automation"`, and the code default (`branding.ts DEFAULT_PLATFORM_SETTINGS`) is "YT Automation." The M1 work already removed the platform-page brand *leaks* (D1/D2/D3).

Therefore a naïve global find-and-replace of "Amber Light" → "YT-Automation" would be **actively harmful.** The remaining occurrences are **not one thing** — they fall into five very different buckets, and only some should ever change:

- **"Amber Light Stories" as client brand is CORRECT and must be preserved.** It is the real name of **tenant #1** (the Default tenant). Renaming it to "YT-Automation" would corrupt a live client's identity and violate the Vision's own rule (Part 1: the client brand belongs only inside its workspace).
- **"amber" the accent COLOR (`#F59E0B`) is not branding at all** and must not be touched.
- **Internal identifiers** (folder `amber-light`, git repo `amber-light-stories`, Python package) are historical and **high-risk / low-value** to rename.
- **v1-legacy product strings** live in code that is already slated for deletion (M7 / ISS-A4).
- **One genuine latent bug:** the `tenants.name` column DEFAULTs to `'Amber Light Stories'` — a *new* tenant created without a name would be mis-branded.

**Bottom line:** "renaming the product" is essentially already done. The real work is (a) fixing a couple of latent leaks/defaults, (b) an *optional* cosmetic cleanup of internal identifiers, and (c) deciding whether to preserve or rename tenant #1's client brand — which is a **product decision, not a rename**.

---

## 1. Classification legend

| # | Class | Meaning | Default action |
|---|---|---|---|
| 1 | **Historical reference** | docs/specs/plans/git-history describing past state | **Leave** (historical record) |
| 2 | **Internal technical identifier** | folder/repo/package/module names | **Optional** rename — high risk, defer |
| 3 | **Active product branding** | string standing for the *product/platform* name | **Change → YT-Automation** (mostly already done) |
| 4 | **Client branding** | "Amber Light Stories" = tenant #1's own brand | **Preserve** (it's client data) — or a separate product decision |
| 5 | **Platform branding** | where the *platform* brand should render | **Already "YT Automation"**; fix any residual leak |
| — | **NOT BRANDING** | the accent *color* "amber" | **Exclude** — never touch |

---

## 2. Full occurrence register (classified)

### 2A. Internal technical identifiers (Class 2 — optional, high-risk)
| Location | Occurrence | Class | Risk if renamed | Recommended |
|---|---|---|---|---|
| Repo folder | `E:\YouTube-Automation\amber-light\` | 2 | **High** — breaks every absolute path in docs/memory/scripts, local clones, IDE, `.venv` | **Defer** (cosmetic only) |
| Git remote | `github.com/Kunalmishra77/amber-light-stories` | 2 | **High** — remote URL, Vercel/CI links, everyone's clones | **Defer** (GitHub auto-redirects renames, but links/CI need updates) |
| `pyproject.toml:2` | `name = "amber-light"` | 2 | Med — package identity, `amber_light.egg-info` | Rename with v1 cleanup (M7) |
| `pyproject.toml:4` | `description = "Amber Light Stories - ..."` | 2/3 | Low | Update text → YT-Automation |
| `worker/celery_app.py:9` | `"amber_light"` (Celery app name) | 2 | Med — queue/broker naming if live | Rename with v1 cleanup (M7) |
| `amber_light.egg-info/` | build artifact | 2 | None (regenerated) | Delete on next build |
| `web/package.json` | name = `web` | — | — | Already generic; no change |
| Vercel project | `web` | — | — | Already generic |
| Supabase project name | *(verify in dashboard)* | 2 | None functionally | **Verify manually**; cosmetic |

### 2B. Client branding — tenant #1 (Class 4 — PRESERVE by default)
| Location | Occurrence | Class | Recommended |
|---|---|---|---|
| `db/schema.sql:5`, `db/migrations/001:8` | `tenants.name ... DEFAULT 'Amber Light Stories'` | **4 + latent bug** | **FIX** the default → generic (`'New workspace'`) or drop default; keep tenant #1's *row* value |
| `db/migrations/009_platform_branding.sql:27-28` | seeds Default tenant `name` + `tenant_settings.brand` = "Amber Light Stories" | 4 | **Preserve** (correct client data for tenant #1) |
| Supabase `tenants` row (Default) | live value "Amber Light Stories" | 4 | **Preserve** (or product decision to rename tenant #1) |
| `web/src/lib/pipeline/stage-content.ts:177,180,185` | mock SEO hardcodes "Amber Light Stories" | 4 + **arch bug (ISS-D4)** | **Derive from tenant brand** (M7), not a YT-Automation rename |
| `web/src/app/(dashboard)/brand/brand-form.tsx:129` | placeholder "e.g. Amber Light Stories" | 4 + ISS-D5 | Generic placeholder ("e.g. your brand name") (M7) |
| `ai/prompts/story_script.txt`, `shortform_story.txt`, `seo.txt` | narrator/channel = "Amber Light Stories" | 4 (v1 client content) | **Preserve** or parameterize by tenant; part of v1 (M7) |

### 2C. v1-legacy product strings (Class 3, in code slated for deletion — M7/ISS-A4)
| Location | Occurrence | Class | Recommended |
|---|---|---|---|
| `app/main.py:5` | `FastAPI(title="Amber Light Stories")` | 3 | Update → "YT-Automation" **or** delete with v1 (M7) |
| `README.md:1` | `# Amber Light Stories — Phase 1` | 3 | Update → YT-Automation (safe text) |
| `pipeline/dryrun.py:74` | print header "Amber Light Stories -- ..." | 3 | Update text → YT-Automation |
| `worker/tasks/notify.py:10` | email subject "Amber Light Stories — video scheduled" | 3/4 | Update / parameterize (v1, M7) |
| `tests/test_prompts.py:7` | asserts `"Amber Light Stories" in p` | 4 (test fixture) | Update **with** the prompt change (keep test↔fixture in sync) |

### 2D. Platform branding (Class 5 — already correct)
| Location | State |
|---|---|
| `platform_settings.platform_name` (DB) | ✅ "YT Automation" |
| `branding.ts DEFAULT_PLATFORM_SETTINGS` | ✅ "YT Automation" |
| favicon | ✅ emoji from `platform_settings.favicon_emoji` (🎬) — no Amber logo asset exists |
| M1 platform-page leaks (D1/D2/D3) | ✅ already fixed |

### 2E. Historical references (Class 1 — LEAVE)
All of `docs/superpowers/specs/*`, `docs/superpowers/plans/*`, `docs/PRODUCT-VISION.md`, `docs/MIGRATION-BACKLOG.md`, the Product Bible parts, `START-HERE-Amber-Light-Stories.md` (parent dir), and this file. These *describe* the history and the client/platform distinction; several intentionally say "Amber Light Stories is only a tenant." **Rewriting them would erase the audit trail.** Leave as-is.

### 2F. NOT BRANDING — accent color "amber" (EXCLUDE — do not touch)
`globals.css` (Accent/focus ring), `login/page.tsx` ("Ambient amber glow"), `announcements-banner.tsx`, `email/templates.ts`, `mock-story.ts` ("Firelit amber"), `media/render.py` + `pipeline/executors.py` ("amber light placeholder palette"), `scripts/benchmark_visuals.py` ("warm amber light"), `business-info-step.tsx` ("e.g. amber, charcoal"). These are the **color** `#F59E0B` / prompt phrasing — **unrelated to the brand.**

### 2G. Operational identifiers (external accounts — out of code scope)
| Item | Note |
|---|---|
| `amberlightstories1985@gmail.com` | super-admin login + Gmail API sender (real account) — a **credential/account**, changed only by provisioning a new email, not a code rename. Ties to M2 (ISS-C3 rotate). |
| `support@amberlight.app` (`support/page.tsx:9`) | support contact string — update to the real support address (product decision) |

---

## 3. Counts

- Total files with "amber" (excluding node_modules/.venv/.next): ~35.
- Of those: **~13 are the accent color** (exclude), **~10 are historical docs** (leave), **~6 are client-brand data/content** (preserve), **~4 are v1-legacy product strings** (delete/rename in M7), **~4 are internal identifiers** (optional/defer), **1 is a latent default-value bug** (fix).
- **Occurrences that genuinely warrant a "→ YT-Automation" change right now: effectively the v1 text strings + `pyproject` description + README + the `tenants.name` DEFAULT bug.** Everything else is preserve / exclude / defer.

---

## 4. Safest migration plan — zero breaking changes, phased

**Principle:** change *display text and defaults* freely; treat *identifiers* and *client data* as high-risk and gate them behind explicit decisions. Never global-replace.

### Phase 0 — Decisions required from owner (no code)
- **D-A: Tenant #1 identity.** Keep "Amber Light Stories" as tenant #1's client brand (recommended — it's a valid client), **or** rename that tenant. This is a *data/product* decision, **not** part of "renaming the product." Default: **keep**.
- **D-B: Internal identifiers.** Do you want to rename the folder/git-repo/Python-package `amber-light` → `yt-automation`? Recommended: **defer** (cosmetic, breaks paths/links, zero functional gain). Default: **defer**.
- **D-C: Support email / sender.** Provide the canonical support + sender addresses to replace `support@amberlight.app` / the Gmail sender (ties to M2).

### Phase 1 — Safe text-only changes (zero risk, reversible)
Display strings that never affect identifiers or data:
- `README.md` title, `pyproject.toml` `description`, `pipeline/dryrun.py` header, `app/main.py` FastAPI title → "YT-Automation". *(All plain text; no imports, no data.)*
- `support/page.tsx` support address → the canonical one (per D-C).

### Phase 2 — Fix the latent default-value bug (data-safe)
- New migration `012`: change `tenants.name` **DEFAULT** from `'Amber Light Stories'` to `'New workspace'` (or drop the default). **Does not alter existing rows** — tenant #1 keeps its name. New tenants stop inheriting a client's brand.

### Phase 3 — Architectural de-hardcoding (folds into M7, not a rename)
- `stage-content.ts` mock SEO + `brand-form.tsx` placeholder + v1 prompts: derive brand from the tenant (ISS-D4/D5) instead of hardcoding. Update `tests/test_prompts.py` in lockstep. *These are the "no-hardcoding" fixes already scheduled for M7 — the branding audit just confirms them.*

### Phase 4 — v1 legacy removal (folds into M7 / ISS-A4)
- `app/`, `worker/`, `ai/`, `media/` (the long-form v1 stack) are already slated for deletion. Removing them deletes most Class-2/3 legacy occurrences (Celery app name, FastAPI title, v1 prompts, egg-info) **for free** — no rename needed.

### Phase 5 — Optional identifier rename (only if D-B = yes; do LAST, on a branch)
Exact, ordered, reversible steps (execute only on approval):
1. GitHub: rename repo `amber-light-stories` → `yt-automation` (GitHub keeps redirects). Update Vercel Git integration + any CI links.
2. `git remote set-url origin <new-url>`.
3. Rename local folder `amber-light` → `yt-automation`; recreate `.venv` (paths are absolute) or fix its activation scripts; update all absolute-path references in `docs/`, memory, and scripts.
4. `pyproject.toml name` + `worker/celery_app.py` app name → `yt-automation` / `yt_automation` (only if v1 not yet deleted).
5. Update `CLAUDE.md`/memory absolute paths.
*Risk: high surface area, purely cosmetic. Recommendation: skip unless there's a concrete reason.*

### Explicitly NOT in scope (do not change)
- The accent **color** "amber" (§2F).
- **Historical docs** (§2E) — including this report and the Vision's client/platform explanation.
- Tenant #1's **client-brand data** unless D-A says otherwise.

---

## 5. Approval checklist (what I need before touching anything)

1. Confirm **D-A** (keep tenant #1 = "Amber Light Stories"? → recommended yes).
2. Confirm **D-B** (defer the folder/repo/package rename? → recommended yes/defer).
3. Provide **D-C** support + sender email addresses.
4. Approve **Phase 1 + Phase 2** now (safe text + the default-value bug fix), or bundle Phase 3/4 into M7 as already planned.

**No files were renamed or edited for this audit.** On approval I will execute the approved phases with the same audit→test→commit rigor used in M1, and I will **not** begin M2 until you say so.
