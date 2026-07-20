# Part 8 — Complete Subscription, Billing, Credits & Commercial Architecture (Revision 1)

**Status: APPROVED & LOCKED**
**Version: Revision 1**
**Date: 2026-07-20**

**Version history:**
| Version | Date | Status | Notes |
|---|---|---|---|
| 1.0 (Draft) | 2026-07-20 | Awaiting Review | Initial commercial architecture: subscription/entitlement/usage/credit/billing/payment/tax/promotion/revenue/enterprise; 14 deliverables; ADR-060…064; ISS-P8-01…12; epic M9. |
| **Revision 1** | 2026-07-20 | **APPROVED & LOCKED** | +10 enhancements (§15): AI Cost Intelligence Center, Profitability Engine, Enterprise Procurement, Reseller & Partner Program, Marketplace Commerce, Commercial Policy Engine, Customer Success Analytics, Billing Simulator, Financial Audit Center, Commercial Observability. Subscription/billing/credit/revenue/enterprise reconciled. ADR-065…069 added; ISS-P8-R1-01…10 added. Future changes only via explicit **Revision 2**. |

**Precedence:** Part 1 (`PRODUCT-VISION.md`) overrides everything · Part 2 (Platform/Super Admin, Rev 1 Locked) overrides implementation · Parts 3–7 (Client Experience, Onboarding, Automation Engine, AI Pipeline, Auth/Security — all Rev 1 Locked). This document is the permanent Source of Truth for **Subscription, Billing, Credits & Commercial** once approved.

**Relationship to prior parts (no duplication):** Part 2 §7 introduced the subscription model direction + billing epic M9 + entitlement engine gap (ISS-P2-02/04); Part 3 §19.6/§19.2 defined the Cost Estimator + per-video Cost Breakdown; Part 4 §11/§20.12 defined subscription activation + pre-activation cost estimation; Part 5 §10 (ADR-032) defined the engine **Cost Governor** with per-video/workspace/monthly budgets; Part 7 §2 defined the **Billing Admin** role + org tier. **Part 8 is the authoritative commercial specification** — the plans, entitlements, metering, credits, billing, payments, tax, promotions, revenue analytics, and enterprise commercials — that turns usage into revenue while protecting margins. It **feeds the Cost Governor** (credits/budgets) and **is enforced by it**; it does not re-specify the governor, the estimator, or the usage UI.

---

## 0. Reading guide
Sections 1–12 are the commercial design. Section 13 holds the **14 required deliverables**. Section 14 is governance (missing-feature + improvement reports, ADR + backlog updates). Deliverable tables win over narrative on conflict.

---

## 1. Commercial principles

A world-class SaaS commercial layer serving **Individual Creators → Agencies → Teams → Enterprises → White-Label** — supporting recurring subscriptions, AI-usage billing, and enterprise contracts **without redesign**. Non-negotiables:
1. **Config-driven, never hardcoded** — plans, entitlements, prices, tax, coupons all live in configuration (Part 1).
2. **Margin-protected** — commercials always respect the AI cost model (Part 1 $ cap); a plan can never let usage exceed its economics silently (governor, ADR-032).
3. **Entitlement-enforced server-side** — every gated action checks plan limits before running (ADR-004).
4. **Tenant/org-isolated** — usage, credits, invoices never cross tenants (Part 5 §12); billing rolls up to the org tier (Part 7 ADR-026).
5. **Provider-agnostic payments** — payment processors are adapters, swappable (ADR-060).
6. **Auditable & compliant** — every commercial action is audited (Part 7 §10); tax/invoicing are compliance-grade.
7. **Separation of duties** — platform **Billing Admin** manages catalog/invoicing; tenant **Client Owner** manages their own subscription (Part 7).

---

## 2. Subscription Engine

A configurable engine; plans are **data, not code** (extends the S5 `plans` table direction).

**Plan tiers (config-seeded, illustrative):** Free Trial · Free · Starter · Professional · Business · Agency · Enterprise · Custom Plans.

