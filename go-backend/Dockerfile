# Native Linux build: SQLite is CGO, so keep the C toolchain and glibc runtime.
FROM golang:1.26.6-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server \
 && CGO_ENABLED=1 go build -trimpath -ldflags="-s -w" -o /out/migrate ./cmd/migrate \
 && CGO_ENABLED=1 go build -trimpath -ldflags="-s -w" -o /out/data ./cmd/data \
 && CGO_ENABLED=1 go build -trimpath -ldflags="-s -w" -o /out/seed ./cmd/seed

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -g 10001 befull \
 && useradd -u 10001 -g befull -d /app -s /usr/sbin/nologin befull \
 && mkdir -p /app/uploads \
 && chown -R befull:befull /app
WORKDIR /app
COPY --from=build /out/ /usr/local/bin/
USER befull
ENV HTTP_ADDR=0.0.0.0:8080 STORAGE_DRIVER=local UPLOAD_DIR=/app/uploads
EXPOSE 8080
ENTRYPOINT ["server"]
