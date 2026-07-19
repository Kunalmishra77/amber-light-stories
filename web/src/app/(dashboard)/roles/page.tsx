import { Fragment } from "react";
import { Check, UserCog } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

interface RoleRow {
  key: string;
  label: string;
  level: number;
}

interface PermissionRow {
  key: string;
  label: string;
  category: string | null;
}

interface RolePermissionRow {
  role_key: string;
  permission_key: string;
}

/**
 * Baseline role capability blurbs shown alongside the matrix. `role_permissions`
 * has no seed rows yet in this phase (see src/lib/auth.ts `isOwnerOrManager`),
 * so this describes what each role is DESIGNED to do — the matrix below still
 * reflects the live `role_permissions` table whenever it is populated.
 */
const ROLE_BLURBS: Record<string, string> = {
  client_owner: "Full control — billing, team, brand, credentials, and every content action.",
  client_manager: "Runs day-to-day production — invite/manage editors, approve content, manage credentials.",
  client_editor: "Creates and edits content — stories, scenes, plans — but can't manage the team or billing.",
  client_viewer: "Read-only access — can view everything but can't create, edit, or approve.",
};

export default async function RolesPage() {
  const supabase = await createClient();

  const [{ data: roles }, { data: permissions }, { data: rolePermissions }] = await Promise.all([
    supabase.from("roles").select("key, label, level").order("level", { ascending: false }),
    supabase.from("permissions").select("key, label, category").order("category", { ascending: true }),
    supabase.from("role_permissions").select("role_key, permission_key"),
  ]);

  const roleRows = ((roles ?? []) as RoleRow[]).filter((r) => r.key !== "super_admin" && r.key !== "internal_admin");
  const permissionRows = (permissions ?? []) as PermissionRow[];
  const grants = new Set(
    ((rolePermissions ?? []) as RolePermissionRow[]).map((rp) => `${rp.role_key}:${rp.permission_key}`)
  );

  const categories = Array.from(new Set(permissionRows.map((p) => p.category ?? "general")));

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        description="What each role in your workspace can do. Roles are managed by the platform — assign them to teammates from the Team page."
      />

      {roleRows.length === 0 ? (
        <EmptyState icon={UserCog} title="No roles configured" description="Roles will show up here once seeded." />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {roleRows.map((role) => (
              <div key={role.key} className="flex flex-col gap-2 rounded-xl border border-border bg-elevated p-4 shadow-sm">
                <span className="w-fit rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {role.label}
                </span>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {ROLE_BLURBS[role.key] ?? "Custom role."}
                </p>
              </div>
            ))}
          </div>

          {permissionRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-surface/60 px-4 py-6 text-center text-xs text-muted-foreground">
              No fine-grained permissions have been assigned to roles yet — access is currently
              governed by role level (owner/manager vs. editor/viewer) instead.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-elevated">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Permission</th>
                    {roleRows.map((role) => (
                      <th key={role.key} className="px-4 py-3 text-center font-medium">
                        {role.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => (
                    <Fragment key={category}>
                      <tr className="bg-surface/60">
                        <td
                          colSpan={roleRows.length + 1}
                          className="px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                        >
                          {category}
                        </td>
                      </tr>
                      {permissionRows
                        .filter((p) => (p.category ?? "general") === category)
                        .map((perm) => (
                          <tr key={perm.key} className="border-b border-border/60 last:border-0">
                            <td className="px-5 py-2.5 text-foreground">{perm.label}</td>
                            {roleRows.map((role) => {
                              const granted = grants.has(`${role.key}:${perm.key}`);
                              return (
                                <td key={role.key} className="px-4 py-2.5 text-center">
                                  {granted ? (
                                    <Check
                                      className={cn("mx-auto h-4 w-4 text-[var(--status-approved)]")}
                                      strokeWidth={2.5}
                                    />
                                  ) : (
                                    <span className="text-muted-foreground/40">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
