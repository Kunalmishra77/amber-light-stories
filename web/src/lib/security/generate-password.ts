import "server-only";
import crypto from "node:crypto";
import { validatePasswordStrength } from "./password-policy";

// Ambiguous characters (0/O, 1/l/I) excluded so a temp password read aloud
// or hand-typed from a screen is less error-prone.
const LOWER = "abcdefghjkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*";
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

function randomChar(pool: string): string {
  return pool[crypto.randomInt(pool.length)];
}

/**
 * Generates a random temp password that is guaranteed to satisfy
 * validatePasswordStrength (one char from each required class, shuffled).
 * Used for super-admin-provisioned client accounts (onboarding approval).
 */
export function generateTempPassword(length = 14): string {
  const required = [randomChar(LOWER), randomChar(UPPER), randomChar(DIGITS), randomChar(SYMBOLS)];
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => randomChar(ALL));
  const chars = [...required, ...rest];

  // Fisher-Yates shuffle so the guaranteed classes aren't always up front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  const password = chars.join("");
  return validatePasswordStrength(password).ok ? password : generateTempPassword(length);
}
