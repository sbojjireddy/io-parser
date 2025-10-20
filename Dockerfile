# ===== Stage 1: Build frontend =====
FROM node:20-bullseye AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build  # -> /app/frontend/dist

# ===== Stage 2: Runtime (Node + Python) =====
FROM node:20-bullseye

# Install Python & pip (for PyMuPDF) and any OS deps you might need later
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip \
 && rm -rf /var/lib/apt/lists/*

# Install Python libs (PyMuPDF, etc.)
WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip3 install --no-cache-dir -r /app/requirements.txt

# Copy Python scripts
WORKDIR /app
COPY scripts/ ./scripts/

# Copy backend (we use tsx, no build needed)
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./

# Copy frontend build so backend can serve or reference it if needed
WORKDIR /app
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Optional: create ephemeral working dirs (won't persist across instances)
RUN mkdir -p /app/backend/data/{raw,extracted,parsed,combined,logs}

ENV NODE_ENV=production
ENV PORT=8080
# If your code calls Python by path, expose a conventional env too:
ENV PYTHON_PATH=/usr/bin/python3

EXPOSE 8080
# Ensure npm start runs your compiled JS, e.g., "node dist/server.js" in /app/backend
WORKDIR /app/backend
CMD ["npm", "start"]
