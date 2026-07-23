import httpx

import pipeline.fal_adapter as fa


def test_subscribe_and_download_are_callable_seams(monkeypatch):
    # The seams exist and are overridable without any network / fal_client.
    monkeypatch.setattr(fa, "_subscribe", lambda model_id, arguments: {"ok": model_id})
    monkeypatch.setattr(fa, "_download_bytes", lambda url: b"IMG:" + url.encode())
    assert fa._subscribe("m", {"a": 1}) == {"ok": "m"}
    assert fa._download_bytes("http://x/y.png") == b"IMG:http://x/y.png"


def test_download_bytes_returns_content_on_success(monkeypatch):
    class FakeResponse:
        content = b"PNGBYTES"

        def raise_for_status(self):
            pass

    def fake_get(url, timeout=None, follow_redirects=None):
        assert follow_redirects is True
        return FakeResponse()

    monkeypatch.setattr(httpx, "get", fake_get)
    assert fa._download_bytes("http://x/y.png") == b"PNGBYTES"


def test_download_bytes_raises_on_error_status(monkeypatch):
    url = "http://x/y.png"

    class FakeResponse:
        def raise_for_status(self):
            request = httpx.Request("GET", url)
            response = httpx.Response(404, request=request)
            raise httpx.HTTPStatusError("Not Found", request=request, response=response)

    def fake_get(url, timeout=None, follow_redirects=None):
        return FakeResponse()

    monkeypatch.setattr(httpx, "get", fake_get)
    try:
        fa._download_bytes(url)
        assert False, "expected HTTPStatusError to propagate"
    except httpx.HTTPStatusError:
        pass
