"""A reuse that can't be honoured is a paid generation.

The plan calls a reuse free, because reusing an existing asset IS free. But
the plan is made before anyone checks the file is still there, and the row
outlives the file routinely — a worker redeployed without a persistent volume,
a reclaimed scratch directory. The pipeline then generates for real.

If that stays priced as a reuse, the per-video budget cap is enforced against
a number that excludes real spend, and the asset is never recorded, so the
same miss repeats on every future video. Both are silent.
"""
from pipeline.cost_governor import CostGovernor
from pipeline.decision import reprice_as_generate
from pipeline.model_routing import IMAGE_COST_ESTIMATE


def _reuse_plan():
    return {
        "image_action": "reuse_asset",
        "image_cost": 0.0,
        "image_model": None,
        "image_asset_id": "asset-1",
    }


def test_a_missing_reuse_charges_the_governor():
    governor = CostGovernor(budget=2.0)
    plan = reprice_as_generate(_reuse_plan(), {"recommended_quality": "High"},
                               {}, governor)

    assert plan["image_action"] == "generate"
    assert plan["image_cost"] == IMAGE_COST_ESTIMATE["High"]
    assert governor.spent == IMAGE_COST_ESTIMATE["High"]


def test_it_picks_a_model_so_the_asset_can_be_recorded():
    # The caller only records the regenerated asset when the action reads
    # "generate" — without that the reuse cache never re-warms.
    governor = CostGovernor(budget=2.0)
    plan = reprice_as_generate(_reuse_plan(), {"recommended_quality": "Medium"},
                               {}, governor)

    assert plan["image_action"] == "generate"
    assert plan["image_model"]


def test_a_reuse_miss_near_the_cap_downgrades_rather_than_overspending():
    governor = CostGovernor(budget=2.0)
    governor.add(1.99)  # almost nothing left

    plan = reprice_as_generate(_reuse_plan(), {"recommended_quality": "High"},
                               {}, governor)

    assert plan["image_cost"] <= IMAGE_COST_ESTIMATE["High"]
    assert governor.spent <= 2.0 + IMAGE_COST_ESTIMATE["Low"]


def test_the_budget_sees_the_spend_a_reuse_plan_would_have_hidden():
    governor = CostGovernor(budget=2.0)
    before = governor.spent

    reprice_as_generate(_reuse_plan(), {"recommended_quality": "Medium"}, {}, governor)

    assert governor.spent > before
