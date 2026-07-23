import pipeline.fal_adapter as fa


def _fake_result(url="http://fal/out.png", seed=42, nsfw=False):
    return {"images": [{"url": url, "width": 1080, "height": 1920}],
            "seed": seed, "has_nsfw_concepts": [nsfw]}


def test_generate_image_real_returns_bytes_cost_meta(monkeypatch):
    captured = {}

    def fake_subscribe(model_id, arguments):
        captured["model_id"] = model_id
        captured["arguments"] = arguments
        return _fake_result()

    monkeypatch.setattr(fa, "_subscribe", fake_subscribe)
    monkeypatch.setattr(fa, "_download_bytes", lambda url: b"PNGDATA:" + url.encode())

    project = {"id": "p1", "model_routing": {}}  # {} -> DEFAULT_ROUTING
    result = fa.generate_image({"subject": "a red door"}, "High", project, dry=False)

    assert result["bytes"] == b"PNGDATA:http://fal/out.png"
    assert result["cost_usd"] == 0.035  # IMAGE_COST_ESTIMATE["High"]
    assert result["meta"]["model"] == "fal-ai/flux/dev"  # High -> flux/dev
    assert result["meta"]["seed"] == 42
    assert result["meta"]["nsfw"] is False
    assert "a red door" in captured["arguments"]["prompt"]
    assert captured["arguments"]["image_size"] == {"width": 1080, "height": 1920}


def test_generate_image_raises_when_no_images(monkeypatch):
    monkeypatch.setattr(fa, "_subscribe", lambda m, a: {"images": []})
    monkeypatch.setattr(fa, "_download_bytes", lambda url: b"")
    try:
        fa.generate_image({"subject": "x"}, "Medium", {"model_routing": {}}, dry=False)
        assert False, "expected RuntimeError"
    except RuntimeError as e:
        assert "no image" in str(e).lower()
