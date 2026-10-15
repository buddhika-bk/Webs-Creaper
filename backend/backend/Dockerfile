FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd -r app && useradd -r -g app app && mkdir -p /app/storage/exports && chown -R app:app /app
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --chown=app:app database ./database
COPY --chown=app:app package.json ./
USER app
EXPOSE 4000
CMD ["node", "dist/server.js"]
