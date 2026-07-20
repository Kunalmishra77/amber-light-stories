# Part 11 — Enterprise Platform, White Label, Agency & Ecosystem Architecture

**Status: Draft (Awaiting Review)**
**Version: 1.0**
**Date: 2026-07-20**

**Precedence:** Part 1 (`PRODUCT-VISION.md`) overrides everything · Part 2 (Platform/Super Admin, Rev 1 Locked) overrides implementation · Parts 3–10 (all Rev 1 Locked). This document is the permanent Source of Truth for the **Enterprise expansion & ecosystem layer** once approved.

**Relationship to prior parts (no duplication):** the ecosystem is seeded across the Bible — Part 4 ADR-026 (org tier), Part 6 §16.11 / ADR-049 (Asset Library), Part 5 §17.2 / Part 8 §15.5 / ADR-067 (marketplace = entitlement-based delivery), Part 8 §15.4 / ADR-066 (partner plane), Part 9 §14.5 (Integration Hub) + §14.4 (API Gateway) + §14.8 (Service Discovery), P6.1 (branding engine), Part 7 (identity/SSO/policy). **Part 11 consolidates and completes these into the enterprise/ecosystem layer** — white-label, agencies, enterprise orgs, marketplace, partners, developer platform, plugins, integrations, enterprise analytics/governance, and future-readiness. It **composes existing primitives** (entitlements, adapters, copy-on-use, policy engines, isolation) rather than inventing new ones — the whole point is **zero redesign to reach ecosystem scale**.

**Scaling thesis:** Single Client → Multiple Clients → Agencies → Large Enterprises → Resellers → Partners → Marketplace → complete AI Platform Ecosystem — each stage is **additive configuration over the same platform**, never a rebuild (ADR-088).

---

## 0. Reading guide
Sections 1–11 map to the requested capabilities. Section 12 holds the **required deliverables**. Section 13 is governance (missing-feature + improvement reports, ADR + backlog updates). Deliverable tables win over narrative on conflict.

---

## 1. White Label Architecture

Complete white-label deployment so a partner/agency/enterprise runs the platform under **their own brand** (extends P6.1 branding engine, ADR-088).

**Brandable surfaces (all tenant/partner-isolated):** Custom Domain · Branding · Logo · Colors · Fonts · Login Screen · Emails · Notification Branding · Reports · PDFs · AI Assistant Branding · Help Center Branding.

**Architecture:**
- **Brand resolution** — the active brand is resolved at runtime from the **request context** (custom domain → tenant/partner → brand profile), driving the CSS-var theme engine (P6.1), email templates (P6.6), report/PDF headers, and assistant persona. **Never hardcoded** (Part 1).
- **Custom Domain** — a partner maps their domain; TLS + routing resolve it to their branded workspace/portal; the platform's own brand ("YT-Automation") is never shown to their end-clients.
- **Isolation invariant** — one white-label brand **never** leaks into another (Part 5 §12); branding is a per-tenant/per-partner config asset (versioned, ADR-049).
- **Entitlement-gated** — white-label is a plan/partner entitlement (ADR-004/061); free/standard tiers get platform brand.
- **Reseller layering** — a reseller's brand can be the default for all **their** sub-clients (partner plane, ADR-066), while each sub-client may still brand their own workspace. See Deliverable **12.1**.

---

## 2. Agency Architecture

Support agencies that **manage many clients** from one place (a first-class role in the org/partner model).

**Capabilities:** Agency Dashboard · Agency Billing · Agency Users · Client Switching · Client Analytics · Cross-client Reporting · Agency Templates.

