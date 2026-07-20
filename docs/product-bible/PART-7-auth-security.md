# Part 7 — Complete Authentication, Authorization & Enterprise Security Architecture

**Status: Draft (Awaiting Review)**
**Version: 1.0**
**Date: 2026-07-20**

**Precedence:** Part 1 (`PRODUCT-VISION.md`) overrides everything · Part 2 (Platform/Super Admin, Rev 1 Locked) overrides implementation · Parts 3–6 (Client Experience, Onboarding, Automation Engine, AI Pipeline — all Rev 1 Locked). This document is the permanent Source of Truth for **Authentication, Authorization & Enterprise Security** once approved.

**Relationship to prior parts (no duplication):** security threads through the whole Bible — Part 2 defined platform roles + the Security Center direction + impersonation (ADR-002); Part 3 defined the workspace permission matrix (§15.7); Part 4 defined onboarding auth (forced password change, email verification, audit trail, org-readiness ADR-026); Part 5 defined tenant isolation + the Vault reference (ADR-010); Part 6 defined tenant-isolated Memory/Knowledge. **Part 7 consolidates all of this into one authoritative identity/authN/authZ/secrets/audit/compliance model** and fills the enterprise gaps. Where a prior part defined a surface, Part 7 **unifies and deepens** it; it does not re-specify UIs or restate prior matrices verbatim.

---

## 0. Reading guide
Sections 1–11 are the design. Section 12 holds the **15 required deliverables**. Section 13 is governance (security-improvement + missing-feature reports, ADR + backlog updates). Deliverable tables win over narrative on conflict.

---

## 1. Security principles (the security contract)

Enterprise-grade **from Day 1**, scaling from a solo creator to multi-org enterprises and white-label — **without redesign**. Non-negotiables:
1. **Least privilege** — every identity gets the minimum permissions needed; deny by default.
2. **Isolation always** — tenant/workspace/org boundaries are hard (Part 5 §12); no cross-tenant access, ever.
3. **Separation of duties** — platform roles ≠ tenant roles (disjoint permission spaces, Part 2); no single role does everything.
4. **Zero standing access to tenant data** — platform operators reach a workspace only via **time-boxed, audited impersonation** (ADR-002).
5. **Secrets never in code/UI** — all credentials live in the Vault, encrypted, write-only from the client's view (ADR-010).
6. **Everything auditable & immutable** — every security-relevant action is logged to an append-only trail.
7. **Defense in depth** — authN + authZ + session + API + secret + monitoring layers, each independently enforced server-side.
8. **Configurable, not hardcoded** — roles, permissions, policies come from config (Part 1).

---

## 2. Complete Identity Model

Two **disjoint identity planes** (Part 2 invariant) plus cross-cutting non-human identities. An identity holds roles in **exactly one plane** for a given context; platform operators hold **no tenant membership** (ADR-002).

### 2.1 Platform plane (operates YT-Automation)
| Identity | Responsibility | Boundary |
|---|---|---|
| **Platform Owner** | ultimate authority; owns the platform | can do anything platform-side; still audited |
| **Super Admin** | full platform operations | all platform modules; no tenant membership |
| **Platform Admin** | day-to-day platform ops | scoped platform admin; no billing/security override unless granted |
| **Support Admin** | client support | read + time-boxed impersonation; no billing/security config |
| **Billing Admin** | plans, invoices, dunning, tax | billing/commercial only; no content/security config |
| **Security Admin** | security posture, policies, secrets governance, audit | security/audit/secret-policy; no billing |

### 2.2 Tenant plane (a client's workspace/org)
| Identity | Responsibility | Boundary |
|---|---|---|
| **Client Owner** | owns the tenant/org; billing + everything in-tenant | full tenant scope; never sees platform |
| **Workspace Admin** | manage a workspace (settings/team/API) | one workspace; no billing unless owner |
| **Content Manager** | plan + run production | content/pipeline; no settings/billing |
| **Reviewer** | approve/reject at gates | review only |
| **Editor** | edit content/scripts/assets | content edit; no publish/approve |
| **Analyst** | read analytics/insights | read-only analytics |
| **Viewer** | read-only | view only |

