"use client";

import { scorePasswordStrength, MIN_PASSWORD_LENGTH, type StrengthLabel } from "@/lib/security/password-policy";

const LABELS: Record<StrengthLabel, string> = {
  weak: "Weak",
  fair: "Fair",
  good: "Good",
  strong: "Strong",
};

// Reuses the existing pipeline status tokens (already themed for
// dark/light) rather than introducing new colors.
const BAR_COLOR: Record<StrengthLabel, string> = {
  weak: "bg-[var(--status-failed)]",
  fair: "bg-[var(--status-running)]",
  good: "bg-[var(--status-awaiting-review)]",
  strong: "bg-[var(--status-approved)]",
};

const TEXT_COLOR: Record<StrengthLabel, string> = {
  weak: "text-[var(--status-failed)]",
  fair: "text-[var(--status-running)]",
  good: "text-[var(--status-awaiting-review)]",
  strong: "text-[var(--status-approved)]",
};

interface PasswordStrengthMeterProps {
  password: string;
}

/** Visual strength meter for password fields — 4 segments, colored by
 * heuristic score. Purely presentational; server-side validation via
 * validatePasswordStrength is what actually enforces the policy. */
export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const { score, label } = scorePasswordStrength(password);

  if (!password) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < score ? BAR_COLOR[label] : "bg-border"
            }`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className={`text-[11px] font-medium ${TEXT_COLOR[label]}`}>{LABELS[label]}</span>
        <span className="text-[11px] text-muted-foreground">
          Min {MIN_PASSWORD_LENGTH} chars, upper + lower + number
        </span>
      </div>
    </div>
  );
}