**Architecture:**
- A **Plan** = a named, versioned bundle of **entitlements** (§3) + **price points** (§6) + **billing terms** (§6) + **credit grant** (§4).
- **Versioned** (ADR-036 model) — changing a plan creates a new version; existing subscribers stay on their pinned version until migrated (no silent repricing).
- **Trials** — time-boxed Free Trial with trial entitlements; converts to a paid plan or downgrades to Free at expiry.
- **Custom/Enterprise plans** — bespoke entitlement/price bundles created by Billing Admin (§12).
- Plans are managed in the platform **Plans catalog** (Part 2 `/admin/plans`, exists in prototype). See Deliverable **13.1**.

---

## 3. Feature Entitlements

Every feature is gated by an **entitlement** (ADR-004); the entitlement engine is the contract between the catalog and enforcement.

**Entitlement dimensions (examples):** Number of Workspaces · Team Members · AI Credits · Monthly Videos · Monthly Shorts · Storage · Automation Runs · AI Models · Providers · Publishing Targets · Advanced Analytics · API Access · White Label · Priority Queue · Premium Support.

**Types of entitlement:**
- **Quota** (numeric, consumable per period) — videos/shorts/runs/credits/storage/API calls.
- **Boolean** (feature on/off) — White Label, API Access, Advanced Analytics.
- **Enumerated** (allowed set) — which AI models/providers/publishing targets.
- **Tiered** (level) — support tier, queue priority (Part 5 §17.5).

**Mechanics:**
- **Inheritance** — org default → workspace override (tighten-only within plan limits; Part 7 ADR-056 pattern).
- **Enforcement** — checked **server-side** on every gated action **before** execution (ADR-004); the Automation Engine's control plane (Part 5) is a primary enforcement point.
- **Overage policy** — per entitlement: **block** (hard cap) vs **allow + bill** (metered overage, §5) vs **allow + throttle** (priority queue).
- **Future expansion** — new entitlements register without redesign. See Deliverable **13.2**.

---

## 4. AI Credit System

A flexible credit layer (extends S5 `credit_ledger`) that **integrates with the Cost Governor** (Part 5 §10, ADR-032) — credits are the currency the governor debits.

**Credit types:** Monthly Credits (plan grant, reset each cycle) · Purchased Credits (top-ups) · Promotional Credits · Bonus Credits · with **Expiry Rules** per type; plus Credit Transfers (future) · Credit Refunds · Cost Estimation · Cost Prediction.

**Architecture:**
- **Ledger model** — an append-only credit ledger (grants + debits + refunds + expiries); balance = sum; fully tenant-isolated + auditable.
- **Consumption order (config)** — spend soonest-expiring / promotional first, then monthly, then purchased (protects the customer + platform).
- **Governor integration** — before any paid job, the governor (ADR-032) checks **credits + budget** and debits actuals post-run; **estimate → reserve → execute → reconcile** (ADR-020). Over-balance → block or downgrade (never silent overspend, Part 1).
- **Estimation/prediction** — reuses the Estimator (Part 3 §19.6): show credit cost **before** running; predict monthly burn.
- **Refunds** — failed/cancelled runs refund reserved credits (idempotent, Part 5 ADR-030). See Deliverable **13.4**.

---

## 5. Usage Metering

A complete, tenant-isolated usage engine (extends S5 `usage_counters`) — the source of truth for entitlement enforcement, credit debits, overage billing, and analytics.

**Metered signals:** AI Tokens · Images Generated · Videos Generated · Voice Minutes · Rendering Minutes · Storage · API Calls · Queue Usage · Automation Runs · Publishing Events.

**Architecture:**
- **Metered at the source** — the AI Gateway (ADR-005) meters model usage; the engine (Part 5) meters runs/queue; storage/publishing adapters meter their events. Every metered event carries tenant/workspace/run correlation IDs.
- **Tenant-isolated + auditable** — usage never crosses tenants (Part 5 §12); every counter is auditable (Part 7 §10).
- **Rollups** — per-period aggregates (ADR-007) power dashboards, entitlement checks, and invoices at scale.
- **Reconciliation** — metered actuals reconcile against estimates (ADR-020) and against provider bills (cost truth). See Deliverable **13.3**.

---

## 6. Billing Engine

Supports the full billing lifecycle (realizes epic M9).

**Modes:** Monthly · Yearly · Custom · **Usage Billing** (metered overage) · Enterprise Contracts · Manual Invoices · Offline Billing.
**Lifecycle:** Auto-Renewal · Renewal Reminder · Failed-Payment Handling · Grace Period · Dunning.