### 2.3 Non-human & cross-cutting identities
| Identity | Responsibility | Boundary |
|---|---|---|
| **API User** | a human/app authenticating via API key/OAuth | scoped to granted API permissions (§7) |
| **Service Account** | machine identity for automations/integrations | least-privilege, scoped token, rotated, no interactive login |
| **Future Custom Roles** | tenant- or platform-defined roles = any permission subset | bounded to their plane; never cross planes |

**Rule:** custom roles are **subsets** within a plane; no role can bridge the platform/tenant boundary. See Deliverable **12.1**.

---

## 3. Authentication

Consolidates Part 4/P6.2 auth and adds enterprise flows.

| Capability | Behavior | Status |
|---|---|---|
| **Login / Logout** | credential auth; secure session issued/destroyed | core (exists) |
| **Forgot / Reset Password** | emailed, time-boxed, single-use reset token | core (exists, P6.2) |
| **Password Policies** | strength, history, rotation, breach-check | core (P6.2) |
| **Email Verification** | verify inbox ownership before/at activation | core (Part 4) |
| **MFA / 2FA** | TOTP (real, P6.6); enforceable per role/plan | core (exists), enforce = enhance |
| **Account Lockout** | N failures → temporary lock (P6.2) | core (exists) |
| **Passkeys (WebAuthn)** | passwordless, phishing-resistant | **future** |
| **Magic Links** | passwordless email login | **future** |
| **Social Login** | Google/etc. federated login | **future** |
| **Enterprise SSO** | SAML/OIDC per organization; SCIM provisioning | **future (enterprise)** |
| **Session Management** | see §5 | core + enhance |
| **Trusted Devices / Remember-Me** | remember a device; skip MFA on trusted device | enhance |
| **Device History** | list known devices + last-seen | enhance |
| **Login Notifications** | notify on new-device/location login | enhance |
| **Risk-Based Login** | step-up MFA on anomalous login (new geo/device/IP) | **future** |

**Enforcement:** MFA-required and SSO-required are **policy** (per role/plan/org), not code. Enterprise SSO + SCIM future-proofs multi-org without redesign (rides on ADR-026 org tier). See Deliverable **12.2**.

---

## 4. Authorization (enterprise RBAC + ABAC)

A configurable permission model spanning both planes. Permission = **(scope, resource, action)**; roles bundle permissions; policies can add attribute conditions.

**Permission dimensions:**
- **Platform Permissions** — platform modules (Part 2 D7 matrix).
- **Workspace Permissions** — workspace capabilities (Part 3 §15.7 matrix).
- **Feature Permissions** — gate a feature on/off (ties to entitlements, ADR-004).
- **Action Permissions** — verbs (create/edit/approve/publish/delete).
- **Resource Permissions** — a specific object (this workflow, this asset).
- **API Permissions** — scopes for API keys/OAuth (§7).

**Enterprise mechanics:**
- **Custom Roles** — any permission subset within a plane (ADR-050).
- **Permission Groups** — named bundles for easy assignment.
- **Temporary Permissions** — time-boxed grants that auto-expire (e.g., a contractor for 2 weeks).
- **Approval-based Permission Escalation** — request → approver grants → time-boxed elevated access, fully audited (privileged-access-management pattern, ADR-051). Super-admin impersonation is a special case (ADR-002).

**Enforcement:** every gated action is checked **server-side** (RLS + application authorization), deny-by-default; entitlements (plan limits) and permissions (role) are **both** enforced. See Deliverable **12.3/12.4**.

---

## 5. Organizations & Teams

Realizes the org tier (Part 4 ADR-026) as the enterprise structure.

