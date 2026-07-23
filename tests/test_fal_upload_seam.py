import pipeline.fal_adapter as fa


def test_upload_file_is_a_monkeypatchable_seam(monkeypatch):
    monkeypatch.setattr(fa, "_upload_file", lambda path: "https://fal.storage/" + path)
    assert fa._upload_file("/tmp/x.png") == "https://fal.storage//tmp/x.png"


def test_motion_prompt_is_a_nonempty_string():
    assert isinstance(fa._MOTION_PROMPT, str) and fa._MOTION_PROMPT.strip()