**Architecture:**
- **Billing cycle engine** — anchors periods to the subscription; computes each invoice as **base plan + metered overage (§5) + one-time (credit top-ups) − discounts (§8) + tax (§7)**.
- **Proration** — mid-cycle upgrades/downgrades prorate (§9).
- **Dunning** — failed payment → retry schedule → reminders → grace period → suspend (workspace goes Past-Due/Paused, Part 3/4 lifecycle) → eventual downgrade; all notified (Part 3 §11) and audited.
- **Enterprise/offline** — manual invoices, PO-based, net-terms (no card) for Enterprise (§12).
- **Idempotent** — billing operations are exactly-once (Part 5 ADR-030) — no double-charge. See Deliverable **13.5**.

---

## 7. Payment Providers

Provider abstraction — processors are **adapters** behind a stable interface (ADR-060), resolved by config/region.

**Supported (config-driven):** Stripe · Razorpay · Paddle · PayPal · Bank Transfer · future providers.

**Architecture:** a workflow references *"charge / refund / subscribe"* capabilities, never a specific processor; the active processor is chosen by **region/currency/customer** (e.g., Razorpay for India GST, Stripe for global, Paddle as merchant-of-record for tax simplification). Webhooks from processors are **signed + replay-protected** (Part 7 §7) and drive subscription/payment state. Swapping/adding a processor is a config + adapter change — **no billing redesign**. See Deliverable **13.6**.

---

## 8. Invoices & Tax

Compliance-grade invoicing (realizes Part 2 §2.2 localization/tax gap ISS-P2-17).

**Tax:** GST · VAT · Sales Tax · Tax-Exempt Customers · with **Credit Notes · Refunds · Invoice History · Downloadable Invoices · Multi-Currency · Multi-Region.**

**Architecture:**
- **Tax engine** — computes tax by customer region + product tax category; supports tax-exempt (VAT ID / exemption cert); or delegates to a **merchant-of-record** processor (Paddle) that handles global tax.
- **Invoices** — immutable, sequentially-numbered, downloadable (PDF), with full history; **credit notes** for refunds/adjustments.
- **Multi-currency / multi-region** — price points per currency; presentment currency by region; FX handled at capture.
- **Compliance** — invoices/tax records feed the audit + compliance layer (Part 7 §10-11). See Deliverable **13.7**.

---

## 9. Plan Management & Coupons/Promotions

### 9.1 Plan management (Deliverable 13.1 cont.)
Supports: **Upgrade · Downgrade · Pause · Resume · Cancel · Reactivate · Scheduled Changes · Proration · Feature Preview.**
- **Upgrade** — immediate, prorated, entitlements expand at once.
- **Downgrade** — end-of-cycle by default (avoid mid-cycle loss); entitlements shrink at boundary; usage over new limits handled per overage policy.
- **Pause/Resume** — temporarily halt billing + automation (retain data); **Cancel** → runs to period end → then Free/suspended; **Reactivate** restores.
- **Scheduled Changes** — future-dated plan changes.
- **Feature Preview** — trial a higher-tier feature (time-boxed entitlement, Part 7 temporary permissions) to drive upgrades.

### 9.2 Coupons & Promotions
Supports: **Coupons · Discount Codes · Referral Codes · Promotional Campaigns · Trial Extensions · Upgrade Discounts · Seasonal Promotions.**
- **Coupon engine** — percentage/fixed/first-N-months discounts, usage limits, expiry, plan/segment eligibility, stacking rules; validated at checkout + applied on invoices (§6).
- **Referral codes** — grant promotional credits (§4) or discounts to referrer + referee.
- **Campaigns** — seasonal/segment promotions (config), measurable (Revenue Analytics §10). See Deliverable **13.8**.

---

## 10. Revenue Analytics (Commercial Dashboard)

A Super-Admin commercial dashboard (Part 2 platform-scoped). Displays: **MRR · ARR · Active Subscriptions · Churn · LTV · ARPU · Revenue Growth · Credit Usage · Plan Distribution · Renewal Forecast · Failed Payments.**

