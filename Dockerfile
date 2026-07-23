# Render worker for Amber Light Stories — the durable `render.run` executor.
#
# This is NOT a web service. It runs 24/7 as a background worker: it polls the
# shared Supabase `jobs` table and produces the final MP4 with FFmpeg (which
# can't run on Vercel's serverless runtime). Deploy on Coolify as a "Dockerfile"
# resource with NO public domain/port.
#
# Required env vars (set in Coolify):
#   SUPABASE_URL                 your Supabase project URL
#   SUPABASE_SERVICE_ROLE_KEY    service-role key (server-side only)
# Optional:
#   STORAGE_DIR                  scratch dir for renders (defaults to /data/storage)
# Each client's own provider keys (OpenAI/Gemini/ElevenLabs/fal) are loaded PER
# JOB from the tenant Vault — they are NEVER set here.
FROM python:3.12-slim

# System deps: ffmpeg (render), DejaVu fonts (text-overlay fallback), CA certs.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        fonts-dejavu-core \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only the Python packages the worker needs (keeps the image lean; the
# Next.js `web/` app and local venv are excluded via .dockerignore).
COPY pyproject.toml ./
COPY app ./app
COPY ai ./ai
COPY apis ./apis
COPY media ./media
COPY pipeline ./pipeline

# Editable install so runtime file lookups (e.g. media/fonts) resolve against
# this source tree, and all dependencies from pyproject are pulled in.
RUN pip install --no-cache-dir -e .

# Ephemeral scratch space — final MP4s are uploaded to Supabase Storage, so no
# persistent volume is required.
ENV STORAGE_DIR=/data/storage
RUN mkdir -p /data/storage

# Poll forever, claiming ONLY render.run jobs (the web cron worker excludes them).
CMD ["python", "-m", "pipeline.render_worker", "--loop", "--interval", "10"]
