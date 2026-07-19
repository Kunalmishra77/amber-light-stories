import { CreditCard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { PlanEditRow, type PlanEditRowData } from "./plan-edit-row";

// Plan catalog editor — reads live on every request.
export const dynamic = "force-dynamic";

async function loadPlans(): Promise<PlanEditRowData[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plans")
    .select("id, name, slug, price_month, limits, features, active, sort")
    .order("sort", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PlanEditRowData[];
}

export default async function AdminPlansPage() {
  let plans: PlanEditRowData[] = [];
  let errored = false;

  try {
    plans = await loadPlans();
  } catch {
    errored = true;
  }

  return (
    <div>
      <PageHeader
        title="Plans"
        description="The billing catalog shown on every client's /billing page. Stripe-ready — no live payments yet."
      />

      {errored ? (
        <EmptyState
          icon={CreditCard}
          title="Couldn't load plans"
          description="There was a problem reaching Supabase. Check the connection."
        />
      ) : plans.length === 0 ? (
        <EmptyState icon={CreditCard} title="No plans yet" description="Seed the plans table to get started." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {plans.map((plan) => (
            <PlanEditRow key={plan.id} plan={plan} />
          ))}
        </div>
      )}
    </div>
  );
}
