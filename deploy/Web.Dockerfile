FROM node:24-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web/ apps/web/
RUN pnpm build

FROM caddy:2-alpine
ENV XDG_DATA_HOME=/tmp XDG_CONFIG_HOME=/tmp
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist/ /srv/
USER 10001:10001
EXPOSE 8080
