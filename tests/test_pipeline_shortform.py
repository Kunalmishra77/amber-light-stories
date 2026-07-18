"""Phase-1 short-form cinematic pipeline tests. Everything here is mocked --
no network calls to OpenAI/Gemini/ElevenLabs/fal.ai are made anywhere.
"""
import copy

import pytest

from tests.conftest import FakeSupabase


# --------------------------------------------------------------------------
# schema
# --------------------------------------------------------------------------

def _good_story_dict():
    from pipeline.story import generate_story
    return generate_story("proj-1", mock=True).model_dump()


def test_schema_validates_a_good_doc():
    from pipeline.schema import StoryDoc
    doc = StoryDoc(**_good_story_dict())
    assert doc.title
    assert len(doc.scenes) == 6


def test_schema_rejects_a_bad_doc():
    from pipeline.schema import StoryDoc
    bad = _good_story_dict()
    bad["scenes"][0]["importance"] = "URGENT"  # not a valid Literal
    with pytest.raises(Exception):
        StoryDoc(**bad)


def test_schema_rejects_duration_mismatch():
    from pipeline.schema import StoryDoc
    bad = _good_story_dict()
    bad["total_seconds"] = 999
    with pytest.raises(Exception):
        StoryDoc(**bad)


def test_schema_rejects_too_few_scenes():
    from pipeline.schema import StoryDoc
    bad = _good_story_dict()
    bad["scenes"] = bad["scenes"][:2]
    with pytest.raises(Exception):
        StoryDoc(**bad)


# --------------------------------------------------------------------------
# story generation (mock -- zero API calls)
# --------------------------------------------------------------------------

def test_generate_story_mock_returns_valid_hindi_short_story():
    from pipeline.story import generate_story

    story = generate_story("proj-1", mock=True)

    assert len(story.scenes) == 6
    assert 30 <= story.total_seconds <= 60
    assert story.language == "hi"

    # Hindi (Devanagari) narration present.
    assert any("ऀ" <= ch <= "ॿ" for ch in story.scenes[0].narration)

    # Decision metadata: hero (seq 0) and climax are HIGH + ai_animation.
    assert story.scenes[0].importance == "HIGH"
    assert story.scenes[0].motion_type == "ai_animation"
    assert story.scenes[0].new_asset_required is True
    assert story.scenes[0].existing_asset_allowed is False

    high_scenes = [s for s in story.scenes if s.importance == "HIGH"]
    assert len(high_scenes) >= 2
    for s in high_scenes:
        assert s.motion_type == "ai_animation"
        assert s.animation_required is True

    low_scenes = [s for s in story.scenes if s.importance == "LOW"]
    assert low_scenes, "expected at least one background/LOW scene"
    for s in low_scenes:
        assert s.existing_asset_allowed is True

    for s in story.scenes:
        assert 0.0 <= s.importance_score <= 1.0
        assert s.recommended_quality in ("Low", "Medium", "High")
        assert s.narration
        assert s.prompt.subject


def test_generate_story_mock_scenes_are_contiguous_and_sum_to_total():
    from pipeline.story import generate_story

    story = generate_story("proj-1", mock=True)
    assert story.scenes[0].start_sec == 0
    for prev, cur in zip(story.scenes, story.scenes[1:]):
        assert cur.start_sec == prev.end_sec
    assert story.scenes[-1].end_sec == story.total_seconds


# --------------------------------------------------------------------------
# cost governor
# --------------------------------------------------------------------------

def test_cost_governor_can_afford_and_add():
    from pipeline.cost_governor import CostGovernor

    g = CostGovernor(1.0)
    assert g.can_afford(0.5)
    g.add(0.5)
    assert g.can_afford(0.5)
    assert not g.can_afford(0.51)
    assert abs(g.remaining() - 0.5) < 1e-9


def test_cost_governor_downgrade_helpers():
    from pipeline.cost_governor import CostGovernor

    g = CostGovernor(1.0)
    assert g.downgrade_quality("High") == "Medium"
    assert g.downgrade_quality("Medium") == "Low"
    assert g.downgrade_quality("Low") == "Low"
    assert g.downgrade_motion_tier("premium") == "standard"
    assert g.downgrade_motion_tier("standard") == "cheap"
    assert g.downgrade_motion_tier("cheap") == "cheap"
    assert g.downgrade_motion_type("ai_animation") == "ken_burns"
    assert g.downgrade_motion_type("static") == "static"


