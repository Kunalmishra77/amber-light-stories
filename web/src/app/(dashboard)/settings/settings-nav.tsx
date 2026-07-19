import type { LucideIcon } from "lucide-react";
import {
  AudioLines,
  Bell,
  Briefcase,
  Globe2,
  LayoutGrid,
  PenSquare,
  Power,
  Send,
  SlidersHorizontal,
} from "lucide-react";

const SECTIONS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "#workspace", label: "Workspace", icon: LayoutGrid },
  { href: "#business", label: "Business", icon: Briefcase },
  { href: "#region", label: "Language & Region", icon: Globe2 },
  { href: "#content", label: "Content", icon: PenSquare },
  { href: "#voice", label: "Voice & AI", icon: AudioLines },
  { href: "#automation", label: "Automation", icon: Power },
  { href: "#notifications", label: "Notifications", icon: Bell },
  { href: "#production", label: "Production", icon: SlidersHorizontal },
  { href: "#more", label: "Security, API, Team & more", icon: Send },
];

/** Jump-to sub-nav for the Settings page. Plain anchors + native smooth
 * scrolling (see `html { scroll-behavior: smooth }` — falls back to instant
 * jumps if unset) — no client JS/scroll-spy needed for a page this size. */
export function SettingsNav() {
  return (
    <nav className="lg:sticky lg:top-20 lg:self-start">
      <ul className="flex flex-wrap gap-1.5 lg:w-56 lg:flex-col lg:gap-0.5">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <li key={section.href}>
              <a
                href={section.href}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
              >
                <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                {section.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
