/**
 * Minimal, dependency-free CSV serialization for platform exports (M8 /
 * Reports & Exports). RFC-4180 quoting so commas, quotes, and newlines inside
 * free-text fields (e.g. story topics) never corrupt the output.
 */

/** Quote a field when it contains a comma, quote, CR, or LF; double any
 * embedded quotes. Null/undefined become an empty field. */
export function csvField(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build a CSV document (CRLF line endings for spreadsheet compatibility). */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvField).join(",")];
  for (const row of rows) lines.push(row.map(csvField).join(","));
  return lines.join("\r\n");
}
