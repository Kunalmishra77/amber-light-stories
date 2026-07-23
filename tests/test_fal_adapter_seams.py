import pipeline.fal_adapter as fa


def test_subscribe_and_download_are_callable_seams(monkeypatch):
    # The seams exist and are overridable without any network / fal_client.
    monkeypatch.setattr(fa, "_subscribe", lambda model_id, arguments: {"ok": model_id})
    monkeypatch.setattr(fa, "_download_bytes", lambda url: b"IMG:" + url.encode())
    assert fa._subscribe("m", {"a": 1}) == {"ok": "m"}
    assert fa._download_bytes("http://x/y.png") == b"IMG:http://x/y.png"