**Hierarchy:** **Organization → (Departments/Teams) → Workspaces → Members.** An org can own **multiple workspaces**; roles/policies **inherit downward** (org default → workspace override).

**Capabilities:** Organizations · Multiple Workspaces · Teams · Departments · Team Invitations · User Invitations · Role Assignment · **Ownership Transfer** · Member Suspension · Member Removal · Activity Tracking.

**Behavior:**
- **Invitations** are tokenized, time-boxed, role-scoped, audited (extends Part 4 onboarding invites).
- **Ownership Transfer** is a high-privilege, MFA-gated, audited action (no orphaned tenants).
- **Suspension vs Removal** — suspend disables access but retains membership/audit; removal revokes access + sessions + tokens.
- **Approval chains** (Part 4 ADR-026) generalize review/publish gates for teams.
- Solo creators are the **degenerate case** (org = one workspace, one owner) — no redesign to scale up. See Deliverable **12.5**.

---

## 6. Session Management

Enterprise sessions (deepens P6.2/P6.6).

**Capabilities:** Multiple Devices · Session Expiry · Session Revocation · Concurrent Sessions · Active Sessions list · Device Fingerprinting · Suspicious-Activity Detection · Forced Logout · IP Monitoring · Location History.

**Behavior:**
- Sessions are **server-tracked** with device fingerprint, IP, geo, last-seen; the user (and admins) can view **Active Sessions** and **revoke** any (or **forced logout all**).
- **Concurrent-session policy** is configurable (limit devices per plan/role).
- **Suspicious activity** (impossible travel, new-device+new-geo, burst failures) → step-up MFA (§3 risk-based) + alert (§8).
- **Expiry + idle timeout** are policy; sensitive actions may require re-auth (recent-auth requirement). See Deliverable **12.6**.

---

## 7. API Security

Secures the public API + webhooks (Part 2 §2.5).

| Control | Behavior |
|---|---|
| **API Keys** | per-tenant, scoped, hashed-at-rest, shown once |
| **Secret Rotation** | rotate keys/tokens without downtime; overlap window |
| **OAuth** | OAuth for provider connections + third-party app access |
| **Webhooks** | signed payloads (HMAC), ret/try with backoff |
| **Signed Requests** | request signing for sensitive endpoints |
| **Rate Limiting** | per-key/tenant/plan limits (reuses ops rate-limiter) |
| **Request Validation** | schema + auth + entitlement validation per call |
| **Replay Protection** | nonce + timestamp window on signed requests |
| **IP Restrictions** | optional per-key IP allowlists (enterprise) |
| **Audit Logs** | every API call audited (actor/key/scope/result) |

**Rule:** API permissions are a **scoped subset** of the caller's role permissions (§4) — an API key can never exceed its owner's rights. See Deliverable **12.7**.

---

## 8. Vault & Secret Management

The single secure home for all secrets (formalizes ADR-010; closes ISS-C3).

**Stores:** AI Keys (OpenAI/Gemini/ElevenLabs/fal) · YouTube Credentials · Gmail Credentials · Future Provider Secrets · Tokens · Certificates.

**Capabilities:**
- **Encryption** — envelope encryption at rest (pgsodium/Vault); decrypted only in a trusted server context, never sent to the client.
- **Rotation** — scheduled + on-demand rotation with overlap; rotation status surfaced (Part 4 §20.5 API Health Center).
- **Versioning** — secret versions; rollback on bad rotation.
- **Access Policies** — which service/role/job may read which secret (least privilege); a job only accesses its own tenant's secrets (Part 5 §12).
- **Secret Health / Expiry** — validity, quota, expiry tracked; expiring secrets alert (§8 Security Center + notifications).
- **Usage Audit** — every secret **access** is logged (who/what/when/why).

**Tenant isolation:** secrets are strictly per-tenant; cross-tenant secret access is impossible by policy + storage layout. See Deliverable **12.8**.

---

