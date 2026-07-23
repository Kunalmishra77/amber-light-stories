/**
 * Pure pagination helpers.
 *
 * Kept out of the component file so they can be imported (and unit-tested)
 * without pulling in JSX.
 */

/** Rows per page for list surfaces that don't specify their own. */
export const DEFAULT_PAGE_SIZE = 50;

/**
 * Parses a `?page=` param into a safe 1-based page number.
 *
 * Clamped at both ends: a page value is attacker-controlled and feeds an
 * offset, so an absurd value must not turn into an unbounded scan.
 */
export function parsePage(value: string | undefined): number {
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10_000) : 1;
}

/** The inclusive `[from, to]` row range for a page, for `.range()`. */
export function pageRange(page: number, pageSize: number): [number, number] {
  const from = (page - 1) * pageSize;
  return [from, from + pageSize - 1];
}
