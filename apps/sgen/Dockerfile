# Sgen Service Dockerfile
# Build from monorepo root: docker build -f apps/sgen/Dockerfile -t sgen .
#
# This service uses npm workspaces with @blogpostgen/types as a local dependency.
# The Dockerfile handles workspace linking correctly.

FROM node:20-slim

# Install required system dependencies including Chromium for Puppeteer
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    # Chromium dependencies for Puppeteer
    libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
    libxext6 libxi6 libxtst6 libnss3 libcups2 libxss1 libxrandr2 \
    libasound2 libpangocairo-1.0-0 libatk1.0-0 libatk-bridge2.0-0 \
    libgtk-3-0 libgbm1 \
    fonts-liberation fonts-noto-color-emoji \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Build arguments for version tracking
ARG GIT_COMMIT_SHA=unknown
ARG BUILD_TIME=unknown

ENV VERSION_COMMIT=$GIT_COMMIT_SHA \
    VERSION_BUILD_TIME=$BUILD_TIME

WORKDIR /app

# Copy root package files first (for npm workspaces)
COPY package*.json ./

# Copy workspace package.json files (for dependency resolution)
COPY packages/types/package*.json ./packages/types/
COPY packages/og-image-gen/package*.json ./packages/og-image-gen/
COPY apps/sgen/package*.json ./apps/sgen/

# Install all dependencies from root (npm workspaces handles linking)
RUN npm ci

# Copy source code
COPY packages/types ./packages/types
COPY packages/og-image-gen ./packages/og-image-gen
COPY apps/sgen ./apps/sgen

# Build in dependency order
RUN npm run build --workspace=@blogpostgen/types
RUN npm run build --workspace=@blogpostgen/og-image-gen
RUN npm run build --workspace=sgen

# Prune dev dependencies for smaller image
RUN npm prune --production --workspace=sgen && npm cache clean --force

# Set working directory for runtime
WORKDIR /app/apps/sgen

# Expose the service port
EXPOSE 3001

# Set environment defaults
ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Run the service
CMD ["node", "dist/index.js"]
