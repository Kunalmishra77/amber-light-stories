import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  LayoutGrid,
  Target,
  CalendarRange,
  CalendarDays,
  Wand2,
  PenLine,
  ClipboardCheck,
  Sparkles,
  Activity,
  Layers,
  Send,
  Clapperboard,
  Cpu,
  BookOpen,
  Film,
  FolderOpen,
  Users,
  Paintbrush,
  MessageSquareText,
  AudioLines,
  UploadCloud,
  Power,
  Clock,
  MonitorPlay,
  LineChart,
  Wallet,
  ScrollText,
  Bell,
  HeartPulse,
  KeyRound,
  CreditCard,
  UserCog,
  Settings,
  ShieldAlert,
  UserCircle,
  LifeBuoy,
  SlidersHorizontal,
  Gauge,
  Building2,
  Flag,
  Megaphone,
  Wrench,
  Route,
  PieChart,
  Stethoscope,
  Eye,
  Palette,
  Package,
  ListChecks,
  FileDown,
  Webhook,
  Boxes,
  GitBranch,
  ShieldCheck,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: "Home",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Workspace", href: "/workspace", icon: LayoutGrid },
    ],
  },
  {
    label: "Content",
    items: [
      { label: "Content Strategy", href: "/strategy", icon: Target },
      { label: "30-Day Planner", href: "/planner", icon: CalendarRange },
      { label: "Content Calendar", href: "/calendar", icon: CalendarDays },
      { label: "AI Generator", href: "/generate", icon: Wand2 },
      { label: "Manual Content", href: "/manual", icon: PenLine },
      { label: "Content Approval", href: "/approvals", icon: ClipboardCheck },
      { label: "Reference Learning", href: "/style", icon: Sparkles },
    ],
  },
  {
    label: "Production",
    items: [
      { label: "Video Pipeline", href: "/pipeline", icon: Activity },
      { label: "Rendering Queue", href: "/rendering", icon: Layers },
      { label: "Publishing", href: "/publishing", icon: Send },
      { label: "Video Queue", href: "/videos", icon: Clapperboard },
      { label: "Workers", href: "/workers", icon: Cpu },
    ],
  },
  {
    label: "Library",
    items: [
      { label: "Stories", href: "/stories", icon: BookOpen },
      { label: "Scenes", href: "/scenes", icon: Film },
      { label: "Assets", href: "/assets", icon: FolderOpen },
      { label: "Characters", href: "/characters", icon: Users },
      { label: "Asset Library", href: "/library", icon: Boxes },
      { label: "Brand Kit", href: "/brand", icon: Paintbrush },
      { label: "Prompts", href: "/prompts", icon: MessageSquareText },
      { label: "Voices", href: "/voices", icon: AudioLines },
      { label: "Uploads", href: "/uploads", icon: UploadCloud },
    ],
  },
  {
    label: "Automation",
    items: [
      { label: "Automation", href: "/automation", icon: Power },
      { label: "Schedules", href: "/schedule", icon: Clock },
      { label: "YouTube", href: "/youtube", icon: MonitorPlay },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Analytics", href: "/analytics", icon: LineChart },
      { label: "Usage & Cost", href: "/usage", icon: Wallet },
      { label: "Activity Logs", href: "/logs", icon: ScrollText },
      { label: "Notifications", href: "/notifications", icon: Bell },
      { label: "System Health", href: "/health", icon: HeartPulse },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "API Management", href: "/api-management", icon: KeyRound },
      { label: "Developer", href: "/developer", icon: Webhook },
      { label: "Billing", href: "/billing", icon: CreditCard },
      { label: "Team", href: "/team", icon: Users },
      { label: "Roles & Permissions", href: "/roles", icon: UserCog },
      { label: "Settings", href: "/settings", icon: Settings },
      { label: "AI Model Settings", href: "/settings/models", icon: SlidersHorizontal },
      { label: "Security", href: "/security", icon: ShieldAlert },
      { label: "Profile", href: "/profile", icon: UserCircle },
      { label: "Support", href: "/support", icon: LifeBuoy },
    ],
  },
];

/**
 * Shown only to super admins (see NavList) — appended after `navGroups`,
 * never rendered for regular tenant users.
 */
export const adminNavGroup: NavGroup = {
  label: "Super Admin",
  items: [
    { label: "Overview", href: "/admin", icon: Gauge },
    { label: "Clients", href: "/admin/clients", icon: Building2 },
    { label: "Job Queue", href: "/admin/queue", icon: ListChecks },
    { label: "API & Webhooks", href: "/admin/api", icon: Webhook },
    { label: "Reports & Exports", href: "/admin/reports", icon: FileDown },
    { label: "Onboarding", href: "/admin/onboarding", icon: ClipboardCheck },
    { label: "Feature Flags", href: "/admin/flags", icon: Flag },
    { label: "Announcements", href: "/admin/announcements", icon: Megaphone },
    { label: "Maintenance", href: "/admin/maintenance", icon: Wrench },
    { label: "Security Center", href: "/admin/security", icon: ShieldCheck },
    { label: "AI Gateway", href: "/admin/gateway", icon: Cpu },
    { label: "Pipeline Analytics", href: "/admin/pipeline", icon: GitBranch },
    { label: "Model Routing", href: "/admin/routing", icon: Route },
    { label: "Plans", href: "/admin/plans", icon: Package },
    { label: "Cross-Tenant Usage", href: "/admin/usage", icon: PieChart },
    { label: "Cross-Tenant Health", href: "/admin/health", icon: Stethoscope },
    { label: "Observability", href: "/admin/observability", icon: Eye },
    { label: "Theme & Branding", href: "/admin/theme", icon: Palette },
  ],
};
