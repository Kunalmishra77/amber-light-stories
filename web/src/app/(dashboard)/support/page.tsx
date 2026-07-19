import { BookOpen, LifeBuoy, Mail, MessageCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";

const CHANNELS = [
  {
    icon: Mail,
    title: "Email support",
    description: "Reach the platform team for account, billing, or technical issues.",
    action: "support@amberlight.app",
  },
  {
    icon: MessageCircle,
    title: "In-app chat",
    description: "Live chat with your account manager — coming soon.",
    action: "Coming soon",
  },
  {
    icon: BookOpen,
    title: "Help center",
    description: "Guides for the content pipeline, scheduling, and billing.",
    action: "Coming soon",
  },
];

export default function SupportPage() {
  return (
    <div>
      <PageHeader title="Support" description="Get help with your workspace." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CHANNELS.map((channel) => {
          const Icon = channel.icon;
          return (
            <div key={channel.title} className="flex flex-col gap-3 rounded-xl border border-border bg-elevated p-5 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{channel.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{channel.description}</p>
              </div>
              <span className="mt-auto w-fit rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground">
                {channel.action}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex items-start gap-3 rounded-xl border border-dashed border-border bg-surface/60 p-5">
        <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <p className="text-xs text-muted-foreground">
          For urgent production issues, use the Emergency Stop on the Automation page to halt
          publishing while you sort things out.
        </p>
      </div>
    </div>
  );
}
