# Stage 1: Build React Frontend SPA
FROM node:20-alpine AS web-builder

WORKDIR /app/web

COPY web/package.json ./
RUN npm install

COPY web/ ./
RUN npm run build

# Stage 2: Build Go static binary
FROM golang:1.22-alpine AS go-builder

WORKDIR /app

RUN apk add --no-cache ca-certificates git

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s" \
    -o /app/bin/wh-panel ./cmd/api

# Stage 3: Final minimal image for Easypanel
FROM alpine:3.19

WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata wget curl

# Copy Go binary
COPY --from=go-builder /app/bin/wh-panel /app/wh-panel

# Copy migrations and API docs
COPY --from=go-builder /app/migrations /app/migrations
COPY --from=go-builder /app/docs /app/docs

# Copy built React frontend SPA
COPY --from=web-builder /app/web/dist /app/web/dist

# Setup user and permissions
RUN mkdir -p /app/uploads && \
    addgroup -S appgroup && \
    adduser -S appuser -G appgroup && \
    chown -R appuser:appgroup /app

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

ENTRYPOINT ["/app/wh-panel"]
