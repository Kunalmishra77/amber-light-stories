import Link from "next/link";
import { AlertTriangle, Fingerprint, KeyRound, Lock, ShieldCheck, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { SignOutEverywhereButton } from "./sign-out-everywhere-button";

// Reads live session/profile data on every request — never prerender this.
export const dynamic = "force-dynamic";

interface ProfileSecurityRow {
  password_changed_at: string | null;
  failed_login_attempts: number | null;
  locked_until: string | null;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function SecurityPage() {
  const supabase = await createClient();
  const user = await getSessionUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("password_changed_at, failed_login_attempts, locked_until")
        .eq("user_id", user.id)
        .maybeSingle<ProfileSecurityRow>()
    : { data: null };

  const isLocked = Boolean(profile?.locked_until && new Date(profile.locked_until) > new Date());

  return (
    <div>
      <PageHeader
        title="Security"
        description="Manage your session, password, and account protection."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Current session */}
        <div className="rounded-xl border border-border bg-elevated p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Fingerprint className="h-4 w-4 text-primary" strokeWidth={1.75} />
            Current session
          </h2>
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Signed in as</dt>
              <dd className="font-medium text-foreground">{user?.email ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Last sign-in</dt>
              <dd className="font-medium text-foreground">{formatDateTime(user?.last_sign_in_at)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Account created</dt>
              <dd className="font-medium text-foreground">{formatDateTime(user?.created_at)}</dd>
            </div>
          </dl>
          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-2 text-xs text-muted-foreground">
              Revoke every active session on every device — you&apos;ll need to sign in again here too.
            </p>
            <SignOutEverywhereButton />
          </div>
        </div>

        {/* Password & lockout */}
        <div className="rounded-xl border border-border bg-elevated p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <KeyRound className="h-4 w-4 text-primary" strokeWidth={1.75} />
            Password
          </h2>
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Last changed</dt>
              <dd className="font-medium text-foreground">{formatDateTime(profile?.password_changed_at)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Account status</dt>
              <dd>
                {isLocked ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--status-failed)]/30 bg-[var(--status-failed)]/10 px-2.5 py-1 text-xs font-medium text-[var(--status-failed)]">
                    <ShieldAlert className="h-3 w-3" strokeWidth={2} />
                    Locked until {formatDateTime(profile?.locked_until)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--status-approved)]/30 bg-[var(--status-approved)]/10 px-2.5 py-1 text-xs font-medium text-[var(--status-approved)]">
                    <ShieldCheck className="h-3 w-3" strokeWidth={2} />
                    Active
                  </span>
                )}
              </dd>
            </div>
            {(profile?.failed_login_attempts ?? 0) > 0 && !isLocked ? (
              <div className="flex items-start gap-2 rounded-lg border border-[var(--status-paused)]/30 bg-[var(--status-paused)]/10 px-3 py-2 text-xs text-[var(--status-paused)]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                <span>
                  {profile?.failed_login_attempts} recent failed sign-in attempt
                  {profile?.failed_login_attempts === 1 ? "" : "s"} recorded on this account.
                </span>
              </div>
            ) : null}
          </dl>
          <Link
            href="/change-password"
            className="mt-5 inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover"
          >
            <Lock className="h-3.5 w-3.5" strokeWidth={2} />
            Change password
          </Link>
        </div>

        {/* 2FA */}
        <div className="rounded-xl border border-dashed border-border bg-surface/60 p-5 lg:col-span-2">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-elevated text-muted-foreground">
              <ShieldCheck className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Two-factor authentication</p>
              <p className="mt-1 max-w-lg text-xs text-muted-foreground">
                Coming soon — add an authenticator app for an extra layer of protection on top of
                your password.
              </p>
            </div>
            <span className="ml-auto shrink-0 rounded-full border border-border bg-elevated px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Coming soon
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
