from pipeline.fal_adapter import _build_prompt


def test_build_prompt_from_dict_includes_subject_and_suffix():
    out = _build_prompt({"subject": "a lonely lighthouse at dawn"})
    assert "a lonely lighthouse at dawn" in out
    assert "vertical 9:16" in out


def test_build_prompt_includes_character_reference():
    out = _build_prompt({"subject": "hero walking", "character_reference": "REF123"})
    assert "REF123" in out


def test_build_prompt_passthrough_string():
    assert _build_prompt("already a prompt") == "already a prompt"


def test_build_prompt_empty_dict_is_safe():
    assert isinstance(_build_prompt({}), str)
    assert isinstance(_build_prompt(None), str)
