# Vite bakes VITE_* variables into the bundle at build time, not read at
# container start — so they arrive as build args, not as environment
# variables on the running container. See docker-compose.yml for the values.
FROM node:22-alpine AS build
WORKDIR /src

# Dependencies first, so editing application code does not invalidate this
# layer and re-run npm ci.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL=/api/v1
ARG VITE_YANDEX_MAPS_API_KEY=
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_YANDEX_MAPS_API_KEY=${VITE_YANDEX_MAPS_API_KEY}
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime: nginx serving the built static files, and proxying /api and
# /uploads to the backend so the browser only ever talks to one origin — no
# CORS configuration needed for a deployment that looks like this one.
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html

EXPOSE 80
