# ── Stage 1: Build Vite Frontend ─────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install dependencies (including devDependencies required for Vite build)
RUN npm ci

# Copy frontend source files and configuration
COPY index.html vite.config.js eslint.config.js ./
COPY public ./public
COPY src ./src

# Build production bundle (outputs to /app/dist)
RUN npm run build

# ── Stage 2: Production Server Runtime ───────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080

# Copy package manifests and install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy backend server code and data
COPY server ./server

# Copy compiled frontend from builder stage
COPY --from=builder /app/dist ./dist

# Ensure permissions are compatible with OpenShift arbitrary non-root UIDs
RUN chown -R 1001:0 /app && chmod -R g=u /app

USER 1001

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health || exit 1

CMD ["node", "server/index.js"]
