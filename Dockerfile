FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-cjk && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/copy-pdf-assets.mjs ./scripts/copy-pdf-assets.mjs
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-cjk ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/scripts/backup.ts ./scripts/backup.ts
RUN mkdir /app/data && chown -R node:node /app/data
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 DATA_DIR=/app/data
EXPOSE 3001
CMD ["node", "--import", "tsx", "server/index.ts"]