**Architecture:**
- An **Agency** is an org-tier account (Part 4 ADR-026) that **owns/manages multiple client tenants** — either as a **partner** (resells, ADR-066) or as a **managing org** (operates on behalf of clients).
- **Client Switching** — agency users switch between managed clients via **scoped, audited context switching** (like impersonation but consented/contracted, ADR-089) — never seeing clients they don't manage.
- **Agency Billing** — consolidated billing across managed clients (Part 8 §11 enterprise commercials, §15.3 procurement, cost centers) — the agency pays, or bills through to clients.
- **Cross-client Analytics/Reporting** — aggregate across managed clients (respecting isolation — only clients the agency manages, only permitted metrics).
- **Agency Templates** — shared workflow/prompt/style/brand templates the agency pushes to its clients via **copy-on-use** (ADR-006/049).
- Solo creators and single-client owners are the **degenerate case** — no redesign to become an agency. See Deliverable **12.2**.

---

## 3. Enterprise Organization Model

Support large enterprises (completes Part 4 ADR-026 / Part 7 §5).

**Capabilities:** Multiple Departments · Multiple Teams · Multiple Workspaces · Approval Hierarchies · Cost Centers · Department Billing · Business Units.

**Architecture:**
```
Organization
 ├─ Business Unit
 │   ├─ Department (cost center)
 │   │   ├─ Team
 │   │   │   └─ Workspace(s)
 │   │   └─ Approval Hierarchy (Part 10 §13.4 chains)
 │   └─ Department Billing (Part 8 §15.3)
 └─ Org Policies (inherit downward, §10)
```
- **Hierarchy with inheritance** — policies, entitlements, branding, and settings inherit **org → BU → department → team → workspace** (tighten-only, ADR-056/068).
- **Cost Centers + Department Billing** — spend attributed to departments/BUs (Part 8 §15.3); consolidated enterprise invoice with breakdown.
- **Approval Hierarchies** — enterprise approval chains (Part 10 §13.4, ADR-084) per department/BU.
- **Business Units** — top-level partitions for large orgs (e.g., regions/brands), each with its own workspaces, policies, and billing rollup. See Deliverable **12.3**.

---

## 4. Marketplace

A marketplace for reusable assets (completes Part 5 §17.2 / Part 8 §15.5 / ADR-067).

**Sellable assets:** Workflow Templates · Prompt Packs · Style Packs · Characters · Voice Packs · Thumbnail Packs · Automation Templates · AI Configurations.

**Architecture:**
- **Everything versioned · copy-on-use · entitlement-controlled** (ADR-049/006/067) — buying/installing grants an entitlement that copies the asset into the tenant's Asset Library (isolated deep-copy); updates are new versions the buyer can adopt.
- **Listings** — publisher (platform/partner/creator), price (or free), version, compatibility (engine/pipeline version, ADR-035), ratings, docs.
- **Revenue share** — sales flow through billing (Part 8 §7) with **revenue-share** to the creator/partner (ADR-066/067).
- **Governance** — submitted assets pass **review/approval + compliance/safety scan** (Part 6 §16.7) before listing; malicious/low-quality assets are rejected.
- **Discovery** — searchable (Part 9 §8), categorized, with previews/simulation (Part 5 §17.10). See Deliverable **12.4**.

---

## 5. Partner Ecosystem

Support the partner types that grow the platform (extends the partner plane, ADR-066).

**Partner types:** Technology Partners · AI Providers · Agencies · Resellers · Integrators · Consultants.

**Architecture:**
- **Partner plane** (isolated from tenants, ADR-066) with **partner-type-specific capabilities**:
  - **AI Providers** — register adapters into the provider registry (ADR-003) → their models become selectable (governed, rev-share on usage).
  - **Technology Partners / Integrators** — build integrations/plugins (§7, §8).
  - **Agencies / Resellers** — manage/resell client accounts (§2, ADR-066) with commission/revenue-share.
  - **Consultants** — scoped, audited access to client accounts they're engaged with (contracted, ADR-089).
- **Partner portal** — partners manage their listings/integrations/accounts/commissions (partner-scoped, never cross-partner).
- **Certification** — partners/assets can be **certified** (a trust tier surfaced in the marketplace). See Deliverable **12.5**.

---

