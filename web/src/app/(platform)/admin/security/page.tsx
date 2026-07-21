import { ShieldCheck, ShieldAlert, KeyRound, Activity, Lock, FileCheck2, AlertOctagon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { computeRiskScore, GATED_DETECTORS } from "@/lib/security/threat";
import { verifyAuditChain } from "@/lib/security/audit";
import { cn } from "@/lib/utils";

/**
 * Security Center (M13 S5 — ISS-P7-08 / R1-08). Platform security posture with
 * an EXPLAINABLE risk score, live audit-chain integrity, open findings and
 * incidents, credential health and compliance evidence. Everything is derived
 * from existing security tables — no separate analytics store.
 */
export const dynamic = "force-dynamic";

const BAND_STYLE: Record<string, string> = {
  low: "text-[var(--status-approved)]",
  moderate: "text-[var(--status-paused)]",
  high: "text-[var(--status-failed)]",
  critical: "text-[var(--status-failed)]",
};
const SEV_STYLE: Record<string, string> = {
  info: "text-muted-foreground",
  warning: "text-[var(--status-paused)]",
  critical: "text-[var(--status-failed)]",
};

async function load() {
  const supabase = await createClient();
  const [findingsRes, incidentsRes, credsRes, policiesRes, grantsRes, breakGlassRes, controlsRes, auditRes] =
    await Promise.all([
      supabase.from("threat_findings").select("id, detector, severity, title, status, detected_at").eq("status", "open").order("detected_at", { ascending: false }).limit(50),
      supabase.from("security_incidents").select("id, title, severity, status, created_at").not("status", "in", "(resolved,closed)").order("created_at", { ascending: false }).limit(25),
      supabase.from("tenant_credentials").select("provider, health, expires_at").limit(500),
      supabase.from("security_policies").select("policy_type, scope_type").limit(200),
      supabase.from("privileged_grants").select("id, status, expires_at").in("status", ["approved", "active"]).limit(100),
      supabase.from("break_glass_requests").select("id, status, expires_at").in("status", ["requested", "approved", "active"]).limit(50),
      supabase.from("compliance_controls").select("framework, control_key, title, status").order("framework"),
      supabase.from("security_audit").select("id", { count: "exact", head: true }),
    ]);

  const findings = (findingsRes.data ?? []) as Array<{ id: string; detector: string; severity: "info" | "warning" | "critical"; title: string; detected_at: string }>;
  const incidents = (incidentsRes.data ?? []) as Array<{ id: string; title: string; severity: string; status: string }>;
  const creds = (credsRes.data ?? []) as Array<{ provider: string; health: string }>;
  const staleCredentials = creds.filter((c) => c.health === "expired" || c.health === "expiring").length;

  const risk = computeRiskScore({
    findings: findings.map((f) => ({ detector: f.detector, severity: f.severity })),
    mfaEnabled: true, // platform operators are policy-gated to MFA for privileged actions
    staleCredentials,
    openIncidents: incidents.length,
  });

  // Live tamper-evidence proof for the platform chain.
  const chain = await verifyAuditChain(null, createAdminClient());

  return {
    findings,
    incidents,
    creds,
    staleCredentials,
    risk,
    chain,
    auditRows: auditRes.count ?? 0,
    policies: (policiesRes.data ?? []).length,
    activeGrants: (grantsRes.data ?? []).length,
    breakGlass: (breakGlassRes.data ?? []).length,
    controls: (controlsRes.data ?? []) as Array<{ framework: string; control_key: string; title: string; status: string }>,
  };
}

export default async function AdminSecurityPage() {
  let data: Awaited<ReturnType<typeof load>> | null = null;
  let errored = false;
  try {
    data = await load();
  } catch {
    errored = true;
  }

  return (
    <div>
      <PageHeader
        title="Security Center"
        description="Platform security posture, explainable risk, live audit-chain integrity, open threats and incidents, credential health and compliance evidence."
      />

      {errored || !data ? (
        <EmptyState icon={AlertOctagon} title="Couldn't load the security posture" />
      ) : (
        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Risk score" value={`${data.risk.score} (${data.risk.band})`} icon={ShieldAlert} />
            <StatCard label="Open findings" value={data.findings.length} icon={Activity} />
            <StatCard label="Open incidents" value={data.incidents.length} icon={ShieldAlert} />
            <StatCard label="Credentials at risk" value={data.staleCredentials} icon={KeyRound} />
          </div>

          {/* Audit integrity — the tamper-evidence proof */}
          <section className="rounded-xl border border-border bg-elevated p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Lock className="h-4 w-4 text-primary" strokeWidth={1.75} />
              Audit chain integrity
            </h2>
            <div className="flex flex-wrap items-center gap-6 text-sm">
              <span className={cn("font-medium", data.chain.ok ? "text-[var(--status-approved)]" : "text-[var(--status-failed)]")}>
                {data.chain.ok ? "✓ Chain intact" : "✗ Chain broken"}
              </span>
              <span className="text-muted-foreground">{data.chain.checked} entries verified</span>
              <span className="text-muted-foreground">{data.auditRows} total audit records</span>
              {!data.chain.ok && data.chain.firstBadSeq !== null ? (
                <span className="text-[var(--status-failed)]">first bad sequence: {data.chain.firstBadSeq}</span>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Every entry is hash-chained by a database trigger; entries cannot be modified, and deletion requires the
              sanctioned retention purge. Verification recomputes every hash server-side.
            </p>
          </section>

          {/* Explainable risk */}
          <section className="rounded-xl border border-border bg-elevated p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" strokeWidth={1.75} />
              Why the score is {data.risk.score}
              <span className={cn("ml-1 capitalize", BAND_STYLE[data.risk.band])}>({data.risk.band})</span>
            </h2>
            {data.risk.contributors.length === 0 ? (
              <p className="text-xs text-muted-foreground">No risk contributors — posture is clean.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {data.risk.contributors.map((c, i) => (
                  <li key={i} className="flex justify-between gap-4">
                    <span className="text-muted-foreground">
                      <code className="font-mono text-xs">{c.source}</code> — {c.detail}
                    </span>
                    <span className="shrink-0 tabular-nums text-foreground">+{c.points}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Findings + incidents */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-border bg-elevated">
              <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">Open threat findings</div>
              {data.findings.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">No open findings.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {data.findings.map((f) => (
                      <tr key={f.id} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{f.detector}</td>
                        <td className="px-4 py-2.5 text-foreground">{f.title}</td>
                        <td className={cn("px-4 py-2.5 text-right text-xs font-medium capitalize", SEV_STYLE[f.severity])}>{f.severity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-elevated">
              <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">Open incidents</div>
              {data.incidents.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">No open incidents.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {data.incidents.map((i) => (
                      <tr key={i.id} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-2.5 text-foreground">{i.title}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground capitalize">{i.status}</td>
                        <td className="px-4 py-2.5 text-right text-xs font-medium capitalize text-[var(--status-paused)]">{i.severity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Controls posture */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-elevated p-5">
              <h2 className="text-sm font-semibold text-foreground">Access controls</h2>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-muted-foreground">Security policies</dt><dd className="tabular-nums text-foreground">{data.policies}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Active privileged grants</dt><dd className="tabular-nums text-foreground">{data.activeGrants}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Break-glass in flight</dt><dd className="tabular-nums text-foreground">{data.breakGlass}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Credentials tracked</dt><dd className="tabular-nums text-foreground">{data.creds.length}</dd></div>
              </dl>
              <p className="text-xs text-muted-foreground">
                Privileged access is time-boxed and cannot be self-approved; break-glass requires a multi-approver quorum.
              </p>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-elevated">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
                <FileCheck2 className="h-4 w-4 text-primary" strokeWidth={1.75} />
                Compliance evidence
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {data.controls.map((c) => (
                    <tr key={`${c.framework}-${c.control_key}`} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2 font-mono text-[11px] uppercase text-muted-foreground">{c.framework}</td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{c.control_key}</td>
                      <td className="px-4 py-2 text-foreground">{c.title}</td>
                      <td className={cn("px-4 py-2 text-right text-xs font-medium capitalize", c.status === "implemented" ? "text-[var(--status-approved)]" : "text-[var(--status-paused)]")}>
                        {c.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Honesty about what is NOT running */}
          <section className="rounded-lg border border-[var(--status-paused)]/30 bg-[var(--status-paused)]/10 px-4 py-3">
            <p className="text-xs font-medium text-[var(--status-paused)]">Detectors not running (external dependency required)</p>
            <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
              {Object.entries(GATED_DETECTORS).map(([k, v]) => (
                <li key={k}>
                  <code className="font-mono">{k}</code> — requires {v}
                </li>
              ))}
              <li><code className="font-mono">sso / scim</code> — requires an external identity provider and a Supabase SSO plan</li>
              <li><code className="font-mono">byok</code> — requires an external KMS; keys stay platform-managed until one is connected</li>
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