## 9. Security Center

A unified security surface (realizes Part 2 §2.4 platform + Part 3 §13 workspace security views). **Platform-scoped** for admins, **tenant-scoped** for client owners.

**Displays:** Login Activity · Failed Logins · API Usage · Secret Health · Device History · Session History · Security Alerts · **Risk Score** · Recommendations.

**Behavior:** aggregates authN/session/API/secret/audit signals; computes a **security posture/risk score** (weighted: MFA coverage, secret health, anomalous logins, stale sessions, policy compliance) with **actionable recommendations** (enable 2FA, rotate an expiring key, revoke a stale session). Feeds the workspace Readiness security dimension (Part 4 §12). See Deliverable **12.9**.

---

## 10. Audit System

Everything security-relevant is auditable and **immutable** (append-only, tamper-evident).

**Tracked events:** Login · Logout · Password Changes · Role Changes · Permission Changes · Secret Access · API Usage · Workflow Changes · Automation Execution · Billing Actions · Admin Actions (incl. impersonation start/stop).

**Architecture:**
- **Immutable, append-only** store (no updates/deletes); tamper-evidence (hash-chaining, ADR-052).
- Every entry: actor (identity + plane), action, target, before/after where applicable, timestamp, IP/session, result, correlation ID.
- **Tenant-scoped visibility** — a client sees only its own audit; platform admins see platform audit + (audited) impersonation trails. Cross-tenant audit never leaks.
- **Retention + export** — configurable retention; export for compliance (§11).
- Unifies the audit streams referenced across Parts 2/4/5 into one model. See Deliverable **12.10**.

---

## 11. Compliance

Future-proofed for enterprise compliance (extends P6.6 GDPR export/delete).

**Targets:** GDPR · SOC 2 · ISO 27001 · Data Retention · Right to Delete · Consent Tracking · Export Requests.

**Architecture:**
- **Data governance** — data classification, residency-ready (region config), retention policies per data class, deletion workflows (soft → hard with retention window, P6.6).
- **Right to Delete / Export** — self-service (audited) data export + deletion request (P6.6), extended org-wide.
- **Consent Tracking** — consent/rights capture (Part 4) + AI-generated-disclosure readiness (Part 6 §16.7) recorded and auditable.
- **SOC 2 / ISO 27001 readiness** — the audit trail (§10), access controls (§4), secret management (§8), and monitoring (§9) provide the control evidence base; formal certification is an operational milestone, the **architecture supports the controls** now.
- **DPA / sub-processor tracking** — record provider sub-processors (the AI/publishing providers) for GDPR. See Deliverable **12.11**.

---

## 12. Required Deliverables

### 12.1 Identity Architecture
Two disjoint planes (platform §2.1 / tenant §2.2) + non-human identities (§2.3); an identity holds roles in one plane per context; operators have zero tenant membership (ADR-002); custom roles are in-plane subsets.

### 12.2 Authentication Architecture
The §3 capability set: core (login/logout/reset/policy/email-verify/MFA/lockout) + enhancements (trusted devices/device history/login notifications) + future (passkeys/magic-links/social/SSO+SCIM/risk-based). MFA/SSO enforced by policy per role/plan/org.

### 12.3 Authorization Architecture
Permission = (scope, resource, action); RBAC + optional ABAC conditions; custom roles, permission groups, temporary permissions, approval-based escalation; deny-by-default, server-side, entitlement + permission both enforced.

### 12.4 RBAC Matrix (consolidated)
Cross-plane summary (detailed matrices live in Part 2 D7 + Part 3 §15.7; this consolidates the model):