## 6. Public Developer Platform

Open the platform to external developers (realizes Part 2 §2.5 + Part 9 §14.4 API Gateway).

**Capabilities:** Public APIs · SDKs · CLI · OAuth Apps · Webhooks · API Keys · Developer Portal · API Documentation · Sandbox.

**Architecture:**
- **Public API** — the versioned REST/GraphQL surface (Part 9 §5-6) exposed through the **API Gateway** (ADR-078) with authN/authZ, rate limits, and scoped keys (Part 7 §7).
- **OAuth Apps** — third-party apps request scoped, user-consented access (Part 7); scopes ≤ granting user's permissions.
- **Developer Portal** — self-serve app registration, key management, docs, changelog, deprecation notices (Part 9 §6), usage analytics.
- **Sandbox** — a safe environment (mock adapters, test data, ADR-019 / Part 9 Digital Twin) where developers build without touching production or incurring cost.
- **SDKs / CLI** — generated from the versioned API contract; webhooks (signed, Part 7 §7) for event subscriptions (Part 9 §4). See Deliverable **12.6**.

---

## 7. Plugin Architecture

Installable plugins that extend the platform safely (ADR-090).

**Capabilities:** Plugin Registry · Versioning · Isolation · Permissions · Approval · Updates · Rollback.

**Architecture:**
- **Registry** — plugins are versioned, discoverable packages (marketplace-listed, §4) with declared **permissions** (what data/events/APIs they access).
- **Isolation & least privilege** — a plugin runs **sandboxed** with only its **granted, scoped permissions** (Part 7 deny-by-default); it **cannot breach tenant isolation** (Part 5 §12) or exceed the installing user's rights.
- **Approval + compliance** — plugins pass review/security scan before listing (like marketplace assets, §4); tenants approve permissions at install.
- **Updates + Rollback** — versioned (ADR-036); update installs a new version, rollback restores; compatibility checked against the platform version.
- **Extension points** — plugins attach at defined hooks (pipeline stages, events Part 9 §4, UI slots, integrations §8) — never arbitrary code paths. See Deliverable **12.7**.

---

## 8. Integration Marketplace

Provider-independent integrations (formalizes Part 9 §14.5 Integration Hub as a marketplace).

**Integration categories:** CRM · CMS · Storage · Analytics · Marketing · Communication · AI Providers · Future Providers.

**Architecture:**
- **Connector framework** (Part 9 §14.5) — every integration is a **connector adapter** (inbound/outbound) behind a stable interface; **provider-independent** (like AI/publishing/payment/storage adapters, ADR-003/073).
- **Marketplace-listed** — integrations are installable (copy-on-use, entitlement-gated, ADR-067) with OAuth/credential management in the Vault (Part 7 §8).
- **Event-connected** — integrations bridge the internal event bus (Part 9 §4) to external systems (e.g., publish success → post to Slack, new client → create CRM record).
- **Future providers drop in** — a new CRM/storage/AI provider is a new connector, **no core change**. See Deliverable **12.8**.

---

## 9. Enterprise Analytics

Cross-cutting analytics for enterprises (extends Part 8 revenue/CS analytics + Part 3/6 analytics).

**Dimensions:** Cross-workspace · Cross-department · Cross-region · Cross-brand · Executive Dashboards · Forecasting · Business Intelligence.

**Architecture:**
- **Roll-up hierarchy** — analytics aggregate along the org hierarchy (§3): workspace → team → department → BU → org, and along region/brand.
- **Executive Dashboards** — org-level KPIs (output, cost, margin/profitability Part 8 §15.2, growth, health) for enterprise leadership.
- **Forecasting + BI** — capacity/cost/growth forecasting (Part 2 §11.9, Part 8) at enterprise scale; exportable BI datasets (respecting governance §10).
- **Isolation preserved** — cross-cutting analytics only span what the viewer's org/role permits; never cross orgs. Rollup-backed (ADR-074) for scale. See Deliverable **12.9**.

