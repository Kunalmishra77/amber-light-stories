"""Background music is optional and must never be able to fail a render.

The renderer already ducks a music bed under the narration; the worker just
has to hand it a local file when the tenant has one. Every failure path here
(no track, a non-bucket path, a dead download, a dead query) must degrade to
"render without music" rather than raising.
"""
from pathlib import Path

import pipeline.render_worker as rw


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, rows, fail=False):
        self._rows, self._fail = rows, fail

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        if self._fail:
            raise RuntimeError("db down")
        return _Result(self._rows)


class _Bucket:
    def __init__(self, payload, fail=False):
        self._payload, self._fail = payload, fail

    def download(self, _path):
        if self._fail:
            raise RuntimeError("storage down")
        return self._payload


class _Storage:
    def __init__(self, bucket):
        self._bucket = bucket

    def from_(self, _name):
        return self._bucket


class _Sb:
    def __init__(self, rows, payload=b"ID3audio", query_fail=False, dl_fail=False):
        self._q = _Query(rows, fail=query_fail)
        self.storage = _Storage(_Bucket(payload, fail=dl_fail))

    def table(self, _name):
        return self._q


def test_downloads_the_tenants_music_track(tmp_path: Path):
    sb = _Sb([{"storage_path": "tenant-1/music/theme.mp3"}], payload=b"ID3audio")
    out = rw._resolve_music_path(sb, "tenant-1", tmp_path)
    assert out is not None
    assert out.exists()
    assert out.read_bytes() == b"ID3audio"
    assert out.suffix == ".mp3"


def test_no_music_row_means_no_music(tmp_path: Path):
    assert rw._resolve_music_path(_Sb([]), "tenant-1", tmp_path) is None


def test_non_bucket_paths_are_rejected(tmp_path: Path):
    # A local Windows path or an external URL is not a bucket object; using one
    # would either fail or pull an unvetted remote file into the render.
    for bad in ("C:\\music\\theme.mp3", "https://example.com/theme.mp3"):
        sb = _Sb([{"storage_path": bad}])
        assert rw._resolve_music_path(sb, "tenant-1", tmp_path) is None


def test_failed_download_degrades(tmp_path: Path):
    sb = _Sb([{"storage_path": "tenant-1/music/theme.mp3"}], dl_fail=True)
    assert rw._resolve_music_path(sb, "tenant-1", tmp_path) is None


def test_failed_query_degrades(tmp_path: Path):
    sb = _Sb([], query_fail=True)
    assert rw._resolve_music_path(sb, "tenant-1", tmp_path) is None


def test_empty_download_is_not_written(tmp_path: Path):
    sb = _Sb([{"storage_path": "tenant-1/music/theme.mp3"}], payload=b"")
    assert rw._resolve_music_path(sb, "tenant-1", tmp_path) is None