| Capability domain | Platform roles | Tenant roles | Notes |
|---|---|---|---|
| Platform ops (clients/flags/theme) | Super/Platform Admin | ⛔ | disjoint from tenant |
| Impersonation (audited) | Super/Support Admin | ⛔ | time-boxed (ADR-002) |
| Billing/plans | Billing Admin (platform) · Client Owner (tenant) | Owner | platform vs tenant billing separate |
| Security/secrets/audit | Security Admin | Owner/Workspace Admin (own tenant) | tenant sees only its own |
| Content plan/produce | ⛔ (via impersonation only) | Owner/WS-Admin/Content-Mgr/Editor | tenant-scoped |
| Approve / Publish | ⛔ | Owner/WS-Admin/Reviewer(approve)/Publisher(publish) | separation of duties |
| Analytics (read) | platform aggregate | Owner…Viewer (own) | tenant-isolated |
| API access | platform keys | tenant keys (scoped ≤ owner rights) | §7 |

Custom roles = any subset within a plane.

### 12.5 Organization & Team Architecture
Org → Departments/Teams → Workspaces → Members; downward inheritance; invitations, role assignment, ownership transfer (MFA-gated), suspension/removal (revokes sessions+tokens), activity tracking. Solo = degenerate case.

### 12.6 Session Architecture
Server-tracked sessions (device/IP/geo/last-seen); active-sessions list + revoke + forced-logout-all; concurrent-session policy; fingerprinting; suspicious-activity → step-up MFA + alert; expiry/idle/recent-auth policies.

### 12.7 API Security Architecture
Scoped hashed API keys (shown once) · rotation w/ overlap · OAuth · signed+replay-protected webhooks/requests · rate limiting · request/entitlement validation · IP allowlists · full audit; API scope ≤ owner permissions.

### 12.8 Vault Architecture
Envelope-encrypted per-tenant secret store; rotation/versioning/access-policies/health/expiry/usage-audit; decrypt only in trusted server context; cross-tenant access impossible.

### 12.9 Security Center
Platform + tenant scoped; login/failed-login/API/secret-health/device/session/alerts/risk-score/recommendations; posture scoring feeds Readiness (Part 4 §12).

### 12.10 Audit Architecture
Immutable append-only, hash-chained, tenant-scoped visibility, retention + export; unified event set (§10); correlation IDs across authN/authZ/API/secret/automation/billing/admin.

### 12.11 Compliance Architecture
GDPR/SOC2/ISO27001-ready via audit + access-control + secrets + monitoring evidence; data classification/residency/retention; right-to-delete/export; consent + AI-disclosure tracking; sub-processor/DPA register.

### 12.12 Security Improvement Report → §13.2
### 12.13 Missing Feature Report → §13.1
### 12.14 ADR Updates → §13.3
### 12.15 Migration Backlog Updates → §13.4

---

## 13. Governance

### 13.1 Missing Feature Report (found while designing Part 7)
1. **Unified identity model** across platform/tenant planes + non-human (service accounts/API users) — currently only is_super_admin + basic memberships (ISS-P7-01).
2. **MFA/SSO enforcement policy** (per role/plan/org) + **enterprise SSO (SAML/OIDC) + SCIM** — TOTP exists but isn't policy-enforced; SSO absent (ISS-P7-02).
3. **Custom roles + permission groups + temporary permissions + approval-based escalation (PAM)** — RBAC exists (68 rows) but not these enterprise mechanics (ISS-P7-03).
4. **Organization tier + teams/departments + ownership transfer** — only single-tenant memberships today (extends ADR-026) (ISS-P7-04).
5. **Enterprise session management** (active sessions, revoke, fingerprint, suspicious-activity, location history) — basic sessions only (ISS-P7-05).
6. **API security suite** (scoped keys, rotation, signed/replay-protected requests, IP allowlists, webhook signing) (ISS-P7-06).
7. **Full Vault lifecycle** (rotation/versioning/access-policies/health/expiry/usage-audit) — Vault exists (migration 006) but not the full lifecycle (extends ISS-C3/M2) (ISS-P7-07).
8. **Unified Security Center + risk score** (platform + tenant) — partial pieces exist (ISS-P7-08).
9. **Immutable, hash-chained audit** across all security events — audit helpers exist but not tamper-evidence/immutability (ISS-P7-09).
10. **Compliance framework** (SOC2/ISO evidence, data residency/classification/retention, consent + sub-processor register) — GDPR export/delete exists (P6.6) (ISS-P7-10).
11. **Risk-based / step-up authentication** (anomalous-login detection) (ISS-P7-11).
12. **Trusted devices + login notifications + device history** (ISS-P7-12).

