.PHONY: all infra infra-down infra-logs dev demo engine api replay probe probe-run console web www build test fmt clean help

API_GRPC_PORT       := 8080
API_HTTP_PORT       := 8081
ENGINE_METRICS_PORT := 9091
API_METRICS_PORT    := 9093
WEB_PORT            := 5173
KAFKA_PORT          := 9092
CLICKHOUSE_PORT     := 9000
NEO4J_PORT          := 7687

CLICKHOUSE_ADDR ?= localhost:9000
CLICKHOUSE_DB ?= kprobe
CLICKHOUSE_USER ?= kprobe
CLICKHOUSE_PASS ?= kprobe
NEO4J_BOLT ?= neo4j://localhost:7687
NEO4J_USER ?= neo4j
NEO4J_PASS ?= kprobe_secret
KAFKA_BROKERS ?= localhost:9092
KPROBE_API_TOKEN ?= dev-token
KPROBE_API_USER ?= admin
KPROBE_API_PASS ?= admin
KPROBE_JWT_SECRET ?= dev-secret-change-me

export CLICKHOUSE_ADDR CLICKHOUSE_DB CLICKHOUSE_USER CLICKHOUSE_PASS
export NEO4J_BOLT NEO4J_USER NEO4J_PASS KAFKA_BROKERS
export KPROBE_API_TOKEN KPROBE_API_USER KPROBE_API_PASS KPROBE_JWT_SECRET

infra:
	@echo "starting infrastructure..."
	docker compose -f infrastructure/docker/docker-compose.yml up -d --wait
	@echo "  kafka      -> localhost:$(KAFKA_PORT)"
	@echo "  clickhouse -> localhost:$(CLICKHOUSE_PORT)"
	@echo "  neo4j      -> localhost:$(NEO4J_PORT)"
	@echo "  jaeger     -> http://localhost:16686"
	@echo "  grafana    -> http://localhost:3000"

infra-down:
	@echo "stopping infrastructure..."
	docker compose -f infrastructure/docker/docker-compose.yml down
	@echo "done"

infra-logs:
	docker compose -f infrastructure/docker/docker-compose.yml logs -f

dev:
	@bash scripts/dev.sh

demo:
	@bash scripts/demo-events.sh

engine:
	@echo "starting causal engine (metrics on :$(ENGINE_METRICS_PORT))..."
	cd engine && go run .

api:
	@echo "starting api server (gRPC :$(API_GRPC_PORT), HTTP/WebSocket :$(API_HTTP_PORT), metrics :$(API_METRICS_PORT))..."
	cd api && go run .

replay:
	@echo "starting replay engine..."
	cd replay && go run .

probe:
	@echo "building eBPF probe..."
	cd probe && cargo build --release

probe-run:
	@echo "running eBPF probe (requires Linux and elevated privileges)..."
	cd probe && RUST_LOG=info cargo run --release

console:
	@echo "starting frontend on :$(WEB_PORT)..."
	cd console && pnpm dev

web: console

www:
	@echo "starting public site..."
	cd www && pnpm dev

build: build-engine build-api build-replay build-probe

build-engine:
	cd engine && go build -o bin/engine .

build-api:
	cd api && go build -o bin/api .

build-replay:
	cd replay && go build -o bin/replay .

build-probe:
	cd probe && cargo build --release

test: test-go test-rust

test-go:
	cd engine && go test ./...
	cd api && go test ./...
	cd replay && go test ./...
	cd shared && go test ./...

test-rust:
	cd probe && cargo test

fmt: fmt-go fmt-rust

fmt-go:
	gofmt -w engine/ api/ replay/ shared/

fmt-rust:
	cd probe && cargo fmt

clean:
	rm -rf engine/bin api/bin replay/bin
	cd probe && cargo clean

help:
	@echo ""
	@echo "  kprobe"
	@echo ""
	@echo "  local development:"
	@echo "    make dev            start infrastructure, engine, API, and console"
	@echo "    make demo           publish a demo incident through the real pipeline"
	@echo ""
	@echo "  infrastructure:"
	@echo "    make infra          start Kafka, ClickHouse, Neo4j, Vector, and observability"
	@echo "    make infra-down     tear down infrastructure"
	@echo "    make infra-logs     tail all infrastructure logs"
	@echo ""
	@echo "  services:"
	@echo "    make engine         start causal engine"
	@echo "    make api            start gRPC and HTTP/WebSocket API"
	@echo "    make replay         start replay engine"
	@echo "    make probe          build eBPF probe"
	@echo "    make probe-run      run eBPF probe on Linux"
	@echo "    make console        start React console"
	@echo "    make www            start Astro public site"
	@echo ""
	@echo "  build:"
	@echo "    make build          build all services"
	@echo "    make test           run all tests"
	@echo "    make fmt            format all code"
	@echo "    make clean          remove build artifacts"
