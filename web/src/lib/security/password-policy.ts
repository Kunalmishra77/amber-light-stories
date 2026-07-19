/**
 * Password policy — pure functions, no Node-only APIs. Safe to import from
 * both server actions (validation) and "use client" components (the
 * strength meter), so the rules can never drift between the two.
 */

export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordCheck {
  ok: boolean;
  error?: string;
}

/** Server-side policy: min length + upper + lower + digit. Used to reject
 * weak passwords on every set/change path (forced change, reset, temp
 * password generation). */
export function validatePasswordStrength(password: string): PasswordCheck {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (!/[a-z]/.test(password)) {
    return { ok: false, error: "Password must include a lowercase letter." };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, error: "Password must include an uppercase letter." };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, error: "Password must include a number." };
  }
  return { ok: true };
}

export type StrengthLabel = "weak" | "fair" | "good" | "strong";

export interface PasswordStrength {
  score: number; // 0-4
  label: StrengthLabel;
}

/** Heuristic 0–4 score for the visual strength meter — length + character
 * class variety. Deliberately a superset of validatePasswordStrength so a
 * password can pass the hard policy while still showing as "fair". */
export function scorePasswordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: "weak" };

  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const capped = Math.min(score, 4);
  const label: StrengthLabel =
    capped <= 1 ? "weak" : capped === 2 ? "fair" : capped === 3 ? "good" : "strong";
  return { score: capped, label };
}
