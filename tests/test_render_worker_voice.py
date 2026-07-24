import os

import pipeline.render_worker as rw


def _patch_credentials(monkeypatch, mapping):
    """Make _resolve_tenant_credential return mapping[provider] (or None)."""
    monkeypatch.setattr(rw, "_resolve_tenant_credential",
                        lambda sb, tenant_id, provider: mapping.get(provider))


def test_apply_tenant_env_sets_chosen_voice(monkeypatch):
    _patch_credentials(monkeypatch, {"elevenlabs": "el-key", "elevenlabs_voice": "VOICE_XYZ"})
    monkeypatch.delenv("ELEVENLABS_VOICE_ID", raising=False)
    saved, _live = rw._apply_tenant_env(object(), "tenant-1")
    try:
        assert os.environ["ELEVENLABS_VOICE_ID"] == "VOICE_XYZ"
        assert "ELEVENLABS_VOICE_ID" in saved
    finally:
        rw._restore_env(saved)


def test_apply_tenant_env_falls_back_to_default_voice(monkeypatch):
    _patch_credentials(monkeypatch, {})  # nothing stored
    monkeypatch.delenv("ELEVENLABS_VOICE_ID", raising=False)
    saved, _live = rw._apply_tenant_env(object(), "tenant-1")
    try:
        assert os.environ["ELEVENLABS_VOICE_ID"] == rw.DEFAULT_VOICE_ID
    finally:
        rw._restore_env(saved)


def test_restore_env_reverts_voice(monkeypatch):
    _patch_credentials(monkeypatch, {"elevenlabs_voice": "VOICE_XYZ"})
    monkeypatch.setenv("ELEVENLABS_VOICE_ID", "ORIGINAL")
    saved, _live = rw._apply_tenant_env(object(), "tenant-1")
    assert os.environ["ELEVENLABS_VOICE_ID"] == "VOICE_XYZ"
    rw._restore_env(saved)
    assert os.environ["ELEVENLABS_VOICE_ID"] == "ORIGINAL"
