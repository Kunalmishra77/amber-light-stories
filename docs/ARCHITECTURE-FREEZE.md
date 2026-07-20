# Architecture Freeze — PERMANENT OPERATING RULE

**Status: PERMANENT RULE (ratified by owner, 2026-07-20).** This governs the transition from specification to implementation and cannot be skipped.

## The gate
```
Product Bible authored (all parts) ─► ARCHITECTURE FREEZE ─► 4 docs APPROVED ─► Implementation (M1 → M2 → M3 → …)
```
**No coding begins before the Architecture Freeze is complete and its four deliverables are approved by the owner.** (This is in addition to the standing "Architecture First, Implementation Later" rule and the "current code is a prototype to be migrated" rule.)

## When it runs
Only **after** the Product Bible reaches sufficient completeness (owner's declaration) — see `PRODUCT-BIBLE-INDEX.md`. Not before; the Bible is still being authored.

## Freeze activities — review the complete Bible beginning to end and verify:
- Every section is **internally consistent**.
- **Duplicate** requirements removed.
- **Conflicting** requirements resolved.
- Identify **missing**: enterprise features · SaaS capabilities · UX flows · security requirements · database entities · APIs · automation workflows · onboarding steps · client-lifecycle stages · platform-lifecycle stages · edge cases.
- Identify **future scalability risks**.

## Four required deliverables (all must be APPROVED before implementation)
1. **Final Gap Analysis** — everything missing/duplicated/conflicting across the Bible, categorized (enterprise, SaaS, UX, security, DB, API, automation, onboarding, lifecycle, edge cases, scalability), with resolution for each.
2. **Final Architecture Review** — the consolidated target architecture (systems, tenancy, data, APIs, automation, AI pipeline, security) reconciled against the Vision; confirms internal consistency.
3. **Final SaaS Readiness Report** — production-SaaS readiness scorecard (multi-tenancy, isolation, security, billing, scalability, observability, DR, compliance) with pass/gap per dimension.
4. **Final Implementation Plan** — the approved build order (reconciling the Migration Backlog M1–M7 with all Bible parts), dependencies, phases, and definition-of-done.

## Outputs feed the backlog
Anything the freeze finds (gaps, conflicts, new entities/APIs/flows) is added to `MIGRATION-BACKLOG.md` before implementation. The Final Implementation Plan supersedes ad-hoc ordering.

## Enforcement
If asked to implement before the freeze deliverables are approved, decline and point here. The freeze is mandatory and permanent.
