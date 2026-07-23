// Resolves the app's "@/..." aliases and stubs `server-only` so the security
// suite can import real application modules outside Next's bundler.
import { register } from "node:module";
register("./loader-impl.mjs", import.meta.url);
