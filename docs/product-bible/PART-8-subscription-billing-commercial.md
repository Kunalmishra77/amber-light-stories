# Part 8 — Complete Subscription, Billing, Credits & Commercial Architecture

**Status: Draft (Awaiting Review)**
**Version: 1.0**
**Date: 2026-07-20**

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

**End of Part 8 — Status: Draft (Awaiting Review) · Version 1.0.** Not locked. Permanent Source of Truth for Subscription, Billing, Credits & Commercial once approved; conflicts resolve to Part 1 → Part 2 → Part 3 → Part 4 → Part 5 → Part 6 → Part 7. Awaiting owner review → then the next Bible part.