# --------------------------------------------------------------------------
# prompt cache
# --------------------------------------------------------------------------

def test_cache_key_is_deterministic_and_order_independent():
    from pipeline.prompt_cache import cache_key

    k1 = cache_key({"a": 1, "b": 2}, "model-x", {"p": 1})
    k2 = cache_key({"b": 2, "a": 1}, "model-x", {"p": 1})
    assert k1 == k2
    assert k1 == cache_key({"a": 1, "b": 2}, "model-x", {"p": 1})  # stable


def test_cache_key_differs_for_different_prompts():
    from pipeline.prompt_cache import cache_key

    k1 = cache_key({"a": 1}, "model-x", {})
    k2 = cache_key({"a": 2}, "model-x", {})
    assert k1 != k2


# --------------------------------------------------------------------------
# decision engine
# --------------------------------------------------------------------------

class FakeAssetLib:
    def __init__(self, hit=None):
        self.hit = hit
        self.calls = []

    def search(self, query, project_id, character_id=None, threshold=0.82):
        self.calls.append((query, project_id, character_id, threshold))
        return self.hit


class FakeCache:
    def __init__(self, hit=None):
        self.hit = hit
        self.gets = []
        self.puts = []

    def get(self, key):
        self.gets.append(key)
        return self.hit

    def put(self, key, kind, model, asset_id, prompt):
        self.puts.append((key, kind, model, asset_id, prompt))


def _scene(**overrides):
    base = {
        "seq": 0,
        "importance": "MEDIUM",
        "importance_score": 0.6,
        "new_asset_required": False,
        "existing_asset_allowed": True,
        "animation_required": False,
        "recommended_quality": "Medium",
        "motion_type": "ken_burns",
        "asset_query": "some query",
        "prompt": {
            "subject": "s", "environment": "e", "camera": "c", "lens": "l",
            "lighting": "li", "color_grade": "cg", "expression": "ex",
            "emotion": "em", "motion_direction": "md", "sfx_cue": "sfx",
            "music_cue": "mc",
        },
    }
    base.update(overrides)
    return base


def _project():
    from pipeline.model_routing import DEFAULT_ROUTING
    return {"id": "proj-1", "model_routing": DEFAULT_ROUTING}


def test_decision_high_new_asset_generates():
    from pipeline.cost_governor import CostGovernor
    from pipeline.decision import plan_scene

    scene = _scene(importance="HIGH", new_asset_required=True,
                    existing_asset_allowed=False, recommended_quality="High")
    governor = CostGovernor(1.55)
    plan = plan_scene(scene, _project(), FakeAssetLib(None), FakeCache(None), governor)

    assert plan["image_action"] == "generate"
    assert plan["image_cost"] > 0
    assert plan["image_model"]
    assert governor.spent >= plan["image_cost"]


def test_decision_low_existing_asset_match_reuses_free():
    from pipeline.cost_governor import CostGovernor
    from pipeline.decision import plan_scene

    scene = _scene(importance="LOW", new_asset_required=False,
                    existing_asset_allowed=True, recommended_quality="Low",
                    motion_type="static")
    governor = CostGovernor(1.55)
    asset_lib = FakeAssetLib({"id": "asset-123"})
    plan = plan_scene(scene, _project(), asset_lib, FakeCache(None), governor)

    assert plan["image_action"] == "reuse_asset"
    assert plan["image_cost"] == 0.0
    assert plan["image_asset_id"] == "asset-123"
    assert plan["motion_action"] == "local_ffmpeg"
    assert plan["motion_cost"] == 0.0
    assert governor.spent == 0.0
    assert asset_lib.calls  # asset library was actually consulted


def test_decision_high_ai_animation_affordable_uses_ai_motion():
    from pipeline.cost_governor import CostGovernor
    from pipeline.decision import plan_scene

    scene = _scene(importance="HIGH", new_asset_required=False,
                    existing_asset_allowed=True, animation_required=True,
                    motion_type="ai_animation", recommended_quality="High")
    governor = CostGovernor(1.55)
    plan = plan_scene(scene, _project(), FakeAssetLib({"id": "hero-1"}), FakeCache(None), governor)

    assert plan["motion_action"] == "ai_animation"
    assert plan["motion_type"] == "ai_animation"
    assert plan["motion_cost"] > 0
    assert plan["motion_model"]


