# Migration Backlog — OFFICIAL

**Status: LIVING DOCUMENT.** This is the authoritative backlog of every architecture issue that must be resolved to align the current **prototype** with `PRODUCT-VISION.md` (the Source of Truth). Do not discard. Every issue stays linked to a migration task (M1–M7). **When future Product Bible parts introduce new requirements, add/adjust items here.**

**Rules:**
- No implementation begins until the Product Bible is sufficiently complete (owner's call). See `PRODUCT-BIBLE-INDEX.md`.
- The current codebase is a **prototype** to be migrated — do not prematurely optimize it.
- Sequencing rule: **M1 → M2 → M3 must land before any new client-facing feature.**
- Sources: `2026-07-20-vision-compliance-audit.md` (V) + `2026-07-20-product-architecture-document.md` (PAD). Future parts append new sources.

## Migration tasks (epics)
| Task | Theme | Gates |
|---|---|---|
| **M1** | Platform/tenant separation & isolation | must precede all client features |
| **M2** | Security & storage hardening | must precede real credentials/publishing |
| **M3** | Per-tenant credentials & channels | must precede generation/publish loop |
| **M4** | Close the generation loop (dashboard ↔ engine) | core product function |
| **M5** | Automation runner (scheduler executes) | Automatic Mode |
| **M6** | Real AI planner + commercial (billing/entitlements) | monetization |
| **M7** | Cleanup, adapters, correctness | ongoing |

## Backlog items
| ID | Issue | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-A1 | Platform (`/admin`) and client workspace share one shell; super-admin sees both | Critical | M1 | Open | V/A1 |
| ISS-C1 | Super-admin is a `client_owner` **member** of the Amber Light tenant (isolation breach) | Critical | M1 | Open | V/C1 |
| ISS-D1 | `admin/page.tsx:150` hardcodes client brand ("Amber Light Stories") on a platform page | High | M1 | Open | V/D1 |
| ISS-D2 | `admin/onboarding/actions.ts:109` onboarding email hardcodes first client's brand for all tenants | High | M1 | Open | V/D2 |
| ISS-D3 | `onboarding/[token]/waiting/waiting-poller.tsx:57` platform waiting page hardcodes client brand | High | M1 | Open | V/D3 |
| ISS-C2 | `assets` storage bucket is public-read (cross-tenant enumeration) | High | M2 | Open | V/C2 |
| ISS-C3 | Leaked dev credentials still in use (rotate; move to secret stores) | High | M2 | Open | V/C3 |
| ISS-B1 | Publishing/analytics use one global `.env` YouTube channel/token, not per-tenant `channels` | Critical | M3 | Open | V/B1 |
| ISS-B2 | Generation engine reads platform `.env` keys, not per-tenant Vault (`get_credential`) | Critical | M3 | Open | V/B2 |
| ISS-E1 | Publishing tied to single provider/channel (needs provider-abstracted, per-tenant) | High | M3 | Open | V/E1 |
| ISS-A2 | Web app never invokes `pipeline/*`; `/generate` is a mock — core lifecycle not executable | Critical | M4 | Open | V/A2 |
| ISS-A3 | `schedules` is config-only; no runner executes cadence (Automatic Mode inert) | High | M5 | Open | V/A3 |
| ISS-B3 | 30-day planner is a deterministic mock, not research-based AI | High | M6 | Open | V/B3 |
| ISS-B4 | Billing has no processor / entitlement + quota enforcement | High | M6 | Open | V/B4 |
| ISS-A4 | Legacy v1 code (`ai/`, `media/`, `worker/`, `app/`) coexists with `pipeline/` | Medium | M7 | Open | V/A4 |
| ISS-D4 | `lib/pipeline/stage-content.ts:177-180` mock SEO hardcodes client brand | Medium | M7 | Open | V/D4 |
| ISS-D5 | `brand/brand-form.tsx:129` placeholder uses client brand example | Low | M7 | Open | V/D5 |
| ISS-E2 | AI provider/model defaults in `executors.py`/`model_routing.py` — enforce DB-driven routing + adapter interface | Medium | M7 | Open | V/E2 |
| ISS-E3 | Mock generators embed sample brand/topics — parameterize by tenant/fixtures | Medium | M7 | Open | V/E3 |
| ISS-E4 | Single storage-provider assumption — add storage adapter interface | Low | M7 | Open | V/E4 |
| ISS-E5 | Stale comment (`auth.ts:141` claims role_permissions empty; it has 68 rows); `workers/page.tsx` `Date.now()` lint | Low | M7 | Open | V/E5, PAD |

**Change log:** 2026-07-20 — created from the accepted Vision-Compliance Audit (21 items). *(Append new items as Bible parts arrive.)*
