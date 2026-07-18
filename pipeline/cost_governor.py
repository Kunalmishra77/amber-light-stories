"""Per-video budget governor. Caps total fal.ai spend at
projects.per_video_budget_usd and provides downgrade helpers so the
decision engine can gracefully degrade (ai_animation -> ken_burns,
premium -> standard -> cheap motion tier, High -> Medium -> Low image
quality) instead of blowing the budget.
"""

_IMAGE_DOWNGRADE = {"High": "Medium", "Medium": "Low", "Low": "Low"}
_MOTION_DOWNGRADE = {"premium": "standard", "standard": "cheap", "cheap": "cheap"}


class CostGovernor:
    def __init__(self, budget: float):
        self.budget = float(budget)
        self.spent = 0.0

    def can_afford(self, cost: float) -> bool:
        return self.spent + cost <= self.budget + 1e-9

    def add(self, cost: float) -> None:
        self.spent += cost

    def remaining(self) -> float:
        return round(self.budget - self.spent, 6)

    def downgrade_quality(self, quality: str) -> str:
        """High -> Medium -> Low (idempotent at the floor)."""
        return _IMAGE_DOWNGRADE.get(quality, "Low")

    def downgrade_motion_tier(self, tier: str) -> str:
        """premium -> standard -> cheap (idempotent at the floor)."""
        return _MOTION_DOWNGRADE.get(tier, "cheap")

    def downgrade_motion_type(self, motion_type: str) -> str:
        """ai_animation -> ken_burns; everything else local is unchanged."""
        return "ken_burns" if motion_type == "ai_animation" else motion_type
