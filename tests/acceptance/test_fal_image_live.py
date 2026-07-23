"""Opt-in: makes a REAL fal.ai image call. Skips unless FAL_KEY is set.
Run with: FAL_KEY=... pytest tests/acceptance/test_fal_image_live.py -v -s
"""
import os

import pytest

from pipeline.fal_adapter import generate_image


@pytest.mark.skipif(not os.environ.get("FAL_KEY"), reason="FAL_KEY not set")
def test_real_flux_image_generates_png_bytes():
    result = generate_image(
        {"subject": "a cozy reading nook by a rainy window, warm light"},
        "Medium",
        {"id": "acceptance", "model_routing": {}},
        dry=False,
    )
    data = result["bytes"]
    assert isinstance(data, (bytes, bytearray)) and len(data) > 1000
    # PNG magic number, since we request output_format=png
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    assert result["cost_usd"] > 0
    print(f"\n  generated {len(data)} bytes via {result['meta']['model']}")
