FROM node:22-bookworm-slim AS build

WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@10.18.2 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY tools ./tools

RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM nginx:1.27-alpine AS shell

COPY docker/nginx/spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/shell/dist /usr/share/nginx/html

FROM nginx:1.27-alpine AS people

COPY docker/nginx/spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/people/dist /usr/share/nginx/html

FROM nginx:1.27-alpine AS delivery

COPY docker/nginx/spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/delivery/dist /usr/share/nginx/html

FROM nginx:1.27-alpine AS gateway

COPY docker/gateway/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/gateway/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]

FROM node:22-bookworm-slim AS api

WORKDIR /app

COPY --from=build /repo/apps/api/dist ./dist
COPY fixtures/baseline-seed.json ./fixtures/baseline-seed.json

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_FILE=/data/baseline-store.json
ENV SEED_FILE=/app/fixtures/baseline-seed.json

EXPOSE 3000

CMD ["node", "dist/server.mjs"]
