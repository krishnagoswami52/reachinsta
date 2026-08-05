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

ENV VITE_PADDLE_CLIENT_TOKEN=$VITE_PADDLE_CLIENT_TOKEN
ENV VITE_PADDLE_ENVIRONMENT=$VITE_PADDLE_ENVIRONMENT
ENV VITE_PADDLE_PRICE_PLUS=$VITE_PADDLE_PRICE_PLUS
ENV VITE_PADDLE_PRICE_PRO=$VITE_PADDLE_PRICE_PRO

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
