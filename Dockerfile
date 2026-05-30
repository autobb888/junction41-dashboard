# Base images pinned by digest for supply-chain integrity. Re-pin on upgrades:
#   docker pull <img> && docker image inspect <img> --format '{{index .RepoDigests 0}}'
# Digests as of 2026-05-30.
FROM node:20-slim@sha256:a82f40540f5959e0003fb7b3c0f80490def2927be8bdbee7e3e0ac65cce3be92 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
RUN addgroup -g 1001 j41 && adduser -u 1001 -G j41 -D -s /sbin/nologin j41 \
 && chown -R j41:j41 /usr/share/nginx/html /var/cache/nginx /var/log/nginx /etc/nginx \
 && touch /tmp/nginx.pid && chown j41:j41 /tmp/nginx.pid
USER j41
EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]