---

## 10. Enterprise Governance

Unified governance for enterprises (composes the policy engines across the Bible).

**Policy types:** Organization Policies · Compliance Policies · Approval Policies · AI Policies · Security Policies · Retention Policies — all **versioned · audited · inherited** (ADR-091).

**Architecture:**
- **One governance model** over the existing policy engines: Security Policy Engine (Part 7 §14.2), Commercial Policy Engine (Part 8 §15.6), Approval Policy Engine (Part 10 §13.2), plus **AI Policies** (allowed models/providers/cost caps/content rules) and **Retention Policies** (data lifecycle, Part 9 §11).
- **Inheritance** — policies set at org level **inherit downward** (BU → dept → team → workspace), **tighten-only** (a workspace can be stricter, never looser than org/platform minimums).
- **Versioned + audited** — every policy is versioned with history; changes audited (Part 7 §10, immutable ADR-052).
- **Compliance dashboards** — org-wide policy compliance status (Part 7 §14.8). See Deliverable **12.10**.

---

## 11. Future Enterprise Readiness

Ensure **no redesign** is required for: Multi-region · Multi-cloud · Government · Healthcare · Finance · Education · Large Enterprise (ADR-092).

**Architecture (why no redesign is needed):**
- **Multi-region** — data residency config (Part 7 §14.9) + region-routed storage/processing (Part 9 §14.7); the org hierarchy already supports regional BUs (§3).
- **Multi-cloud** — provider-abstracted storage/compute/AI (adapters, ADR-003/073) + Service Discovery (Part 9 §14.8) make the cloud a deployment detail.
- **Regulated verticals (Gov/Healthcare/Finance)** — Zero Trust (Part 7 §14.1), KMS/BYOK (Part 7 §14.5), immutable audit (ADR-052), data classification + DLP (Part 7 §14.3-4), compliance framework (Part 7 §11) + SOC2/ISO readiness provide the control base; stricter policies apply via governance (§10).
- **Education / Large Enterprise** — org hierarchy + SSO/SCIM (Part 7 ADR-053) + seat entitlements + enterprise commercials (Part 8 §11) scale to large user bases.
- **The invariant:** every one of these is **configuration + policy + adapter**, never an architectural rebuild. See Deliverable **12.11**.

---

## 12. Required Deliverables

### 12.1 White Label Architecture
Runtime brand resolution (domain→tenant/partner→brand) over the theme/email/report/assistant surfaces; tenant/partner-isolated, versioned, entitlement-gated; reseller brand layering.

### 12.2 Agency Architecture
Agency = org/partner managing many clients; scoped audited client-switching (ADR-089); consolidated agency billing; cross-client analytics (permission-bounded); agency templates via copy-on-use.

### 12.3 Enterprise Organization Model / Hierarchy
Org → BU → Department(cost center) → Team → Workspace with downward tighten-only inheritance; approval hierarchies; department billing; business units. (Diagram in §3.)

### 12.4 Marketplace Architecture
Versioned, copy-on-use, entitlement-controlled assets; listings + compatibility + ratings + docs; review/compliance gating; revenue share; discovery/preview. (Deliverable = §4.)

### 12.5 Ecosystem / Partner Model
Partner plane (isolated) with type-specific capabilities (AI providers register adapters; agencies/resellers manage/resell; integrators/consultants build/access); partner portal; certification. (Deliverable = §5.)

### 12.6 Public Developer Platform
Versioned public API via Gateway; OAuth apps (scoped/consented); developer portal (registration/keys/docs/analytics); sandbox; SDKs/CLI/webhooks. (Deliverable = §6.)

### 12.7 Plugin Architecture
Registry + versioning + sandboxed isolation + declared scoped permissions + approval/compliance + updates/rollback + defined extension points. (Deliverable = §7.)