def test_decision_downgrades_to_kenburns_when_governor_broke():
    from pipeline.cost_governor import CostGovernor
    from pipeline.decision import plan_scene

    scene = _scene(importance="HIGH", new_asset_required=False,
                    existing_asset_allowed=True, animation_required=True,
                    motion_type="ai_animation", recommended_quality="High")
    governor = CostGovernor(0.0)  # broke -- cannot afford anything
    plan = plan_scene(scene, _project(), FakeAssetLib({"id": "hero-1"}), FakeCache(None), governor)

    assert plan["motion_action"] == "local_ffmpeg"
    assert plan["motion_type"] == "ken_burns"
    assert plan["motion_cost"] == 0.0


def test_decision_prompt_cache_hit_reuses_free():
    from pipeline.cost_governor import CostGovernor
    from pipeline.decision import plan_scene

    scene = _scene(importance="MEDIUM", new_asset_required=True,
                    existing_asset_allowed=False, recommended_quality="Medium")
    governor = CostGovernor(1.55)
    cache = FakeCache({"asset_id": "cached-asset-1"})
    plan = plan_scene(scene, _project(), FakeAssetLib(None), cache, governor)

    assert plan["image_action"] == "reuse_cache"
    assert plan["image_cost"] == 0.0
    assert plan["image_asset_id"] == "cached-asset-1"
    assert governor.spent == 0.0


# --------------------------------------------------------------------------
# local motion (FFmpeg argv, pure)
# --------------------------------------------------------------------------

def test_local_motion_ken_burns_argv():
    from pipeline.local_motion import build_motion_command

    cmd = build_motion_command("keyframe.png", "ken_burns", 7, "out.mp4")
    assert cmd[0] == "ffmpeg"
    assert cmd[-1] == "out.mp4"
    joined = " ".join(cmd)
    assert "1080x1920" in joined
    assert "zoompan" in joined


def test_local_motion_supports_all_local_types():
    from pipeline.local_motion import build_motion_command

    for motion_type in ("static", "ken_burns", "zoom", "pan", "motion_crop"):
        cmd = build_motion_command("kf.png", motion_type, 5, "out.mp4", size=(1080, 1920))
        assert cmd[0] == "ffmpeg"
        assert cmd[-1] == "out.mp4"


def test_local_motion_rejects_unknown_type():
    from pipeline.local_motion import build_motion_command

    with pytest.raises(ValueError):
        build_motion_command("kf.png", "ai_animation", 5, "out.mp4")


# --------------------------------------------------------------------------
# persist
# --------------------------------------------------------------------------

def test_persist_story_writes_story_scenes_run_and_stages(monkeypatch):
    from pipeline import persist as persist_mod
    from pipeline.story import generate_story

    story = generate_story("proj-1", mock=True)
    fake = FakeSupabase({
        "stories": [{"id": "story-1"}],
        "scenes": [],
        "pipeline_runs": [{"id": "run-1"}],
        "pipeline_stages": [],
    })
    monkeypatch.setattr(persist_mod, "get_supabase", lambda: fake)

    story_id = persist_mod.persist_story(story, "proj-1")

    assert story_id == "story-1"

    stories_insert = fake.queries["stories"][0].inserted
    assert stories_insert["project_id"] == "proj-1"
    assert stories_insert["topic"] == story.title
    assert stories_insert["duration_seconds"] == story.total_seconds

    scene_inserts = [q.inserted for q in fake.queries["scenes"]]
    assert len(scene_inserts) == 6
    assert scene_inserts[0]["story_id"] == "story-1"
    assert scene_inserts[0]["seq"] == 0
    assert scene_inserts[0]["importance"] == "HIGH"
    assert scene_inserts[0]["motion_type"] == "ai_animation"
    assert "prompt" in scene_inserts[0] and scene_inserts[0]["prompt"]["asset_query"]

    run_insert = fake.queries["pipeline_runs"][0].inserted
    assert run_insert["story_id"] == "story-1"

    stage_inserts = [q.inserted for q in fake.queries["pipeline_stages"]]
    assert len(stage_inserts) == len(persist_mod.STAGES)
    assert stage_inserts[0]["stage"] == "topic"
    assert stage_inserts[0]["status"] == "done"
    assert stage_inserts[-1]["stage"] == "publish"
    assert stage_inserts[-1]["status"] == "pending"
