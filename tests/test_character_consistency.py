"""Character consistency: every keyframe of a character must be generated from
the same appearance description and the same seed. The schema already carried
`descriptor` and `seed`, but nothing read them, so `scene.character_reference`
— which executors/fal_adapter use to anchor the look — was always empty.
"""
import pipeline.orchestrator as orch


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeTable:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def execute(self):
        return _FakeResult(self._rows)


class _FakeSb:
    def __init__(self, rows):
        self._rows = rows

    def table(self, _name):
        return _FakeTable(self._rows)


def test_load_character_refs_builds_reference_and_seed():
    sb = _FakeSb(
        [
            {
                "id": "c1",
                "name": "Mira",
                "gender": "female",
                "ethnicity": "Indian",
                "descriptor": {
                    "identity": "a village storyteller",
                    "face": "round face",
                    "hair": "long black hair",
                    "clothes": "yellow scarf",
                    "style": "storybook illustration",
                },
                "seed": 4242,
            }
        ]
    )
    refs = orch._load_character_refs(sb, [{"character_id": "c1"}, {"character_id": "c1"}])

    assert "c1" in refs
    reference = refs["c1"]["reference"]
    for piece in (
        "Mira",
        "female",
        "Indian",
        "a village storyteller",
        "round face",
        "long black hair",
        "yellow scarf",
        "storybook illustration",
    ):
        assert piece in reference, f"{piece!r} missing from the character reference"
    assert refs["c1"]["seed"] == 4242


def test_no_characters_means_no_query_at_all():
    class _Boom:
        def table(self, *_a, **_k):
            raise AssertionError("must not query when no scene names a character")

    assert orch._load_character_refs(_Boom(), [{"character_id": None}, {}]) == {}


def test_lookup_failure_degrades_instead_of_raising():
    class _Failing:
        def table(self, *_a, **_k):
            raise RuntimeError("db down")

    # A character lookup failure must not fail the render — it only costs
    # consistency, so it degrades to no references.
    assert orch._load_character_refs(_Failing(), [{"character_id": "c1"}]) == {}


def test_scene_gets_reference_and_seed_from_its_character():
    refs = {"c1": {"reference": "Mira, long black hair", "seed": 99}}
    scene = orch._scene_from_row(
        {"id": "s1", "seq": 0, "character_id": "c1", "prompt": {"subject": "a doorway"}},
        refs,
    )
    assert scene.character_reference == "Mira, long black hair"
    # The seed rides on the prompt because that is where generate_image reads it.
    assert scene.prompt.seed == 99
    assert scene.prompt.model_dump()["seed"] == 99


def test_scene_without_a_character_carries_no_reference_or_seed():
    scene = orch._scene_from_row({"id": "s1", "seq": 0, "prompt": {"subject": "a doorway"}}, {})
    assert scene.character_reference is None
    assert "seed" not in scene.prompt.model_dump()