### 12.8 Integration Architecture
Provider-independent connector framework (CRM/CMS/storage/analytics/marketing/comms/AI/future); marketplace-listed, OAuth/Vault-managed, event-connected. (Deliverable = §8.)

### 12.9 Enterprise Analytics
Cross-workspace/department/region/brand rollups; executive dashboards; forecasting/BI; isolation-preserving. (Deliverable = §9.)

### 12.10 Enterprise Governance
Unified versioned/audited/inherited policies (org/compliance/approval/AI/security/retention) over existing policy engines; tighten-only inheritance; compliance dashboards. (Deliverable = §10.)

### 12.11 Future Expansion / Enterprise-Readiness Model
Multi-region/multi-cloud/regulated-verticals/large-enterprise all reachable via config+policy+adapter, no redesign (ADR-092). (Deliverable = §11.)

### 12.12 Navigation / Permissions / Lifecycle
- **Navigation** — new top-level surfaces: **Agency Console** (agency users), **Org Admin** (enterprise org/dept/policy/billing), **Marketplace**, **Developer Portal**, **Partner Portal**, **Integrations** — each entitlement-gated and role-scoped; client workspace nav (Part 3) unchanged for non-enterprise users.
- **Permissions** — new roles/scopes: Agency Admin/User, Org Admin, BU/Department Admin, Partner (per type), Developer, Marketplace Publisher — all within the identity planes (Part 7 ADR-050; partners = partner plane ADR-066); disjoint from platform operators.
- **Lifecycle** — Partner: apply→verify→approve→active→(certified)→suspended/offboarded; Marketplace listing: draft→review→published→versioned→deprecated; Plugin: submitted→approved→installed→updated→rolled-back→removed; Agency-client link: invited→linked→managed→unlinked. All audited.

### 12.13 Missing-Feature Report → §13.1
### 12.14 Improvement Report → §13.2
### 12.15 ADR Updates → §13.3
### 12.16 Migration Backlog Updates → §13.4

---

## 13. Governance

### 13.1 Missing Feature Report (found while designing Part 11)
1. **White-label deployment** (custom domain + full brand resolution across all surfaces) — P6.1 branding exists but not domain/full white-label (ISS-P11-01).
2. **Agency console** (multi-client management, scoped switching, consolidated billing, cross-client reporting, agency templates) (ISS-P11-02).
3. **Full enterprise org hierarchy** (BU→dept→team→workspace, cost centers, department billing, business units) — extends Part 4/7 org tier (ISS-P11-03).
4. **Marketplace** (listings, versioned copy-on-use assets, review/compliance gating, revenue share, discovery) — extends ISS-P8-R1-05/P5-R1-02 (ISS-P11-04).
5. **Partner ecosystem + portal** (technology/AI-provider/agency/reseller/integrator/consultant; certification) — extends ISS-P8-R1-04 (ISS-P11-05).
6. **Public Developer Platform** (public API + OAuth apps + developer portal + sandbox + SDKs/CLI) — extends ISS-P2-12/P9-R1-04 (ISS-P11-06).
7. **Plugin architecture** (registry/isolation/permissions/approval/updates/rollback) (ISS-P11-07).
8. **Integration marketplace** (provider-independent connectors, event-connected) — extends ISS-P9-R1-05 (ISS-P11-08).
9. **Enterprise analytics** (cross-workspace/dept/region/brand, executive dashboards, BI) (ISS-P11-09).
10. **Enterprise governance** (unified versioned/audited/inherited org/compliance/approval/AI/security/retention policies) (ISS-P11-10).
11. **Enterprise-readiness posture** (multi-region/multi-cloud/regulated-vertical config paths) (ISS-P11-11).
12. **Scoped consented account access** (agency/consultant client access distinct from operator impersonation) (ISS-P11-12).

