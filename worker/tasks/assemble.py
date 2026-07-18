import subprocess
from math import ceil

from app.config import storage_path
from app.state import record_job, set_video_status
from media.render import build_kenburns_command, probe_audio_duration
from worker.celery_app import celery_app
from worker.tasks.base import PipelineTask


@celery_app.task(base=PipelineTask, bind=True, name="worker.tasks.assemble.assemble")
def assemble(self, video_id: str) -> str:
    set_video_status(video_id, "rendering")
    out_dir = storage_path(video_id)
    image_paths = sorted(out_dir.glob("img_*.png"))
    audio_path = out_dir / "voice.mp3"
    final_path = out_dir / "final.mp4"
    if not image_paths:
        raise ValueError(f"no images found for video {video_id}; cannot assemble")
    duration = probe_audio_duration(audio_path)
    seconds_per_image = max(1, ceil(duration / len(image_paths)))
    cmd = build_kenburns_command(image_paths, audio_path, final_path,
                                 seconds_per_image=seconds_per_image)
    subprocess.run(cmd, check=True, capture_output=True)
    set_video_status(video_id, "rendering", storage_key=str(final_path))
    record_job(video_id, "assemble", "done")
    return video_id
