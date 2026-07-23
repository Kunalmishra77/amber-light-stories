import pipeline.fal_adapter as fa


def test_seed_is_forwarded_for_character_consistency(monkeypatch):
    captured = {}
    monkeypatch.setattr(fa, "_subscribe",
                        lambda m, a: captured.update(a) or {"images": [{"url": "u"}], "seed": 7})
    monkeypatch.setattr(fa, "_download_bytes", lambda url: b"x")
    fa.generate_image({"subject": "hero", "seed": 7}, "Medium", {"model_routing": {}}, dry=False)
    assert captured["seed"] == 7


def test_no_seed_means_no_seed_arg(monkeypatch):
    captured = {}
    monkeypatch.setattr(fa, "_subscribe",
                        lambda m, a: captured.update(a) or {"images": [{"url": "u"}]})
    monkeypatch.setattr(fa, "_download_bytes", lambda url: b"x")
    fa.generate_image({"subject": "hero"}, "Medium", {"model_routing": {}}, dry=False)
    assert "seed" not in captured


def test_nsfw_flag_surfaced_in_meta(monkeypatch):
    monkeypatch.setattr(fa, "_subscribe",
                        lambda m, a: {"images": [{"url": "u"}], "has_nsfw_concepts": [True]})
    monkeypatch.setattr(fa, "_download_bytes", lambda url: b"x")
    r = fa.generate_image({"subject": "x"}, "Low", {"model_routing": {}}, dry=False)
    assert r["meta"]["nsfw"] is True