**Architecture:** rollup-backed (ADR-007) from subscription/invoice/payment/usage/credit streams; computes SaaS metrics (MRR/ARR/churn/LTV/ARPU) over time with **renewal forecasting** (ties Part 2 §11.9 Capacity Forecasting) and **failed-payment/dunning health**. Tenant owners see their own billing/usage (Part 3 §5); the platform sees the aggregate. Feeds the Cost Simulator (Part 2 §11.2) for margin what-ifs. See Deliverable **13.9**.

---

## 11. Enterprise Commercials

Supports the enterprise motion (realizes Part 7 org tier + Billing Admin): **Custom Contracts · Custom Pricing · Custom Limits · Procurement · Purchase Orders · SLAs · Dedicated Support · Multi-Year Contracts · Enterprise Billing Contacts.**

**Architecture:**
- **Custom plans/limits/pricing** — bespoke entitlement + price bundles (§2, §3), not exposed publicly.
- **Contract-based billing** — POs, net-terms, offline invoices (§6), multi-year with scheduled renewals; **SLAs** as commitments tracked against Platform Health (Part 5 §17.11).
- **Procurement** — quote → PO → contract → provision workflow (Part-5 workflow, ADR-017), audited.
- **Enterprise billing contacts** — separate billing contacts/roles per org (Part 7 identity); dedicated support tier (entitlement §3).
- **White-Label commercial** — white-label is an entitlement + branding (P6.1) + possible reseller pricing. See Deliverable **13.10**.

---

## 12. Roles & separation (commercial)

- **Platform Billing Admin** (Part 7 §2.1) — owns the plan catalog, pricing, tax config, coupons, invoicing, dunning, revenue analytics, enterprise contracts. No content/security config.
- **Tenant Client Owner** (Part 7 §2.2) — manages **their own** subscription (upgrade/downgrade/cancel), payment method, sees their invoices/usage/credits. Cannot see other tenants or the platform catalog.
- All commercial actions audited (Part 7 §10); payment methods/secrets in the Vault (Part 7 §8).

---

## 13. Required Deliverables

### 13.1 Subscription Architecture
Config-driven, versioned Plans = entitlements + price points + billing terms + credit grant; trials; custom/enterprise plans; subscriber version pinning; plan management (upgrade/downgrade/pause/resume/cancel/reactivate/scheduled/proration/feature-preview, §9.1).

### 13.2 Entitlement Architecture
Quota/boolean/enumerated/tiered entitlements (§3); org→workspace tighten-only inheritance; server-side enforcement before execution (ADR-004); per-entitlement overage policy (block/bill/throttle); extensible.

### 13.3 Usage Metering Architecture
Metered-at-source (Gateway/engine/adapters), tenant-isolated, auditable, rollup-backed, reconciled vs estimates + provider bills (§5).

### 13.4 AI Credit Architecture
Append-only credit ledger (monthly/purchased/promo/bonus, expiry rules, refunds, future transfers); config consumption order; Cost Governor integration (estimate→reserve→execute→reconcile, ADR-032/020); over-balance → block/downgrade (§4).

### 13.5 Billing Architecture
Cycle engine (base + overage + one-time − discount + tax); monthly/yearly/custom/usage/enterprise/manual/offline; auto-renewal + reminders + failed-payment + grace + dunning; proration; idempotent (§6).

### 13.6 Payment Provider Architecture
Adapter pattern (Stripe/Razorpay/Paddle/PayPal/Bank/future); processor chosen by region/currency/customer; signed+replay-protected webhooks; swappable without redesign (ADR-060).

### 13.7 Invoice & Tax Architecture
Tax engine (GST/VAT/sales-tax/exempt) or merchant-of-record; immutable numbered downloadable invoices + credit notes + history; multi-currency/region; compliance-fed (§8).

### 13.8 Promotion Engine
Coupons/discount/referral/campaign/trial-extension/upgrade-discount/seasonal; eligibility + limits + expiry + stacking; validated at checkout, applied on invoices, measurable (§9.2).

### 13.9 Revenue Analytics
MRR/ARR/active-subs/churn/LTV/ARPU/growth/credit-usage/plan-distribution/renewal-forecast/failed-payments; rollup-backed; platform aggregate + tenant self-view; feeds Cost Simulator (§10).

