# YT-Automation — PRODUCT VISION & SOURCE OF TRUTH

**Status: CANONICAL. This document is the permanent Source of Truth for the entire project.**
If any implementation, design doc, or decision conflicts with this document, **this document wins.** Never assume; when in doubt, align to this. (Ratified by the product owner, 2026-07-20.)

> Read fully before implementing any feature, writing any code, changing any UI, adding any table, or altering architecture. Think as the Founding CTO / Product & SaaS Architect building a global commercial SaaS — never as a freelancer completing a one-client project.

## 1. Product identity
**YT-Automation** is the **PRODUCT** — a commercial multi-tenant SaaS that businesses subscribe to in order to automate the complete AI-powered YouTube content workflow. It is **not** the client, not the first workspace, not the first channel. Must support **unlimited clients with no core changes**. **Configuration-driven; nothing hardcoded.**

## 2. Vision
Build the world's easiest and most intelligent AI-powered YouTube Automation SaaS. Any business/creator/agency/brand can automate the full YouTube content lifecycle while keeping **complete human control** whenever wanted. Powerful for advanced users, **extremely simple for beginners** — usable with zero engineering knowledge.

## 3. Philosophy
The client is **not buying software — they're buying an automated business system.** The platform should **think for**, **guide**, and **reduce manual work for** the client; **reduce AI cost**; **increase quality**; **improve publishing consistency.** Every feature must answer: *"Does this help the client automate YouTube content better?"* If not, it doesn't exist.

## 4. Two-system architecture (must stay completely separate)
- **System 1 — Platform Administration.** Owned by YT-Automation; accessible only by **Super Admin**. Purpose: manage the SaaS platform. **Never manages YouTube content directly.**
- **System 2 — Client Workspace.** Owned by an individual **Client/Tenant** (Amber Light Stories, History Channel, Kids Learning, Finance Academy, …). Purpose: operate *that client's* YouTube automation business.

These two **never share branding, UI, settings, business logic, or permissions.**

## 5. Multi-tenant principle
Every client is an independent **Tenant** with **complete isolation** of: workspace, users, settings, brand kit, assets, characters, prompt library, API credentials, automation, notifications, content calendar, AI configuration, YouTube channels, analytics, storage, logs, reports, schedules, and logical DB ownership. **No tenant ever sees another tenant's data. Never hardcode tenant-specific info.**

## 6. First client & branding rule
"**Amber Light Stories**" is **only a tenant**, not the platform. Its branding must **never** appear in platform-level pages/flows; it belongs **only inside its own workspace.** If Amber Light appears in any Super-Admin / platform surface → **architecture bug; redesign.**

## 7. Ownership hierarchy (never changes)
`YT-Automation (owner) → Super Admin → Clients → Client Teams → YouTube Channels`

## 8. Business model (must scale naturally)
Single client · multiple clients · agencies · enterprise · future white-label · resellers · franchise partners.

## 9. Core product goal — the content lifecycle (visualized clearly; user always knows where each video is)
Research → Topic Discovery → Content Strategy → Monthly Planning → Daily Planning → Script → Scene Planning → Prompt Generation → Image Generation → Animation → Voice → Music → Subtitles → Rendering → Thumbnail → SEO → Scheduling → Publishing → Analytics → Continuous Optimization.

## 10. Manual & Automatic modes (switchable without rebuilding the workflow)
- **Manual:** every stage pauses → client reviews/edits/approves → next stage.
- **Automatic:** proceeds automatically; client sees progress and may intervene; publishes on success.

## 11. Design principles
Every page must answer: why it exists · what business problem it solves · who accesses it · what actions it allows · how it connects to the system. Nothing exists without purpose.

## 12. UX philosophy
Premium, simple, professional, fast, modern, clean, beginner-friendly, enterprise-ready. Every action reduces confusion. Never overwhelm; advanced settings available but **hidden until needed** (progressive disclosure).

## 13. Configuration over customization
Never hardcode logic. Make configurable: countries, languages, AI models, upload times, content types, branding, notification rules, approval rules, automation rules, publishing rules. **Everything configurable.**

## 14. AI philosophy
AI reduces human **effort**, never human **control**. Platform decides intelligently when AI is needed vs when deterministic software is better/cheaper. Use AI only where it genuinely adds value. Optimize for: lower AI cost, higher quality, higher consistency, greater speed, maximum reuse.

## 15. Cost optimization
**Reuse before Generate · Cache before Call · Optimize before Upgrade · Generate only when necessary · Prefer local (deterministic) processing · Avoid duplicate AI requests.** Reduce operating cost while keeping premium quality.

## 16. Security (production-grade from day one)
API keys encrypted · secure auth · permissions validated · tenant isolation always · no cross-tenant leakage.

## 17. Scalability (never assume today's scale)
Assume thousands of clients, millions of videos, millions of AI requests, hundreds of team members, multiple AI providers, multiple storage providers, multiple publishing platforms.

## 18. Future vision (design for expansion)
Today: YouTube. Tomorrow: Instagram, Facebook, TikTok, LinkedIn, X, Pinterest, podcasts, blogs, email, future AI agents/models, white-label, marketplace, plugin system.

## 19. Engineering principles
Never build for one client. Build reusable modules/components/workflows/APIs/automation. **Avoid duplicate logic, hardcoded IDs, hardcoded AI providers, client-specific conditions.**

## 20. Decision framework (ask before any feature)
1. Reusable? 2. Scalable? 3. Secure? 4. Configurable? 5. Tenant-safe? 6. Beginner-friendly? 7. Reduces AI cost? 8. Improves UX? 9. Supports future expansion? — If any critical answer is **No → redesign before implementing.**
