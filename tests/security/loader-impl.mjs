const SRC = new URL("../../web/src/", import.meta.url).href;
const stub = (src) => ({ url: "data:text/javascript," + encodeURIComponent(src), shortCircuit: true });
export async function resolve(spec, ctx, next) {
  if (spec === "server-only" || spec === "client-only") return stub("export {};");
  if (spec === "@/lib/supabase/server") return stub("export const createClient = async () => { throw new Error('no session'); };");
  if (spec === "@/lib/supabase/admin") return stub("export const createAdminClient = () => { throw new Error('no admin client in unit test'); };");
  if (spec === "@/lib/ops/audit") return stub("export const logAudit = async () => {};");
  if (spec === "@supabase/supabase-js") return stub("export {};");
  if (spec.startsWith("@/")) { let r = spec.slice(2); if (!/\.(ts|tsx|js)$/.test(r)) r += '.ts'; return next(SRC + r, ctx); }
  return next(spec, ctx);
}
