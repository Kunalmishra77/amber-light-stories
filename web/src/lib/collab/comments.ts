import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyUsers } from "@/lib/ops/notify";
import { resolveMemberNames } from "@/lib/review/queue";

/**
 * Review collaboration (M15 O5): threaded comments with @mentions, scoped to
 * any entity by (entity_type, entity_id). Mentions reuse the notification layer
 * — a mention is just a targeted notification with a deep link, so it obeys the
 * member's own preferences like everything else.
 */
export interface CommentRow {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  parent_id: string | null;
  body: string;
  author_id: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

export interface CommentView extends CommentRow {
  authorName: string;
  mentions: string[];
}

/** Extracts `@handle` tokens. Handles are matched to members by name or email. */
export function extractMentionHandles(body: string): string[] {
  return Array.from(new Set(Array.from(body.matchAll(/@([\w.\-+]+)/g)).map((m) => m[1].toLowerCase())));
}

async function resolveMentions(
  db: SupabaseClient,
  tenantId: string,
  handles: string[]
): Promise<{ id: string; label: string }[]> {
  if (handles.length === 0) return [];

  // The candidate set is ALWAYS the tenant's own active members, so a mention
  // can never resolve to — or reveal the existence of — a user outside the
  // workspace.
  const { data: members } = await db
    .from("memberships")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("status", "active");
  const memberIds = ((members ?? []) as { user_id: string }[]).map((m) => m.user_id);
  if (memberIds.length === 0) return [];

  // Identity lives in auth.users, not `profiles` (no email column there, and its
  // RLS scopes it to the caller's own row).
  const names = await resolveMemberNames(memberIds);
  return memberIds
    .map((id) => ({ id, label: names.get(id) ?? "member" }))
    .filter((m) => handles.includes(m.label.toLowerCase()));
}

export async function addComment(
  db: SupabaseClient,
  input: {
    tenantId: string;
    entityType: string;
    entityId: string;
    body: string;
    authorId: string | null;
    parentId?: string | null;
    /** Deep link used by mention notifications. */
    link?: string | null;
    context?: string | null;
  }
): Promise<{ comment: CommentRow; mentioned: number }> {
  const { data, error } = await db
    .from("comments")
    .insert({
      tenant_id: input.tenantId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      parent_id: input.parentId ?? null,
      body: input.body,
      author_id: input.authorId,
    })
    .select("*")
    .maybeSingle<CommentRow>();
  if (error || !data) throw new Error(error?.message ?? "Couldn't post the comment.");

  const mentioned = await resolveMentions(db, input.tenantId, extractMentionHandles(input.body));
  const targets = mentioned.filter((m) => m.id !== input.authorId);

  if (targets.length > 0) {
    await db.from("comment_mentions").insert(
      targets.map((m) => ({
        tenant_id: input.tenantId,
        comment_id: data.id,
        user_id: m.id,
        notified_at: new Date().toISOString(),
      }))
    );
    await notifyUsers(
      input.tenantId,
      targets.map((m) => m.id),
      {
        kind: "mention",
        category: "review",
        severity: "info",
        title: `You were mentioned${input.context ? ` on ${input.context}` : ""}`,
        body: input.body.slice(0, 200),
        link: input.link ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        dedupeKey: `mention:${data.id}`,
      }
    );
  }

  return { comment: data, mentioned: targets.length };
}

export async function listComments(
  db: SupabaseClient,
  input: { tenantId: string; entityType: string; entityId: string }
): Promise<CommentView[]> {
  const { data } = await db
    .from("comments")
    .select("*")
    .eq("tenant_id", input.tenantId)
    .eq("entity_type", input.entityType)
    .eq("entity_id", input.entityId)
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as CommentRow[];
  if (rows.length === 0) return [];

  const authorIds = Array.from(new Set(rows.map((r) => r.author_id).filter((v): v is string => !!v)));
  const nameById = await resolveMemberNames(authorIds);

  return rows.map((r) => ({
    ...r,
    authorName: r.author_id ? nameById.get(r.author_id) ?? "Unknown" : "System",
    mentions: extractMentionHandles(r.body),
  }));
}