### 13.10 Enterprise Commercial Architecture
Custom contracts/pricing/limits; PO/procurement workflow; net-terms/offline/multi-year; SLAs vs Platform Health; enterprise billing contacts; dedicated support; white-label/reseller (§11).

### 13.11 Missing Feature Report → §14.1
### 13.12 Commercial Improvement Suggestions → §14.2
### 13.13 ADR Updates → §14.3
### 13.14 Migration Backlog Updates → §14.4

---

## 14. Governance

### 14.1 Missing Feature Report (found while designing Part 8)
1. **Entitlement engine** enforcing plan limits server-side with overage policies — plans exist (S5) but enforcement is absent (ISS-P2-02 deepened) (ISS-P8-01).
2. **Payment processor + subscriptions** (Stripe/Razorpay/Paddle/PayPal adapters, checkout, webhooks) — no processor today (ISS-P2-04 deepened) (ISS-P8-02).
3. **Full credit system** (types, expiry, consumption order, governor-integrated reserve/reconcile, refunds) — `credit_ledger` exists but not the lifecycle (ISS-P8-03).
4. **Complete usage metering** (all signals metered-at-source, reconciled vs provider bills) — `usage_counters` partial (ISS-P8-04).
5. **Billing engine** (cycles, proration, auto-renew, dunning, grace, usage-billing) (ISS-P8-05).
6. **Invoices & tax** (GST/VAT/exempt, credit notes, multi-currency/region, downloadable) — none (extends ISS-P2-17) (ISS-P8-06).
7. **Promotion engine** (coupons/referrals/campaigns) (ISS-P8-07).
8. **Plan management flows** (upgrade/downgrade/pause/cancel/scheduled/proration/feature-preview) (ISS-P8-08).
9. **Revenue analytics** (MRR/ARR/churn/LTV/ARPU/forecast/failed-payments dashboard) (ISS-P8-09).
10. **Enterprise commercials** (custom contracts/pricing/PO/net-terms/SLAs/multi-year/billing-contacts) (ISS-P8-10).
11. **Payment provider abstraction** (region/currency-based adapter routing) (ISS-P8-11).
12. **Commercial audit + separation of duties** (Billing Admin vs Client Owner; every commercial action audited) (ISS-P8-12).

**Already tracked (referenced):** entitlements/quota engine (ISS-P2-02), payments/Stripe/dunning/tax (ISS-P2-04), billing epic **M9**, localization/tax config (ISS-P2-17), Cost Governor (ISS-P5-08/ADR-032), Estimator (ISS-P3-R1-06/12), Capacity Forecasting (ISS-P2-R1-09), Cost Simulator (ISS-P2-R1-02), org tier + Billing Admin (Part 7 ISS-P7-04/ADR-026), plans catalog (S5, exists), subscription activation states (ISS-P4-07).

### 14.2 Commercial Improvement Suggestions
1. **Entitlements as the single gate** — every feature/quota flows through one entitlement engine; enforcement lives in the Automation Engine control plane (Part 5), so limits are impossible to bypass.
2. **Credits unify cost + commerce** — the credit ledger is the shared currency between the Cost Governor (technical) and billing (commercial); estimate→reserve→reconcile prevents both overspend and revenue leakage.
3. **Payments as adapters, routed by region/currency** — India (Razorpay/GST) and global (Stripe/Paddle-MoR) coexist; adding a market is config.
4. **Merchant-of-record option** — Paddle-style MoR removes global tax/compliance burden for smaller scale; keep direct processors for enterprise/lower fees.
5. **Usage-based overage as an upsell path** — soft caps (allow + bill/throttle) convert to upgrades better than hard blocks; per-entitlement policy makes this tunable.
6. **Plan/price versioning + subscriber pinning** — reprice safely without breaking existing customers; migrate deliberately.
7. **Revenue analytics + Cost Simulator together** — model margin per plan (revenue − AI cost) continuously; the $ cap (Part 1) is a margin floor enforced by the governor.
8. **Enterprise motion as workflows** — quote→PO→contract→provision as audited Part-5 workflows scales the sales-assisted path.

