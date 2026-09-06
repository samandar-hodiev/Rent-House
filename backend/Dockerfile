# Built once, run as any of four binaries — see docker-compose.yml, which
# picks the entrypoint per service. One image rather than four keeps the
# layers (and the rebuild) shared between the one-shot migrate/seed/admin
# steps and the long-running server.
FROM golang:1.25-alpine AS build
WORKDIR /src

# Dependencies first, so editing application code does not invalidate this
# layer and re-download every module.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# CGO off: the only database driver here is pure Go, and a static binary is
# what makes the runtime stage below able to skip glibc entirely.
ENV CGO_ENABLED=0 GOOS=linux
RUN go build -o /out/server ./cmd/server && \
    go build -o /out/migrate ./cmd/migrate && \
    go build -o /out/seed ./cmd/seed && \
    go build -o /out/admin ./cmd/admin

# ---------------------------------------------------------------------------
# Runtime: no Go toolchain, no source, nothing that was only needed to build.
FROM alpine:3.20
# CA certificates for outbound HTTPS — Resend and Eskiz are called over it.
# tzdata so a deployment outside UTC can still set TZ correctly.
RUN apk add --no-cache ca-certificates tzdata && \
    adduser -D -u 10001 renthouse

WORKDIR /app
COPY --from=build /out/server /out/migrate /out/seed /out/admin ./

# Where uploaded listing photographs land — see internal/storage and
# UPLOAD_DIR. A volume is mounted here in docker-compose.yml so they survive a
# container being recreated.
RUN mkdir -p /app/uploads && chown -R renthouse:renthouse /app
USER renthouse

EXPOSE 8080
ENTRYPOINT ["/app/server"]
