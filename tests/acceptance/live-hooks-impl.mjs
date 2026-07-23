// Test loader for the real live-generation smoke test: stubs server-only /
// next.* and resolves the app's "@/..." aliases, while leaving supabase/admin
// REAL (env-configured). Paths are derived from this file's location so the
// suite is portable.
const SRC = new URL("../../web/src/", import.meta.url).href;
const WEB_PKG = new URL("../../web/package.json", import.meta.url).href;
const stub = (src) => ({ url: "data:text/javascript," + encodeURIComponent(src), shortCircuit: true });
export async function resolve(spec, ctx, next) {
  if (spec === "server-only" || spec === "client-only") return stub("export {};");
  if (spec === "next/cache") return stub("export const revalidatePath = () => {}; export const revalidateTag = () => {};");
  if (spec === "next/headers") return stub("export const cookies = async () => ({ get: () => undefined, getAll: () => [], set: () => {} }); export const headers = async () => new Map();");
  if (spec === "next/server") return stub("export const after = (fn) => { try { fn(); } catch {} };");
  if (spec === "@/lib/supabase/server") {
    return stub([
      "import { createRequire } from 'node:module';",
      `const require = createRequire(${JSON.stringify(WEB_PKG)});`,
      "const { createClient: cc } = require('@supabase/supabase-js');",
      "export const createClient = async () => cc(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });",
    ].join("\n"));
  }
  if (spec.startsWith("@/")) { let r = spec.slice(2); if (!/\.(ts|tsx|js|mjs)$/.test(r)) r += ".ts"; return next(SRC + r, ctx); }
  return next(spec, ctx);
}
