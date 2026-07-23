import pipeline.fal_adapter as fa


def test_generate_motion_uploads_local_path_then_returns_video_bytes(monkeypatch):
    captured = {}

    monkeypatch.setattr(fa, "_upload_file", lambda path: "https://fal.storage/" + path)

    def fake_subscribe(model_id, arguments):
        captured["model_id"] = model_id
        captured["arguments"] = arguments
        return {"video": {"url": "https://fal/out.mp4"}}

    monkeypatch.setattr(fa, "_subscribe", fake_subscribe)
    monkeypatch.setattr(fa, "_download_bytes", lambda url: b"MP4:" + url.encode())

    project = {"id": "p1", "model_routing": {}}  # {} -> DEFAULT_ROUTING
    result = fa.generate_motion("/tmp/scene.png", "standard", project, dry=False)

    assert result["bytes"] == b"MP4:https://fal/out.mp4"
    assert result["cost_usd"] == 0.35  # MOTION_COST_ESTIMATE["standard"]
    assert result["meta"]["model"] == "fal-ai/kling-video/v1.6/standard/image-to-video"
    assert result["meta"]["tier"] == "standard"
    # the local path was uploaded and the resulting URL passed as image_url
    assert captured["arguments"]["image_url"] == "https://fal.storage//tmp/scene.png"
    assert captured["arguments"]["duration"] == "5"
    assert captured["arguments"]["prompt"] == fa._MOTION_PROMPT


def test_generate_motion_passes_through_http_url_without_upload(monkeypatch):
    def boom(path):
        raise AssertionError("_upload_file must not be called for an http url")

    monkeypatch.setattr(fa, "_upload_file", boom)
    monkeypatch.setattr(fa, "_subscribe",
                        lambda m, a: {"video": {"url": "https://fal/out.mp4"}})
    monkeypatch.setattr(fa, "_download_bytes", lambda url: b"x")
    r = fa.generate_motion("https://cdn/img.png", "cheap", {"model_routing": {}}, dry=False)
    assert r["cost_usd"] == 0.15  # MOTION_COST_ESTIMATE["cheap"]


def test_generate_motion_raises_when_no_video(monkeypatch):
    monkeypatch.setattr(fa, "_upload_file", lambda path: "https://u/x")
    monkeypatch.setattr(fa, "_subscribe", lambda m, a: {"video": {}})
    monkeypatch.setattr(fa, "_download_bytes", lambda url: b"")
    try:
        fa.generate_motion("/tmp/x.png", "standard", {"model_routing": {}}, dry=False)
        assert False, "expected RuntimeError"
    except RuntimeError as e:
        assert "no video" in str(e).lower()
