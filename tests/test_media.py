from pathlib import Path

from media.render import build_kenburns_command, make_still, make_thumbnail


def test_make_still_writes_1080p_png(tmp_path):
    out = make_still("A quiet evening by the sea.", tmp_path / "s1.png")
    from PIL import Image
    with Image.open(out) as im:
        assert im.size == (1920, 1080)


def test_make_thumbnail_720p(tmp_path):
    out = make_thumbnail("The Lighthouse Keeper", tmp_path / "thumb.png")
    from PIL import Image
    with Image.open(out) as im:
        assert im.size == (1280, 720)


def test_kenburns_command_structure(tmp_path):
    imgs = [tmp_path / "a.png", tmp_path / "b.png", tmp_path / "c.png"]
    cmd = build_kenburns_command(imgs, tmp_path / "voice.mp3", tmp_path / "out.mp4",
                                 seconds_per_image=8, fps=30)
    assert cmd[0] == "ffmpeg"
    assert cmd.count("-i") == 4  # 3 images + 1 audio
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "zoompan" in fc and "concat=n=3" in fc
    assert str(tmp_path / "out.mp4") == cmd[-1]
    assert "libx264" in cmd
