# syntax=docker/dockerfile:1

# Node 22.13+ is required for node:sqlite; 24 is the stable home for it.
ARG NODE_VERSION=24-slim

# ---- build ----------------------------------------------------------------
FROM node:${NODE_VERSION} AS build
WORKDIR /app

# Manifests first so the dependency layer is cached independently of source.
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci

COPY . .
RUN npm run build

# ---- runtime --------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
# No native modules anywhere in the tree, so there is nothing to compile here.
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist
COPY sample-data ./sample-data

# The SQLite file lives on a mounted volume, not in the image layer.
ENV DATABASE_PATH=/data/flowcalls.db
ENV HOST=0.0.0.0
ENV PORT=8080
RUN mkdir -p /data && chown -R node:node /data /app

USER node
EXPOSE 8080

# Refuses to start without APP_PASSWORD on a non-loopback bind, so an
# unauthenticated container cannot reach the internet by accident.
CMD ["node", "server/dist/index.js"]
