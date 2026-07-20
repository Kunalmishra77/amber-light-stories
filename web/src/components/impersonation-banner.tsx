import { Eye, LogOut } from "lucide-react";
import { stopImpersonation } from "@/lib/actions/impersonation";

/**
 * Persistent banner shown while a platform operator is viewing a client
 * workspace via an audited "View as Workspace" session. Makes the
 * impersonation unmistakable and offers a one-click exit back to the
 * platform console. Rendered by the client shell only when impersonating.
 */
export function ImpersonationBanner({ tenantName }: { tenantName: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/30 bg-primary/10 px-4 py-2 sm:px-6">
      <span className="inline-flex items-center gap-2 text-xs font-medium text-primary">
        <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
        Viewing as <strong className="font-semibold">{tenantName}</strong>
        <span className="hidden text-primary/70 sm:inline">
          — platform operator session (audited)
        </span>
      </span>
      <form action={stopImpersonation}>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-surface px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
        >
          <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
          Exit to console
        </button>
      </form>
    </div>
  );
}
