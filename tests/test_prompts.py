from ai.prompts import load_prompt


def test_story_prompt_has_topic_marker():
    p = load_prompt("story_script")
    assert "{topic}" in p
    assert "Amber Light Stories" in p


def test_seo_prompt_has_excerpt_marker_and_json():
    p = load_prompt("seo")
    assert "{script_excerpt}" in p
    assert '"title"' in p and '"tags"' in p
