# =========================================================================
# AI NEWS VIDEO GENERATOR — PRODUCTION DOCKERFILE
# Node.js 22 + FFmpeg + Python Edge-TTS Neural Speech Engine
# =========================================================================

FROM node:22-bookworm-slim

# Install system dependencies: FFmpeg, FFprobe, Python, pip, and fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    python3-setuptools \
    fonts-dejavu-core \
    fonts-freefont-ttf \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Edge-TTS CLI into system path
RUN pip3 install --no-cache-dir --break-system-packages edge-tts

# Set working directory
WORKDIR /app

# Copy root and backend package manifests
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install root dependencies
RUN npm install --omit=dev

# Install backend dependencies
RUN npm --prefix backend install --omit=dev

# Copy application code and assets
COPY backend ./backend
COPY frontend ./frontend

# Create persistent outputs and temp storage directories
RUN mkdir -p backend/outputs backend/temp backend/assets/fallback

# Set environment defaults
ENV NODE_ENV=production
ENV PORT=5000

# Expose server port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# Start the application
CMD ["npm", "start"]
