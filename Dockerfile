# ---------- Build stage ----------
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .

# Build-time VITE_ vars (frontend mein inject hote hain)
ARG VITE_PADDLE_CLIENT_TOKEN
ARG VITE_PADDLE_ENVIRONMENT
ARG VITE_PADDLE_PRICE_PLUS
ARG VITE_PADDLE_PRICE_PRO
ARG VITE_TURNSTILE_SITE_KEY

ENV VITE_PADDLE_CLIENT_TOKEN=$VITE_PADDLE_CLIENT_TOKEN
ENV VITE_PADDLE_ENVIRONMENT=$VITE_PADDLE_ENVIRONMENT
ENV VITE_PADDLE_PRICE_PLUS=$VITE_PADDLE_PRICE_PLUS
ENV VITE_PADDLE_PRICE_PRO=$VITE_PADDLE_PRICE_PRO
# Vite inlines this at build time. If it is missing here the signup widget
# never renders and — since the server fails closed — signup breaks entirely.
# Putting it only in the VPS .env is not enough; that is runtime, this is build.
ENV VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY

# Builds both frontend (dist/public) and backend (dist/index.cjs)
RUN npm run build

# ---------- Production stage ----------
FROM node:20-alpine
WORKDIR /app

# CRITICAL: Analytics depend on UTC. DO NOT change to Asia/Kolkata.
# posted_at is stored as UTC wall-clock in a timestamp-without-timezone column;
# the pg driver parses it in the process's local TZ, so a non-UTC container
# would shift every timestamp served to users (see docs/analytics-timezone-diagnostic.md).
ENV TZ=UTC

# Sirf production deps
COPY package*.json ./
RUN npm ci --legacy-peer-deps --omit=dev

# Built artifacts copy
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.cjs"]
