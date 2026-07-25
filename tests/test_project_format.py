"""Project Settings must actually reach the render.

Both of these were settings the client could change in the portal while the
renderer ignored them: aspect ratio always came out 9:16, and the per-video
budget was always the hardcoded default. A setting that silently does nothing
is worse than no setting — the client believes they configured something.
"""
import pipeline.formats as formats
import pipeline.orchestrator as orch


# --------------------------------------------------------------- frame size

def test_each_offered_ratio_maps_to_its_own_frame():
    # The portal offers exactly these three; each must render differently.
    sizes = {formats.frame_size(r) for r in ("9:16", "16:9", "1:1")}
    assert len(sizes) == 3


def test_landscape_is_wider_than_tall_and_vertical_is_taller_than_wide():
    lw, lh = formats.frame_size("16:9")
    vw, vh = formats.frame_size("9:16")
    assert lw > lh and vh > vw


def test_every_frame_dimension_is_even():
    # H.264 yuv420p requires even dimensions; ffmpeg fails outright on odd.
    for ratio in formats.FRAME_SIZES:
        w, h = formats.frame_size(ratio)
        assert w % 2 == 0 and h % 2 == 0


def test_an_unknown_or_missing_ratio_falls_back_to_vertical():
    for value in (None, "", "4:3", "garbage"):
        assert formats.frame_size(value) == formats.FRAME_SIZES["9:16"]


def test_the_framing_reaches_the_image_prompt_not_just_the_output_size():
    # Generating a landscape composition and emitting it vertical crops heads
    # off — the model has to be told the shape.
    assert "horizontal" in formats.orientation_phrase("16:9")
    assert "vertical" in formats.orientation_phrase("9:16")
    assert "square" in formats.orientation_phrase("1:1")


def test_a_frame_can_be_named_back_to_its_ratio():
    for ratio in formats.FRAME_SIZES:
        assert formats.aspect_for_size(formats.frame_size(ratio)) == ratio


# ------------------------------------------------------------------ budget

def test_a_client_cannot_raise_their_budget_past_the_platform_ceiling():
    # A video can never cost more than the platform ceiling.
    assert formats.clamp_budget(50) == formats.PLATFORM_MAX_BUDGET_USD
    assert formats.clamp_budget(formats.PLATFORM_MAX_BUDGET_USD + 1) == formats.PLATFORM_MAX_BUDGET_USD


def test_a_client_can_set_a_budget_up_to_the_ceiling():
    assert formats.clamp_budget(0.75) == 0.75
    assert formats.clamp_budget(3.5) == 3.5  # within the raised ceiling


def test_an_unusable_budget_falls_back_to_the_default_never_to_unlimited():
    for value in (None, "", "abc", 0, -5):
        assert formats.clamp_budget(value) == formats.DEFAULT_BUDGET_USD


# ------------------------------------------- what the orchestrator loads

class _Result:
    def __init__(self, data):
        self.data = data


class _Table:
    def __init__(self, row, boom=False):
        self._row, self._boom = row, boom

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def single(self):
        return self

    def execute(self):
        if self._boom:
            raise RuntimeError("projects table unreachable")
        return _Result(self._row)


class _Sb:
    def __init__(self, row, boom=False):
        self._row, self._boom = row, boom

    def table(self, _name):
        return _Table(self._row, self._boom)


def test_the_project_row_decides_both_settings():
    budget, aspect = orch._load_project_format(
        _Sb({"per_video_budget_usd": 0.9, "aspect_ratio": "16:9"}), "proj-1"
    )
    assert budget == 0.9
    assert aspect == "16:9"


def test_a_project_asking_for_more_than_the_ceiling_is_clamped_on_load():
    budget, _ = orch._load_project_format(
        _Sb({"per_video_budget_usd": 99, "aspect_ratio": "9:16"}), "proj-1"
    )
    assert budget == formats.PLATFORM_MAX_BUDGET_USD


def test_an_unreadable_project_renders_with_defaults_rather_than_failing():
    budget, aspect = orch._load_project_format(_Sb(None, boom=True), "proj-1")
    assert budget == formats.DEFAULT_BUDGET_USD
    assert aspect == formats.DEFAULT_ASPECT


def test_no_database_means_defaults():
    assert orch._load_project_format(None, "proj-1") == (
        formats.DEFAULT_BUDGET_USD, formats.DEFAULT_ASPECT
    )


# ------------------------------ the ratio must reach ffmpeg, not just the UI

def _render_cmd(size):
    import pipeline.render as render

    return " ".join(
        render.build_render_command(
            ["a.mp4"], "voice.m4a", "out.mp4",
            subtitles=[(0.0, 2.0, "hello")], size=size,
        )
    )


def test_the_chosen_frame_is_what_ffmpeg_scales_and_crops_to():
    landscape = _render_cmd(formats.frame_size("16:9"))
    assert "scale=1920:1080" in landscape
    assert "crop=1920:1080" in landscape
    # ...and it is genuinely different from the vertical default.
    assert "scale=1080:1920" not in landscape


def test_captions_are_repositioned_for_the_frame_instead_of_a_fixed_offset():
    # y=h-320 was tuned for a 1920-tall frame; on a 1080-tall one that offset
    # is a third of the way up the screen.
    vertical = _render_cmd(formats.frame_size("9:16"))
    landscape = _render_cmd(formats.frame_size("16:9"))
    assert "y=h-320" in vertical
    assert "y=h-320" not in landscape
    assert "y=h-180" in landscape


def test_every_offered_ratio_produces_a_runnable_command():
    for ratio in formats.FRAME_SIZES:
        cmd = _render_cmd(formats.frame_size(ratio))
        assert cmd.startswith("ffmpeg -y")
        assert "libx264" in cmd
