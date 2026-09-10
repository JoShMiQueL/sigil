# Multi-stage build for SigilPanel daemon
FROM golang:1.27-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build
RUN CGO_ENABLED=0 go build -o /bin/daemon ./cmd/daemon/

# Runtime stage
FROM alpine:3.21

RUN apk add --no-cache ca-certificates docker-cli

COPY --from=builder /bin/daemon /usr/local/bin/daemon

ENTRYPOINT ["daemon"]
CMD ["--config", "/etc/sigilpanel/daemon.yaml"]
