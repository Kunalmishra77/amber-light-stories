"use client";

import { useId, useState, type ComponentPropsWithRef } from "react";
import { Eye, EyeOff } from "lucide-react";

/** Used when a caller doesn't supply its form's own field class. */
const BASE =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50";

type Props = Omit<ComponentPropsWithRef<"input">, "type"> & {
  /**
   * Classes for the positioning wrapper. The toggle is absolutely positioned,
   * so the wrapper — not the input — is what a parent flex/grid lays out.
   */
  wrapperClassName?: string;
};

/**
 * A password field with a show/hide toggle.
 *
 * Typing a long password blind — into a login, and again into a "confirm" box
 * — is how people get locked out of an account whose password they typed
 * correctly the first time. Every masked field in the product uses this, so
 * the affordance is in the same place everywhere.
 *
 * The toggle is a `type="button"`: inside a form, a bare <button> submits it,
 * which here would attempt a login on every reveal. It stays IN the tab order
 * — revealing is functionality, and offering it to pointer users while
 * withholding it from keyboard users is a WCAG 2.1.1 failure. One extra Tab
 * before submit is the accepted cost. Its label announces the current state
 * rather than reading as a bare icon.
 *
 * Revealed state is never persisted: it resets on every mount, so a password
 * is never left visible on a shared screen after a reload.
 */
export function PasswordInput({
  className,
  wrapperClassName,
  disabled,
  style,
  ...props
}: Props) {
  const [revealed, setRevealed] = useState(false);
  const describedBy = useId();

  const Icon = revealed ? EyeOff : Eye;

  return (
    <div className={`relative ${wrapperClassName ?? ""}`}>
      <input
        {...props}
        disabled={disabled}
        type={revealed ? "text" : "password"}
        // Callers pass their form's own field class (they differ slightly per
        // form), so the class list is REPLACED, not merged. The gap for the
        // button is set inline because most of those classes include `px-*`,
        // and which of two competing Tailwind padding utilities wins depends
        // on stylesheet order — a detail no caller should have to know.
        className={className ?? BASE}
        style={{ paddingRight: "2.75rem", ...style }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => setRevealed((v) => !v)}
        // The label carries the state, so there is no `aria-pressed` as well:
        // together they get announced twice ("Hide password, pressed").
        aria-label={revealed ? "Hide password" : "Show password"}
        aria-describedby={describedBy}
        title={revealed ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-lg text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </button>
      <span id={describedBy} className="sr-only">
        Reveals the password you have typed on screen.
      </span>
    </div>
  );
}
