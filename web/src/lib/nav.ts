import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Bell,
  BookOpen,
  Clapperboard,
  Activity,
  Film,
  Layers,
  Users,
  MessageSquareText,
  AudioLines,
  FolderOpen,
  LineChart,
  Wallet,
  Sparkles,
  Cpu,
  HeartPulse,
  ScrollText,
  UploadCloud,
  SlidersHorizontal,
  Settings,
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
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Notifications", href: "/notifications", icon: Bell },
    ],
  },
  {
    label: "Production",
    items: [
      { label: "Story Queue", href: "/stories", icon: BookOpen },
      { label: "Video Queue", href: "/videos", icon: Clapperboard },
      { label: "Live Pipeline", href: "/pipeline", icon: Activity },
      { label: "Scene Viewer", href: "/scenes", icon: Film },
      { label: "Rendering Queue", href: "/rendering", icon: Layers },
    ],
  },
  {
    label: "Libraries",
    items: [
      { label: "Characters", href: "/characters", icon: Users },
      { label: "Prompts", href: "/prompts", icon: MessageSquareText },
      { label: "Voices", href: "/voices", icon: AudioLines },
      { label: "Media Assets", href: "/assets", icon: FolderOpen },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { label: "YouTube Analytics", href: "/analytics", icon: LineChart },
      { label: "API Usage & Cost", href: "/usage", icon: Wallet },
      { label: "Reference Learning", href: "/style", icon: Sparkles },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Workers", href: "/workers", icon: Cpu },
      { label: "System Health", href: "/health", icon: HeartPulse },
      { label: "Logs", href: "/logs", icon: ScrollText },
      { label: "Uploads", href: "/uploads", icon: UploadCloud },
      { label: "AI Model Settings", href: "/settings/models", icon: SlidersHorizontal },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];