### 14.3 ADR updates (added to `product-bible/ADR.md`)
- **ADR-060** — **Payment processors are adapters routed by region/currency/customer**: Stripe/Razorpay/Paddle/PayPal/Bank behind one interface; swap/add without billing redesign; signed+replay-protected webhooks.
- **ADR-061** — **Config-driven, versioned Plans + entitlement engine**: plans are versioned data (entitlements + prices + terms + credit grant); subscribers pin a version; entitlements are enforced server-side before execution with per-entitlement overage policy (block/bill/throttle).
- **ADR-062** — **Credits are the shared currency of cost + commerce**: an append-only credit ledger (typed grants, expiry, consumption order) integrates with the Cost Governor via estimate→reserve→execute→reconcile; over-balance blocks/downgrades (never silent overspend).
- **ADR-063** — **Compliance-grade invoicing & tax**: immutable numbered invoices + credit notes, multi-currency/region, GST/VAT/exempt via tax engine or merchant-of-record; feeds audit/compliance (Part 7).
- **ADR-064** — **Margin-aware commercials**: every plan's economics (revenue − AI cost) are modeled continuously (Revenue Analytics + Cost Simulator); the per-video cost cap (Part 1) is a governor-enforced margin floor.

### 14.4 Migration Backlog updates
Items **ISS-P8-01 … ISS-P8-12** added under epic **M9 (Commercial/Billing)** — now the primary home for the full commercial layer — cross-linking **M8** (revenue/commercial consoles), **M11** (governor/metering integration), **M13** (billing-admin role, commercial audit, payment secrets in Vault). See `MIGRATION-BACKLOG.md`.

---

---

## 15. Revision 1 — Commercial Intelligence & Enterprise Enhancements

Revision 1 **adds** the following without removing anything above. Overlaps **improve** existing sections (mappings noted); nothing is duplicated. Theme: move from *"can we bill?"* to *"do we profit, and how do we grow it?"* — cost/profit intelligence, partner/marketplace monetization, a central commercial policy engine, and commercial-grade observability/audit.

### 15.1 AI Cost Intelligence Center
*Improves Revenue Analytics (§10) + Usage Metering (§5) — the cost side of the P&L, fed back to the Cost Governor.*

Displays: **Daily · Weekly · Monthly AI Cost · Per-Workspace · Per-Automation · Per-Video · Per-Provider · Per-Stage Cost · Estimated vs Actual · Cost Trend · Margin Analysis.** Architecture: aggregates the metered cost signals (§5, AI Gateway ADR-005) across every dimension; **estimate-vs-actual** reconciliation (ADR-020) surfaces drift. **The Cost Governor (Part 5 §10, ADR-032) consumes this intelligence** to tune future routing/provider selection (closes the optimization loop — the platform learns which providers/stages/workspaces are expensive and optimizes). Platform-scoped (Super/Billing Admin) with a tenant-scoped subset (Part 3 §19.2). See Deliverable **13.15**.

### 15.2 Profitability Engine
*Extends Revenue Analytics (§10) from revenue → profit (ADR-065).*

Computes **profit**, not just revenue: **Revenue · Provider Cost · AI Cost · Infrastructure Cost · Storage Cost · Queue Cost · Rendering Cost · Profit · Profit Margin · Customer Margin · Plan Profitability.** Architecture: joins revenue (invoices/subscriptions §6-8) with the full cost stack (AI Cost Intelligence §15.1 + infra/storage/queue/render cost allocation) to produce **per-customer, per-plan, per-workspace profitability**. This makes the Part 1 margin discipline measurable: **Plan Profitability** tells Billing Admin whether a plan's price covers its AI economics; the per-video cap (Part 1) remains the governor-enforced floor (ADR-064). Feeds the Billing Simulator (§15.8) and Cost Simulator (Part 2 §11.2). See Deliverable **13.16**.

### 15.3 Enterprise Procurement
*Deepens Enterprise Commercials (§11) with a full procurement model.*

Supports: **Purchase Orders · Vendor Registration · Procurement Approval · Multiple Billing Contacts · Multiple Shipping Contacts · Cost Centers · Department Billing · Annual Contracts · Enterprise Procurement Workflow.** Architecture: procurement runs as an **audited Part-5 workflow** (quote → vendor registration → PO → approval chain → contract → provision); **cost centers + department billing** map spend to org departments (Part 7 org tier, ADR-026) so an enterprise can split invoices; **multiple billing/shipping contacts** are org-scoped roles (Part 7 identity). Net-terms/offline invoicing (§6) underpins it. See Deliverable **13.17**.

