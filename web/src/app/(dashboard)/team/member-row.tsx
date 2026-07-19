"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { changeMemberRole, removeMember } from "./actions";

const ROLE_OPTIONS = [
  { value: "client_owner", label: "Owner" },
  { value: "client_manager", label: "Manager" },
  { value: "client_editor", label: "Editor" },
  { value: "client_viewer", label: "Viewer" },
];

export interface MemberRowData {
  id: string;
  userId: string;
  email: string;
  role: string;
  isSelf: boolean;
}

export function MemberRow({
  member,
  canManage,
}: {
  member: MemberRowData;
  canManage: boolean;
}) {
  const [role, setRole] = useState(member.role);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleRoleChange(newRole: string) {
    setError(null);
    const previous = role;
    setRole(newRole);
    startTransition(async () => {
      const result = await changeMemberRole(member.id, newRole);
      if (!result.ok) {
        setRole(previous);
        setError(result.error ?? "Couldn't change role.");
      }
    });
  }

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removeMember(member.id);
      if (!result.ok) {
        setError(result.error ?? "Couldn't remove member.");
        return;
      }
      setRemoved(true);
    });
  }

  if (removed) return null;

  return (
    <li className="flex flex-col gap-1.5 px-5 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {member.email}
            {member.isSelf ? <span className="ml-1.5 text-xs text-muted-foreground">(you)</span> : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canManage ? (
            <select
              value={role}
              disabled={isPending}
              onChange={(e) => handleRoleChange(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground outline-none focus-visible:border-primary disabled:opacity-50"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs capitalize text-muted-foreground">
              {role.replace("client_", "")}
            </span>
          )}
          {canManage && !member.isSelf ? (
            <button
              type="button"
              disabled={isPending}
              onClick={handleRemove}
              title="Remove member"
              aria-label="Remove member"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:border-[var(--status-failed)]/40 hover:text-[var(--status-failed)] disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          ) : null}
        </div>
      </div>
      {error ? (
        <div className="flex items-start gap-1.5 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}
    </li>
  );
}