**Already tracked (referenced):** rotate leaked creds + secret stores (ISS-C3/M2), private asset bucket (ISS-C2), platform/tenant separation (ISS-A1/M1), impersonation console (ISS-P2-01), Security Center (ISS-P2-09), compliance/data-governance center (ISS-P2-07), GDPR export/delete (P6.6), onboarding audit trail (ISS-P4-R1-10), tenant isolation (Part 5 §12).

### 13.2 Security Improvement Report (automatic improvements)
1. **Deny-by-default everywhere** — authZ, API, and RLS all fail closed; explicit grants only.
2. **Zero standing access to tenant data** — operators use time-boxed audited impersonation, never direct membership (ADR-002); privileged actions use approval-based escalation (ADR-051).
3. **Secrets are write-only from the client, decrypt-only server-side** — no secret ever returned to a browser; rotation + expiry monitored.
4. **Immutable, hash-chained audit** — tamper-evident logs are the backbone of SOC2/ISO and incident response.
5. **Policy-driven MFA/SSO/session limits** — security posture is config per plan/role/org, so enterprise tiers harden without code changes.
6. **Risk-based step-up auth** — friction only when risk is detected (impossible travel, new device+geo).
7. **API scope ≤ owner scope** — an API key can never exceed the granting identity's permissions; keys are hashed + shown once + rotatable.
8. **Separation of duties** — platform vs tenant planes disjoint; within tenant, approve ≠ publish ≠ edit; ownership transfer is MFA-gated.
9. **Compliance-by-architecture** — audit + access control + secret mgmt + monitoring provide the evidence base before formal certification.

### 13.3 ADR updates (added to `product-bible/ADR.md`)
- **ADR-050** — **Two disjoint identity planes + non-human identities**: platform vs tenant roles never overlap; service accounts/API users are least-privilege, scoped, rotated; custom roles are in-plane subsets.
- **ADR-051** — **Approval-based, time-boxed privileged escalation (PAM)**: elevated/temporary permissions require approval, auto-expire, and are fully audited; operator access to tenant data is impersonation-only (ADR-002).
- **ADR-052** — **Immutable, hash-chained audit**: all security-relevant events are append-only and tamper-evident, tenant-scoped in visibility, retained + exportable for compliance.
- **ADR-053** — **Policy-driven authentication hardening**: MFA/SSO/session/concurrency/risk-based step-up are configurable policy per role/plan/org (enterprise hardens without redesign); enterprise SSO = SAML/OIDC + SCIM on the org tier (ADR-026).
- **ADR-054** — **Full Vault lifecycle**: per-tenant envelope-encrypted secrets with rotation, versioning, access policies, health/expiry, and usage audit; decrypt only in trusted server context; cross-tenant access impossible.

### 13.4 Migration Backlog updates
Items **ISS-P7-01 … ISS-P7-12** added under new epic **M13 (Enterprise Security — identity, authN/authZ, Vault, audit, compliance)**, cross-linking M1 (isolation/separation), M2 (secret hardening), M8 (Security/Compliance consoles), M9 (billing admin role). See `MIGRATION-BACKLOG.md`.

---

**End of Part 7 — Status: Draft (Awaiting Review) · Version 1.0.** Not locked. Permanent Source of Truth for Authentication, Authorization & Enterprise Security once approved; conflicts resolve to Part 1 → Part 2 → Part 3 → Part 4 → Part 5 → Part 6. Awaiting owner review → then the next Bible part.