### 15.4 Reseller & Partner Program
*New commercial plane, isolated from tenants (ADR-066).*

Supports: **Resellers · Channel Partners · Referral Partners · Commission · Revenue Share · White-Label Partners · Regional Partners.** Architecture: a **Partner plane** — a distinct identity/commercial space **isolated from the Tenant plane** (Part 7 ADR-050 pattern; a partner is neither a platform operator nor a tenant). Partners manage a book of tenant accounts, earn **commission / revenue-share** (computed from those tenants' billing), and white-label partners resell under their own brand (P6.1 branding + reseller pricing §11). **Isolation invariant:** a partner sees only its own accounts' commercial aggregates, never another partner's or tenant content. See Deliverable **13.18**.

### 15.5 Marketplace Commerce
*Future-ready monetization of the asset/workflow marketplaces (Part 5 §17.2, Part 6 §16.11) via entitlement-based delivery (ADR-067).*

Future architecture for buying: **AI Credits · Premium Templates · Workflow Templates · Prompt Packs · Style Packs · Voice Packs · Automation Packs.** Architecture: purchases are **entitlement-based delivery** — buying an item grants an entitlement (§3) that unlocks it via **copy-on-use** (ADR-006/028) into the tenant's Asset Library (Part 6 §16.11); credit purchases top up the ledger (§4). Revenue-share flows to creators/partners (§15.4). Reuses the payment (§7), tax (§8), and entitlement (§3) engines — no new commercial primitives. See Deliverable **13.19**.

### 15.6 Commercial Policy Engine
*Centralizes the scattered commercial rules (pricing/discount/tax/credit/refund/renewal/grace/overage) into one configurable engine (ADR-068) — the commercial analogue of Part 7's Security Policy Engine.*

Configure: **Pricing Rules · Discounts · Promotions · Taxes · Credits · Refund Rules · Renewal Policies · Grace Policies · Overage Policies.** Architecture: a single **versioned, audited** policy engine evaluated at every commercial decision point (checkout, invoice generation, renewal, overage, refund); **everything config-driven** (Part 1) — a pricing/refund/grace change is configuration, not code, and is version-history + audited (Part 7 §10). Inheritance: platform default → plan/segment/region override. Unifies §2 (plans), §6 (billing terms), §8 (tax), §9 (promotions/plan-changes) rule-sets under one contract. See Deliverable **13.20**.

### 15.7 Customer Success Analytics
*Business intelligence beyond billing; complements Revenue Analytics (§10) and Business Insights (Part 3 §19.10).*

Displays (explainable): **Health Score · Expansion Opportunity · Upgrade Prediction · Churn Prediction · AI Adoption Score · Automation Adoption · Workspace Growth · Team Growth.** Architecture: joins usage (§5), engagement, and commercial signals into per-account **health + growth** scores with **explainable recommendations** (why a churn risk, what expansion play) — propose-only (Part 3 ADR-014). Feeds Super-Admin CS motion and the tenant's own dashboard where appropriate; drives proactive retention/expansion. See Deliverable **13.21**.

### 15.8 Billing Simulator
*New what-if tool for Super Admin; complements the Cost Simulator (Part 2 §11.2) and Profitability Engine (§15.2).*

Simulate before publishing: **New Plans · New Prices · Credit Changes · Provider Cost Changes · AI Cost Changes · Currency Changes** — and **show business impact** (projected MRR/ARR, margin, churn risk, per-plan profitability) **before** committing. Architecture: runs against historical usage/revenue/cost data in a sandbox (Part 5 §17.10 pattern — no production side effects), leveraging the Profitability Engine (§15.2). This de-risks pricing decisions (a plan/price change previews its revenue **and** margin effect before it touches a customer). See Deliverable **13.22**.

### 15.9 Financial Audit Center
*Specializes the immutable audit (Part 7 §10) for finance (ADR-069).*

Tracks (immutable): **Invoice Changes · Refund History · Credit History · Payment Failures · Revenue Corrections · Tax Events · Manual Adjustments.** Architecture: a finance-scoped view of the hash-chained audit (Part 7 ADR-052) with **every financial mutation** recorded (who/what/before-after/reason/approval); **manual adjustments and revenue corrections require reason + approval** (SoD, §12) and are alarmed. This is the evidence base for financial controls (SOC2/audit, Part 7 §11) and dispute resolution. See Deliverable **13.23**.

### 15.10 Commercial Observability
*The commercial analogue of Part 5 §17.11 / Part 7 §14.8 — operational health of the money machine.*

Dashboards for: **Billing Engine Health · Payment Success Rate · Credit Usage Trends · Failed Payments · Invoice Generation · Tax Processing · Provider Health · Revenue Health.** Architecture: rollup-backed (ADR-007) operational metrics over the billing/payment/credit/tax subsystems; alerts on anomalies (payment-success dip, invoice-generation failures, tax-processing errors, dunning spikes) → notifications (Part 3 §11) + incidents (Part 7 §14.6). Ensures the commercial layer is as observable/reliable as the automation engine. See Deliverable **13.24**.

### 15.11 Deliverable reconciliations (Revision 1)

- **Subscription Engine (§2)** — plan/price rules now live in the **Commercial Policy Engine** (§15.6); changes previewable via the **Billing Simulator** (§15.8).
- **Billing Engine (§6)** — governed by the Commercial Policy Engine (renewal/grace/overage/refund policies, §15.6); health surfaced by **Commercial Observability** (§15.10); mutations recorded in the **Financial Audit Center** (§15.9).
- **Credit Engine (§4)** — credit rules/expiry/refund policy centralized in §15.6; credit purchases extend to **Marketplace Commerce** (§15.5); usage/cost surfaced in **AI Cost Intelligence** (§15.1).
- **Revenue Analytics (§10)** — extended to **Profitability** (§15.2, revenue→profit), **Customer Success Analytics** (§15.7, health/growth), and **Commercial Observability** (§15.10, ops health).
- **Enterprise Commercials (§11)** — deepened by **Enterprise Procurement** (§15.3) and the isolated **Reseller & Partner Program** (§15.4).
- **Cost Governor (Part 5)** — now closed-loop: **AI Cost Intelligence** (§15.1) feeds it optimization data; **Profitability** (§15.2) proves the margin floor.

### 15.12 Missing-feature report (Revision 1)
All 10 items are net-new commercial-intelligence capabilities vs the prototype, tracked as **ISS-P8-R1-01…10** (§14.4 update). No existing Part-8 functionality removed.

### 15.13 ADR updates (Revision 1)
- **ADR-065** — **Profit, not just revenue**: the platform models the full cost stack (AI/provider/infra/storage/queue/render) against revenue for per-customer/per-plan/per-workspace **profitability**; plan pricing is validated against its AI economics (the Part 1 cap is the margin floor, ADR-064).
- **ADR-066** — **Partner plane isolated from the Tenant plane**: resellers/channel/referral/white-label partners are a distinct identity+commercial space (ADR-050 pattern); commission/revenue-share computed from their accounts; a partner never sees another partner's or a tenant's content.
- **ADR-067** — **Marketplace commerce = entitlement-based delivery**: buying credits/templates/prompt-packs/style-packs/voice-packs/automation-packs grants entitlements that unlock via copy-on-use; revenue-share to creators/partners; reuses payment/tax/entitlement engines.
- **ADR-068** — **Central, versioned Commercial Policy Engine**: pricing/discount/promo/tax/credit/refund/renewal/grace/overage rules are configurable, versioned, audited, and evaluated at every commercial decision (commercial analogue of ADR-056).
- **ADR-069** — **Financial Audit Center**: all financial mutations (invoice/refund/credit/payment-failure/revenue-correction/tax/manual-adjustment) are immutable + hash-chained (ADR-052); manual adjustments/corrections require reason + approval (SoD) and are alarmed.

---

**End of Part 8 — Revision 1 · Status: APPROVED & LOCKED · Version: Revision 1.** Future changes only via an explicit **Revision 2** upgrade. Permanent Source of Truth for Subscription, Billing, Credits & Commercial; conflicts resolve to Part 1 → Part 2 → Part 3 → Part 4 → Part 5 → Part 6 → Part 7. Awaiting the next Bible part.
