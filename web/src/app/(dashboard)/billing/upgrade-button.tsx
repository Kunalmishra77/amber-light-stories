"use client";

import { useState } from "react";
import { Zap } from "lucide-react";

export function UpgradeButton({ planName }: { planName: string }) {
  const [clicked, setClicked] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setClicked(true)}
        className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover"
      >
        <Zap className="h-3.5 w-3.5" strokeWidth={2} />
        Upgrade to {planName}
      </button>
      {clicked ? (
        <p className="text-center text-[11px] text-muted-foreground">
          Billing activates soon — contact us.
        </p>
      ) : null}
    </div>
  );
}
