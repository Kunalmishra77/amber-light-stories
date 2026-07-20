"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navGroups, type NavGroup } from "@/lib/nav";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface NavListProps {
  collapsed?: boolean;
  onNavigate?: () => void;
  /**
   * Explicit nav groups to render. When omitted, renders the client
   * workspace groups. The platform console passes its own groups here.
   * NOTE: the client sidebar never renders platform/admin nav — the two
   * shells are fully separate (Bible Part 2 / ADR-001). Super admins reach
   * the platform console via the topbar "Platform Console" link.
   */
  groups?: NavGroup[];
}

export function NavList({
  collapsed = false,
  onNavigate,
  groups: groupsProp,
}: NavListProps) {
  const pathname = usePathname();
  const groups = groupsProp ?? navGroups;

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      {groups.map((group) => (
        <div key={group.label} className="mb-5 last:mb-0">
          {!collapsed && (
            <p className="mb-1.5 px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
          )}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href} className="relative">
                  {active && (
                    <span
                      className="absolute inset-y-1 left-0 w-[2px] rounded-full bg-primary shadow-[0_0_8px_var(--primary)]"
                      aria-hidden="true"
                    />
                  )}
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors duration-200 ease-out",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-elevated hover:text-foreground"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-[18px] w-[18px] shrink-0",
                        active
                          ? "text-primary"
                          : "text-muted-foreground group-hover:text-foreground"
                      )}
                      strokeWidth={1.75}
                    />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
