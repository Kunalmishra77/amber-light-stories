"""Visual-engine benchmark for the v3 cinematic short-form pipeline (robust).

  1. canonical character reference (Flux)
  2. 3 scene keyframes keeping the character consistent (fixed seed + descriptor)
  3. 2 keyframes animated into short motion clips (image-to-video, model fallback)

Prints per-step progress (run with python -u) and where files land.

Run:
    set FAL_KEY=...   then   .venv\\Scripts\\python -u scripts\\benchmark_visuals.py
"""
import os
import sys
import time
import urllib.request
from pathlib import Path

import fal_client

IMAGE_MODEL = "fal-ai/flux/dev"
# try these image-to-video models in order until one works:
I2V_MODELS = [
    "fal-ai/kling-video/v2/master/image-to-video",
    "fal-ai/kling-video/v1.6/standard/image-to-video",
    "fal-ai/minimax/hailuo-02/standard/image-to-video",
    "fal-ai/ltx-video-13b-distilled/image-to-video",
    "fal-ai/wan-i2v",
]
CHAR_SEED = 77777

OUT = Path("storage/_benchmark")
OUT.mkdir(parents=True, exist_ok=True)

CHARACTER = (
    "A weathered lighthouse keeper in his 60s, silver beard, deep-set kind eyes, "
    "thick cream wool turtleneck sweater, weathered navy coat, ruddy cheeks, "
    "cinematic portrait photography, soft rim light, film grain"
)
SCENES = [
    "standing at the top of a lighthouse at dusk holding an old brass lantern, "
    "cinematic wide shot, warm amber light, melancholic mood",
    "reading an old letter by candlelight, close-up on his surprised face, "
    "shallow depth of field, warm interior glow",
    "looking out at a stormy sea at night, dramatic lightning, "
    "cinematic wide shot, cold blue tones",
]


def log(m): print(m, flush=True)
def dl(url, path): urllib.request.urlretrieve(url, path); return path


def first_url(res, key):
    v = res.get(key)
    if isinstance(v, list):
        return v[0]["url"] if isinstance(v[0], dict) else v[0]
    return v["url"] if isinstance(v, dict) else v


def flux(prompt, seed):
    r = fal_client.subscribe(IMAGE_MODEL, arguments={
        "prompt": prompt, "image_size": "portrait_16_9",
        "num_images": 1, "num_inference_steps": 28, "seed": seed,
    })
    return first_url(r, "images")


def main():
    if not os.environ.get("FAL_KEY"):
        raise SystemExit("Set FAL_KEY first.")
    t0 = time.time()

    log("== 1/3 character reference (Flux) ==")
    ref_url = flux(CHARACTER + ", neutral studio background, head and shoulders", CHAR_SEED)
    dl(ref_url, OUT / "character_ref.png")
    log("   done -> character_ref.png")

    log("== 2/3 three consistent scene keyframes ==")
    keyframes = []
    for i, scene in enumerate(SCENES):
        url = flux(f"{CHARACTER}. Scene: {scene}. vertical 9:16 cinematic film still", CHAR_SEED)
        dl(url, OUT / f"scene_{i:02d}.png")
        keyframes.append(url)
        log(f"   scene {i} done -> scene_{i:02d}.png")

    log("== 3/3 animate 2 keyframes into motion clips (image-to-video) ==")
    working = None
    for i in (0, 2):
        for model in ([working] if working else I2V_MODELS):
            try:
                log(f"   scene {i}: trying {model} ...")
                r = fal_client.subscribe(model, arguments={
                    "image_url": keyframes[i], "prompt": SCENES[i], "duration": "5",
                })
                vurl = first_url(r, "video")
                dl(vurl, OUT / f"scene_{i:02d}_motion.mp4")
                working = model
                log(f"   scene {i} MOTION done ({model}) -> scene_{i:02d}_motion.mp4")
                break
            except Exception as e:
                log(f"     {model} failed: {str(e)[:90]}")
        else:
            log(f"   scene {i}: no image-to-video model worked; keyframe still usable")

    log(f"\nDONE in {time.time()-t0:.0f}s. Folder: {OUT.resolve()}")
    log("Check fal.ai -> Settings -> Credits for exact spend.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"FATAL: {e}"); sys.exit(1)
