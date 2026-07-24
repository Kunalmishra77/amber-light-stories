"""Local render scratch reclamation.

The worker runs for months on one VPS. Every run leaves a directory of
intermediate keyframes, motion clips and audio behind, so without this sweep
the disk fills and renders start failing. The rule that matters: it must never
be able to delete a run that is still in flight, and it must never take the
worker down.
"""
import time

import pipeline.render_worker as rw


class _Settings:
    def __init__(self, storage_dir):
        self.storage_dir = str(storage_dir)


def _use_storage(monkeypatch, tmp_path):
    monkeypatch.setattr(rw, "get_settings", lambda: _Settings(tmp_path))
    return tmp_path / "renders"


def _run_dir(renders, name, age_hours):
    d = renders / name
    d.mkdir(parents=True)
    (d / "keyframe.png").write_bytes(b"x" * 32)
    stamp = time.time() - age_hours * 3600
    import os

    os.utime(d, (stamp, stamp))
    return d


def test_removes_directories_past_the_age_floor(monkeypatch, tmp_path):
    renders = _use_storage(monkeypatch, tmp_path)
    old = _run_dir(renders, "run-old", 48)

    assert rw.sweep_render_scratch(referenced=set())["removed"] == 1
    assert not old.exists()


def test_keeps_a_directory_an_asset_row_still_points_into(monkeypatch, tmp_path):
    # Keyframes are recorded with their local path inside the run dir and
    # reused for weeks. Deleting one turns a free reuse into a paid
    # regeneration — age alone is NOT enough to call a directory garbage.
    renders = _use_storage(monkeypatch, tmp_path)
    cached = _run_dir(renders, "run-cached", 400)

    swept = rw.sweep_render_scratch(referenced={"run-cached"})

    assert swept == {"removed": 0, "kept": 1, "failed": 0}
    assert (cached / "keyframe.png").exists()


def test_deletes_nothing_when_the_references_cannot_be_read(monkeypatch, tmp_path):
    renders = _use_storage(monkeypatch, tmp_path)
    old = _run_dir(renders, "run-old", 400)

    class _Boom:
        def table(self, _n):
            raise RuntimeError("database unreachable")

    swept = rw.sweep_render_scratch(sb=_Boom())

    assert swept["skipped"] == "references unknown"
    assert swept["removed"] == 0
    assert old.exists()


def test_reference_lookup_matches_paths_from_any_host(monkeypatch, tmp_path):
    # The row was written by whichever machine rendered it, so the stored path
    # may use either separator and a different storage root than this worker.
    rows = [
        {"storage_path": r"E:\other\storage\renders\run-win\scene_00_keyframe.png"},
        {"storage_path": "/data/storage/renders/run-nix/scene_01_motion.mp4"},
    ]

    class _Q:
        def select(self, *_a, **_k):
            return self

        def order(self, *_a, **_k):
            return self

        def range(self, start, _end):
            return _Res(rows if start == 0 else [])

    class _Res:
        def __init__(self, data):
            self._data = data

        def execute(self):
            return self

        @property
        def data(self):
            return self._data

    class _Sb:
        def table(self, _n):
            return _Q()

    parts = rw.referenced_path_parts(_Sb())
    assert "run-win" in parts and "run-nix" in parts


def test_a_symlinked_run_directory_is_never_followed(monkeypatch, tmp_path):
    renders = _use_storage(monkeypatch, tmp_path)
    real = _run_dir(renders, "run-real", 400)
    link = renders / "run-link"
    try:
        link.symlink_to(real, target_is_directory=True)
    except (OSError, NotImplementedError):
        import pytest

        pytest.skip("symlinks need elevation on this platform")

    def _boom(_p):
        raise AssertionError("must never rmtree through a symlink")

    monkeypatch.setattr(rw.shutil, "rmtree", _boom)
    rw.sweep_render_scratch(referenced={"run-real"})
    assert real.exists()


def test_never_touches_a_run_still_in_flight(monkeypatch, tmp_path):
    renders = _use_storage(monkeypatch, tmp_path)
    # A render that started ten minutes ago — the exact case a naive sweep
    # would destroy mid-write.
    fresh = _run_dir(renders, "run-live", 0.16)

    swept = rw.sweep_render_scratch(referenced=set())

    assert swept == {"removed": 0, "kept": 1, "failed": 0}
    assert (fresh / "keyframe.png").exists()


def test_boundary_keeps_a_run_exactly_at_the_cutoff(monkeypatch, tmp_path):
    renders = _use_storage(monkeypatch, tmp_path)
    d = _run_dir(renders, "run-edge", 24)
    # Pin `now` so the assertion can't flake on clock drift between the
    # utime() call and the sweep.
    swept = rw.sweep_render_scratch(referenced=set(), now=d.stat().st_mtime + 24 * 3600)
    assert swept["kept"] == 1
    assert d.exists()


def test_missing_storage_directory_is_a_no_op(monkeypatch, tmp_path):
    _use_storage(monkeypatch, tmp_path)  # never created
    assert rw.sweep_render_scratch(referenced=set()) == {"removed": 0, "kept": 0, "failed": 0}


def test_a_stray_file_beside_the_run_dirs_is_left_alone(monkeypatch, tmp_path):
    renders = _use_storage(monkeypatch, tmp_path)
    renders.mkdir(parents=True)
    stray = renders / "notes.txt"
    stray.write_text("not a run")
    import os

    old = time.time() - 72 * 3600
    os.utime(stray, (old, old))

    assert rw.sweep_render_scratch(referenced=set())["removed"] == 0
    assert stray.exists()


def test_an_undeletable_directory_is_counted_not_raised(monkeypatch, tmp_path):
    renders = _use_storage(monkeypatch, tmp_path)
    _run_dir(renders, "run-locked", 48)

    def _boom(_path):
        raise OSError("in use")

    monkeypatch.setattr(rw.shutil, "rmtree", _boom)

    # Housekeeping failing must not propagate into the poll loop.
    assert rw.sweep_render_scratch(referenced=set()) == {"removed": 0, "kept": 0, "failed": 1}
