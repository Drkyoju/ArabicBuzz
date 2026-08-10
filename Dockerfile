# ArabicBuzz — CranL production image (Next.js standalone + Prisma)
# Binds 0.0.0.0:$PORT (default 3000). Do not commit secrets; use CranL env.
# build-bust: telegram-ack-dedupe-c676262

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Optional build-time inlining when the host passes them as build args.
# CranL runtime env still works via layout + /api/public-config fallback.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
# LibreOffice (free/OSS) for high-fidelity Word↔PDF.
# Default OFF on CranL (thin image) after LO-enabled builds failed on the host.
# Opt in: docker build --build-arg INSTALL_LIBREOFFICE=1
# Free convert without LO: Google Drive OAuth (drive.file).
# Do NOT bake PaddleOCR into this image (multi-GB). Use PADDLE_OCR_URL sidecar
# (deploy/paddle-ocr) or ENABLE_PADDLE_OCR=1 only where paddleocr is already installed.
ARG INSTALL_LIBREOFFICE=0
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && if [ "$INSTALL_LIBREOFFICE" = "1" ]; then \
       apt-get install -y --no-install-recommends \
         libreoffice-writer-nogui libreoffice-calc-nogui \
         fonts-noto-core fonts-noto-ui-core fonts-noto-extra \
         fonts-dejavu-core fonts-liberation fonts-freefont-ttf; \
     else \
       apt-get install -y --no-install-recommends fonts-noto-core fonts-noto-ui-core || true; \
     fi \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Surfaced by /api/health/free — binary still verified at runtime via soffice.
ENV AB_LIBREOFFICE_IMAGE=$INSTALL_LIBREOFFICE

COPY --from=builder /app/public ./public
# Ensure Noto Naskh Arabic TTF is present for PDF text/sticky burn-in
# (also served via /api/fonts/arabic and /fonts/*).
COPY --from=builder /app/public/fonts ./public/fonts
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Prisma engines + schema for runtime generate safety / migrations tooling
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

USER nextjs
EXPOSE 3000

# Prefer /api/health/live; fall back to /api/health/free for older images mid-rollout.
HEALTHCHECK --interval=15s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "(async()=>{const p=process.env.PORT||3000;for(const u of['/api/health/live','/api/health/free']){try{const r=await fetch('http://127.0.0.1:'+p+u);if(r.ok)process.exit(0)}catch{}}process.exit(1)})()"

CMD ["node", "server.js"]
