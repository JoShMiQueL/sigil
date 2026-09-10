.PHONY: build test test-integration test-all lint vet clean

build:
	go build -o bin/daemon ./cmd/daemon/

test:
	go test ./internal/... -v -short

test-integration:
	go test ./internal/... -v -tags integration -timeout 120s

test-all:
	go test ./internal/... -v -tags integration -timeout 120s

lint:
	go vet ./...

vet:
	go vet ./...

clean:
	rm -rf bin/
