# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/build ./build
COPY --from=build /app/package*.json ./
COPY --from=build /app/db ./db
RUN npm ci --omit=dev
EXPOSE 3000
# Migrations run on every container start (same network path that already
# proven to reach Postgres via /healthz). db/migrate.js is idempotent, so
# a scale-from-zero cold start after the first successful run is a no-op.
CMD ["sh", "-c", "node db/migrate.js && node build"]
