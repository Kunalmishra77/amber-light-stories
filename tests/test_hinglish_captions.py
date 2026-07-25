"""Captions burn in Roman (Hinglish), not Devanagari.

ffmpeg's drawtext has no Indic shaping, so Hindi captions came out mangled
("सिर्फ" -> "सर्फ"). The narration audio must stay Hindi; only the on-screen
caption is transliterated. These pin both halves of that contract.
"""
import pipeline.render as render
from pipeline.translit import to_hinglish, has_devanagari


def test_common_words_read_naturally():
    assert to_hinglish("एक रोटी") == "ek rotee"
    assert to_hinglish("आज से अभी से") == "aaj se abhee se"


def test_english_passes_through_untouched():
    assert to_hinglish("Hello World 2024") == "Hello World 2024"


def test_detects_devanagari():
    assert has_devanagari("सिर्फ") is True
    assert has_devanagari("sirf") is False
    assert has_devanagari("") is False


def test_render_command_burns_the_roman_caption_not_devanagari():
    cmd = " ".join(
        render.build_render_command(
            ["clip.mp4"], "voice.m4a", "out.mp4",
            subtitles=[(0.0, 2.0, "एक रोटी")],
        )
    )
    # The Roman caption is in the drawtext filter...
    assert "ek rotee" in cmd
    # ...and no Devanagari survives into the burned text.
    assert not has_devanagari(cmd)


def test_english_caption_is_left_as_written():
    cmd = " ".join(
        render.build_render_command(
            ["clip.mp4"], "voice.m4a", "out.mp4",
            subtitles=[(0.0, 2.0, "The Last Roti")],
        )
    )
    assert "The Last Roti" in cmd
