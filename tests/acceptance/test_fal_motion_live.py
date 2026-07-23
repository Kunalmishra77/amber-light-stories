"""Opt-in: makes a REAL fal.ai image + image-to-video call. Skips unless FAL_KEY
is set. Run: FAL_KEY=... pytest tests/acceptance/test_fal_motion_live.py -v -s
"""
import os
import tempfile
from pathlib import Path

import pytest

from pipeline.fal_adapter import generate_image, generate_motion


@pytest.mark.skipif(not os.environ.get("FAL_KEY"), reason="FAL_KEY not set")
def test_real_image_then_motion_produces_mp4_bytes():
    # First a real keyframe, written to a temp file.
    img = generate_image(
        {"subject": "a paper boat drifting on a calm pond, soft light"},
        "Medium",
        {"id": "acceptance", "model_routing": {}},
        dry=False,
    )
    with tempfile.TemporaryDirectory() as d:
        keyframe = Path(d) / "keyframe.png"
        keyframe.write_bytes(img["bytes"])

        clip = generate_motion(str(keyframe), "cheap", {"id": "acceptance", "model_routing": {}}, dry=False)

    data = clip["bytes"]
    assert isinstance(data, (bytes, bytearray)) and len(data) > 10000
    # ISO-BMFF/MP4 files carry an 'ftyp' box near the start.
    assert b"ftyp" in data[:64]
    assert clip["cost_usd"] > 0
    print(f"\n  motion clip {len(data)} bytes via {clip['meta']['model']}")
