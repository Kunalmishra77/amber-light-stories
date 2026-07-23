# Web app (Next.js 16) for Coolify — the SaaS control plane: login, admin,
# client onboarding, dashboards, cron endpoints. Multi-stage build: compile
# with full deps, then run the lean standalone server on port 3000.
FROM node:22-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM base AS build
# NEXT_PUBLIC_* are inlined into the BROWSER bundle at build time, so they must
# exist here. Defaults are the PUBLIC Supabase URL + anon key (safe to ship —
# they already reach every browser; data access is guarded by RLS). Override
# via Coolify "Build Variable" env vars if ever needed.
ARG NEXT_PUBLIC_SUPABASE_URL=https://buegzxeaqlgsaobyatzq.supabase.co
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1ZWd6eGVhcWxnc2FvYnlhdHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMTgzNzAsImV4cCI6MjA5OTc5NDM3MH0.948_CV7u0PV_AIdVoSrfUoJAhUi-yhGDoGVuFb7D5a0
ARG NEXT_PUBLIC_APP_URL=https://yt-automation.aiagentixdev.com
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NODE_OPTIONS=--max-old-space-size=4096
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# Standalone server + static assets + public dir.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
