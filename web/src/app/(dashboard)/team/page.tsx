import { Mail, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId, getSessionUser, isOwnerOrManager } from "@/lib/auth";
import { getUserEmails } from "@/lib/admin/emails";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { InviteForm } from "./invite-form";
import { MemberRow, type MemberRowData } from "./member-row";
import { RevokeInviteButton } from "./revoke-invite-button";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

interface MembershipRow {
  id: string;
  user_id: string;
  role: string | null;
  status: string | null;
}

interface InvitationRow {
  id: string;
  email: string;
  role: string | null;
  status: string | null;
  created_at: string | null;
  expires_at: string | null;
}

export default async function TeamPage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  const [{ data: memberships }, { data: invitations }, user, canManage] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, user_id, role, status")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
    supabase
      .from("invitations")
      .select("id, email, role, status, created_at, expires_at")
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    getSessionUser(),
    isOwnerOrManager(tenantId),
  ]);

  const memberRows = (memberships ?? []) as MembershipRow[];
  const pendingInvites = (invitations ?? []) as InvitationRow[];
  const emails = await getUserEmails(memberRows.map((m) => m.user_id));

  const members: MemberRowData[] = memberRows.map((m) => ({
    id: m.id,
    userId: m.user_id,
    email: emails.get(m.user_id) ?? m.user_id,
    role: m.role ?? "client_viewer",
    isSelf: m.user_id === user?.id,
  }));

  return (
    <div>
      <PageHeader
        title="Team"
        description="Manage who has access to this workspace and what they can do."
      />

      {canManage ? (
        <div className="mb-6">
          <InviteForm />
        </div>
      ) : (
        <div className="mb-6 rounded-lg border border-border bg-surface px-4 py-3 text-xs text-muted-foreground">
          Only owners or managers can invite members or change roles.
        </div>
      )}

      <div className="rounded-xl border border-border bg-elevated shadow-sm">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <Users className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
          <h2 className="text-sm font-semibold text-foreground">
            Members ({members.length})
          </h2>
        </div>
        {members.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={Users} title="No members yet" description="Members you invite will show up here." />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {members.map((member) => (
              <MemberRow key={member.id} member={member} canManage={canManage} />
            ))}
          </ul>
        )}
      </div>

      {pendingInvites.length > 0 ? (
        <div className="mt-6 rounded-xl border border-border bg-elevated shadow-sm">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <Mail className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
            <h2 className="text-sm font-semibold text-foreground">
              Pending invites ({pendingInvites.length})
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {pendingInvites.map((invite) => (
              <li key={invite.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{invite.email}</p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {(invite.role ?? "client_viewer").replace("client_", "")}
                  </p>
                </div>
                {canManage ? <RevokeInviteButton invitationId={invite.id} /> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
