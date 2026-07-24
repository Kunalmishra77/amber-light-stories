from pipeline.orchestrator import _motion_live


def test_motion_live_true_when_live_and_plan_approves_ai():
    assert _motion_live(True, {"motion_action": "ai_animation"}) is True


def test_motion_live_false_when_plan_downgraded_to_local():
    # plan_scene sets local_ffmpeg when the scene is not HIGH or the budget
    # is exhausted — the paid call must NOT run.
    assert _motion_live(True, {"motion_action": "local_ffmpeg"}) is False


def test_motion_live_false_when_not_live():
    assert _motion_live(False, {"motion_action": "ai_animation"}) is False


def test_motion_live_false_when_action_missing():
    assert _motion_live(True, {}) is False
