import Link from "next/link";
import { ArrowRight, Clock, Power } from "lucide-react";
import { AutomationSwitch } from "../automation/automation-controls";
import { SectionCard } from "./section-card";

export function AutomationSummary({ enabled, canEdit }: { enabled: boolean; canEdit: boolean }) {
  return (
    <SectionCard
      id="automation"
      icon={Power}
      title="Automation"
      description="The master switch for hands-off publishing, plus where to fine-tune the cadence."
    >
      <div className="flex flex-col gap-4">
        <AutomationSwitch initialEnabled={enabled} canEdit={canEdit} />
        <Link
          href="/schedule"
          className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-primary hover:text-primary-hover"
        >
          <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
          Manage schedules & publish times
          <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      </div>
    </SectionCard>
  );
}
