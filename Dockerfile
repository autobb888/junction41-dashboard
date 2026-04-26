FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
RUN addgroup -g 1001 j41 && adduser -u 1001 -G j41 -D -s /sbin/nologin j41 \
 && chown -R j41:j41 /usr/share/nginx/html /var/cache/nginx /var/log/nginx /etc/nginx \
 && touch /tmp/nginx.pid && chown j41:j41 /tmp/nginx.pid
USER j41
EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]
