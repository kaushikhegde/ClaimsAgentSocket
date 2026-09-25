# One image, one process: build the React SPA, then serve it from the backend.

# 1) Build the frontend
FROM node:24-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# VITE_BACKEND_URL stays unset: the SPA calls /api on the same origin.
RUN npm run build

# 2) Backend runtime, serving the SPA from public/
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=frontend /frontend/dist ./public
# callFlow.js writes redacted session JSON here when the DB save fails.
RUN mkdir -p fallback && chown node:node fallback
USER node
EXPOSE 3000
CMD ["node", "src/index.js"]
