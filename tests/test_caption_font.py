from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT = Path("media/fonts/Mukta-Regular.ttf")
DEVANAGARI = "नमस्ते"  # नमस्ते


def _bright_pixels(font, text):
    img = Image.new("RGB", (700, 200), (0, 0, 0))
    ImageDraw.Draw(img).text((20, 60), text, font=font, fill=(255, 255, 255))
    return sum(1 for p in img.getdata() if p[0] > 200)


def test_bundled_font_present_and_valid():
    assert FONT.is_file(), "media/fonts/Mukta-Regular.ttf must be bundled"
    assert FONT.stat().st_size > 100_000


def test_font_renders_devanagari_and_latin():
    font = ImageFont.truetype(str(FONT), 60)
    assert _bright_pixels(font, DEVANAGARI) > 500, "Devanagari must render (glyphs, not boxes)"
    assert _bright_pixels(font, "Hello") > 500, "Latin must render"
    assert _bright_pixels(font, "") == 0, "control: empty string draws nothing"


def test_render_pipeline_picks_up_bundled_font():
    from pipeline.render import _default_font_file
    resolved = _default_font_file()
    assert resolved is not None and resolved.endswith("Mukta-Regular.ttf")


def test_executors_font_loads_from_bundle():
    from pipeline.executors import _font
    # _font() checks media/fonts/*.ttf first; it must return a usable font.
    font = _font(48)
    assert font is not None
