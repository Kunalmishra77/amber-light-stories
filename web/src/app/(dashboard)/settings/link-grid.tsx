import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CreditCard, KeyRound, Send, ShieldAlert, Users } from "lucide-react";
import { SectionCard } from "./section-card";

interface LinkTile {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

const LINKS: LinkTile[] = [
  { label: "Security", description: "Password, sessions & sign-in policy", href: "/security", icon: ShieldAlert },
  { label: "API Management", description: "Provider credentials & keys", href: "/api-management", icon: KeyRound },
  { label: "Team", description: "Members, invites & roles", href: "/team", icon: Users },
  { label: "Billing", description: "Plan, credits & usage", href: "/billing", icon: CreditCard },
  { label: "Publishing", description: "Upload destinations & rules", href: "/publishing", icon: Send },
];

/** Groups the settings sub-areas that live on their own dedicated pages
 * (Security / API / Team / Billing / Publishing) into one jump-off card,
 * so this Settings page stays the map without duplicating those pages. */
export function LinkGrid() {
  return (
    <SectionCard id="more" icon={Send} title="More settings" description="Dedicated pages for the rest of this workspace.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="group flex items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:bg-elevated"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{link.label}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{link.description}</p>
              </div>
              <ArrowRight
                className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                strokeWidth={2}
              />
            </Link>
          );
        })}
      </div>
    </SectionCard>
  );
}