**Already tracked (referenced):** org tier (ISS-P7-04/ADR-026), partner plane (ISS-P8-R1-04/ADR-066), marketplace commerce (ISS-P8-R1-05/ADR-067), Asset Library (ISS-P6-R1-11/ADR-049), Integration Hub (ISS-P9-R1-05), API Gateway (ISS-P9-R1-04), branding engine (P6.1), white-label entitlement (Part 2 §11 / Part 8), SSO/SCIM (ISS-P7-02), policy engines (ADR-056/068/083), data residency/compliance (ISS-P7-10/R1-09), digital twin/sandbox (ISS-P9-R1-10).

### 13.2 Improvement Report (automatic improvements)
1. **Ecosystem = composition, not new primitives** — white-label (branding+config), agency (org+partner+switching), marketplace (assets+entitlements+copy-on-use), plugins (permissions+sandbox+registry), integrations (connectors) all **reuse existing primitives** → the platform reaches ecosystem scale with **no architectural rebuild** (ADR-088).
2. **Two isolation planes + partner plane cover every actor** — platform operators, tenants, and partners (agencies/resellers/AI-providers) are cleanly separated; agencies/consultants reach clients via **scoped consented access**, never operator impersonation (ADR-089).
3. **Copy-on-use everywhere** — marketplace/agency-template/plugin distribution all use versioned copy-on-use, so reuse never breaks isolation.
4. **One governance model** — org/compliance/approval/AI/security/retention policies unify under versioned+audited+inherited engines; enterprise control is configuration.
5. **Provider-independence is the moat** — AI, publishing, storage, payment, integration, and cloud are all adapters → multi-cloud/multi-region/new-providers are config.
6. **Marketplace + partners create a flywheel** — creators/partners extend the platform (workflows, styles, plugins, integrations, models); revenue-share aligns incentives; certification builds trust.
7. **Sandbox/twin de-risks the ecosystem** — developers, plugins, and integrations are built/tested against the sandbox/digital-twin, never production.

### 13.3 ADR updates (added to `product-bible/ADR.md`)
- **ADR-088** — **Ecosystem scale is additive composition, not redesign**: white-label, agency, enterprise-org, marketplace, partners, developer platform, plugins, and integrations are built by **composing existing primitives** (branding, entitlements, adapters, copy-on-use, policy engines, isolation planes); reaching each ecosystem stage requires **configuration, not architectural rebuild**.
- **ADR-089** — **Scoped, consented, audited account access for agencies/consultants**: managing-party access to a client account is **contract/consent-based, scoped, time-bounded, and audited** — distinct from platform-operator impersonation (ADR-002); a managing party sees only the clients it manages and only permitted data.
- **ADR-090** — **Plugins run sandboxed with declared, least-privilege permissions**: plugins declare the data/events/APIs they need, are approved + compliance-scanned, run isolated within their granted scope (cannot breach tenant isolation or exceed the installer's rights), and are versioned with update/rollback.
- **ADR-091** — **Unified enterprise governance: versioned, audited, inherited policies**: org/compliance/approval/AI/security/retention policies compose the existing policy engines under one model with **tighten-only downward inheritance** (org→BU→dept→team→workspace) and immutable audit.
- **ADR-092** — **Enterprise-readiness by configuration**: multi-region, multi-cloud, and regulated verticals (gov/healthcare/finance/education) are reachable via **residency config + provider adapters + stricter governance policies**, never a redesign.

### 13.4 Migration Backlog updates
Items **ISS-P11-01 … ISS-P11-12** added under new epic **M16 (Enterprise Platform & Ecosystem — white-label, agency, marketplace, partners, developer platform, plugins, integrations, enterprise governance)**, composing M8–M15; the **last-built layer** (ecosystem sits atop a complete platform). See `MIGRATION-BACKLOG.md`.

---

**End of Part 11 — Status: Draft (Awaiting Review) · Version 1.0.** Not locked. Permanent Source of Truth for the Enterprise & Ecosystem layer once approved; conflicts resolve to Part 1 → … → Part 10. Awaiting owner review → then the next Bible part (or the Future Roadmap / Bible-complete declaration → Architecture Freeze).
