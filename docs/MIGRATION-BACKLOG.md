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
| **M8** | Platform Console completeness (Super Admin target from Part 2) | platform ops |
| **M9** | Commercial / Billing (Stripe, invoicing, dunning, tax) | monetization |

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

## Part-2 additions (from `product-bible/PART-2-platform-and-super-admin.md`)
| ID | Issue / gap | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-P2-01 | No **impersonation console** (audited, time-boxed) — the required way for Super Admin to enter a client workspace (pairs with ISS-C1) | Critical | M1/M8 | Open | P2 §5,§10 |
| ISS-P2-02 | No **entitlements/quota engine** enforcing plan limits (videos/credits/seats/storage) server-side | Critical | M8/M9 | Open | P2 §7 |
| ISS-P2-03 | No **AI Providers Registry** / **Publishing Providers Registry** (provider-adapter pattern; keys in secrets) | Critical | M3/M8 | Open | P2 §2.2 |
| ISS-P2-04 | No **Payments/Stripe**, invoicing, dunning, tax, coupons | High | M9 | Open | P2 §7 |
| ISS-P2-05 | No **Queue/Job Manager** (inspect/retry/cancel/DLQ) | High | M4/M8 | Open | P2 §2.3,§9 |
| ISS-P2-06 | No **AI Gateway console** (central routing/cost/fallback/rate-limit) | High | M4/M8 | Open | P2 §9 |
| ISS-P2-07 | No **Compliance/Data-Governance** center (GDPR export/delete, residency, retention, DPA) | High | M8 | Open | P2 §2.4 |
| ISS-P2-08 | No **Backups/DR** module + restore runbook | High | M8 | Open | P2 §2.4 |
| ISS-P2-09 | No **Security Center** (posture, password policy enforce, 2FA enforce, session/device mgmt, anomaly) | High | M8 | Open | P2 §2.4 |
| ISS-P2-10 | No **Reports/Exports**; analytics not rollup-backed (scalability) | Medium | M8 | Open | P2 §8 |
| ISS-P2-11 | No **Onboarding-Template manager** (configurable wizard steps/required APIs) | Medium | M8 | Open | P2 §6 |
| ISS-P2-12 | No **Public API & Webhooks** / event bus | Medium | M8 | Open | P2 §2.5 |
| ISS-P2-13 | No **Support Center + Knowledge Base**; announcements/changelog not unified | Medium | M8 | Open | P2 §2.5 |
| ISS-P2-14 | No **Incidents/Status page**; storage manager; release management | Medium | M8 | Open | P2 §2.3-2.5 |
| ISS-P2-15 | **Platform vs tenant shells not separated** (visual/routing) — operators can confuse contexts (extends ISS-A1) | Critical | M1/M8 | Open | P2 §10, D4 |
| ISS-P2-16 | Duplicate/split responsibilities to reconcile: usage (`/admin/usage` vs `/usage`), global-vs-tenant routing, announcements vs changelog | Low | M7/M8 | Open | P2 validation |
| ISS-P2-17 | Localization/tax/currency + system-defaults not configurable platform-wide | Medium | M8 | Open | P2 §2.2 |

**Change log:**
- 2026-07-20 — created from the accepted Vision-Compliance Audit (21 items).
- 2026-07-20 — **Part 2** added: 17 items (ISS-P2-01…17); new epics **M8** (Platform Console completeness) and **M9** (Commercial/Billing). Total tracked: 38.
*(Append new items as Bible parts arrive.)*
