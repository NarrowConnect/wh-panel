# Stage 1: Build binary
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Disable sumdb proxy check
ENV GOSUMDB=off

# Install ca-certificates and git
RUN apk add --no-cache ca-certificates git

# Copy source code
COPY . .

# Download dependencies
RUN rm -f go.sum && go mod download

# Build static binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s" \
    -o /app/bin/wh-panel ./cmd/api

# Stage 2: Final minimal image
FROM alpine:3.19

WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata wget curl

# Copy binary from builder
COPY --from=builder /app/bin/wh-panel /app/wh-panel

# Copy migrations and docs
COPY --from=builder /app/migrations /app/migrations
COPY --from=builder /app/docs /app/docs

# Create required directories
RUN mkdir -p /app/uploads && \
    addgroup -S appgroup && \
    adduser -S appuser -G appgroup && \
    chown -R appuser:appgroup /app

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

ENTRYPOINT ["/app/wh-panel"]
