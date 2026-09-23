# ── Production Server Runtime ───────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production \
  PORT=8080

# Copy package manifests and install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy backend server code and data
COPY server ./server

# Copy pre-compiled frontend bundle (built in CI Stage 1)
COPY dist ./dist

# Ensure permissions are compatible with OpenShift arbitrary non-root UIDs
RUN chown -R 1001:0 /app && chmod -R g=u /app

USER 1001

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health || exit 1

CMD ["node", "server/index.js"]
