# AICW Website Builder API Server
# Build from project root: docker build -f api-server/Dockerfile -t aicw-website-builder .

FROM node:20-slim

# Install required system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install wrangler globally for Cloudflare Pages deployment
RUN npm install -g wrangler

WORKDIR /app

# Copy API server package files and install dependencies
COPY api-server/package*.json ./
RUN npm ci --production

# Copy API server source code
COPY api-server/src ./src

# Copy Astro site templates
COPY templates ./templates

# Pre-install Astro template dependencies for faster builds
RUN cd templates/default && npm ci

# Create data directory
RUN mkdir -p /data/aicw_wb_data

# Build argument for git commit (set via --build-arg BUILD_COMMIT=$(git rev-parse --short HEAD))
ARG BUILD_COMMIT=dev
ENV BUILD_COMMIT=${BUILD_COMMIT}

# Set environment defaults
ENV PORT=4002
ENV NODE_ENV=production

# Expose the API port
EXPOSE 4002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:4002/health || exit 1

# Run the API server
CMD ["node", "src/server.js"]
