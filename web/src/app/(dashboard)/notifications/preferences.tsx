"use client";

import { useState, useTransition } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  CATEGORY_LABELS,
  NOTIFICATION_CATEGORIES,
  defaultPreference,
} from "@/lib/ops/notification-categories";
import { saveNotificationPreference } from "./actions";

export interface PreferenceRow {
  category: string;
  in_app: boolean;
  email: boolean;
  webhook: boolean;
  min_severity: string;
}

export function NotificationPreferences({ saved }: { saved: PreferenceRow[] }) {
  const initial = NOTIFICATION_CATEGORIES.map(
    (c) => saved.find((s) => s.category === c) ?? defaultPreference(c)
  );
  const [rows, setRows] = useState<PreferenceRow[]>(initial);
  const [pending, startTransition] = useTransition();

  function update(category: string, patch: Partial<PreferenceRow>) {
    const next = rows.map((r) => (r.category === category ? { ...r, ...patch } : r));
    setRows(next);
    const row = next.find((r) => r.category === category)!;
    startTransition(() => {
      void saveNotificationPreference({
        category: row.category,
        inApp: row.in_app,
        email: row.email,
        webhook: row.webhook,
        minSeverity: row.min_severity,
      });
    });
  }

  return (
    <section className="mt-6 rounded-xl border border-border bg-elevated">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <SlidersHorizontal className="h-4 w-4 text-primary" strokeWidth={1.75} />
        <h2 className="text-sm font-semibold text-foreground">How you want to be told</h2>
        <span className="text-[11px] text-muted-foreground">
          These settings are yours alone — they never affect your teammates.
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-5 py-2.5 font-medium">Category</th>
              <th className="px-3 py-2.5 font-medium">In app</th>
              <th className="px-3 py-2.5 font-medium">Email</th>
              <th className="px-3 py-2.5 font-medium">Webhook</th>
              <th className="px-3 py-2.5 font-medium">Only tell me about</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.category} className="border-b border-border last:border-0">
                <td className="px-5 py-2.5 text-foreground">
                  {CATEGORY_LABELS[row.category as keyof typeof CATEGORY_LABELS] ?? row.category}
                </td>
                {(["in_app", "email", "webhook"] as const).map((field) => (
                  <td key={field} className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`${field} for ${row.category}`}
                      checked={row[field]}
                      disabled={pending}
                      onChange={(e) => update(row.category, { [field]: e.target.checked })}
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                  </td>
                ))}
                <td className="px-3 py-2.5">
                  <select
                    aria-label={`Minimum severity for ${row.category}`}
                    value={row.min_severity}
                    disabled={pending}
                    onChange={(e) => update(row.category, { min_severity: e.target.value })}
                    className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground"
                  >
                    <option value="info">everything</option>
                    <option value="warning">warnings and above</option>
                    <option value="critical">critical only</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
