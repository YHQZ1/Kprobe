.PHONY: all infra infra-down infra-logs engine api replay probe probe-run web build test fmt clean help

API_PORT        := 8080
ENGINE_PORT     := 8081
REPLAY_PORT     := 8082
WEB_PORT        := 5173
KAFKA_PORT      := 9092
CLICKHOUSE_PORT := 9000
NEO4J_PORT      := 7687

infra:
	@echo "starting infrastructure..."
	docker compose -f infrastructure/docker/docker-compose.yml up -d
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

engine:
	@echo "starting causal engine on :$(ENGINE_PORT)..."
	cd engine && go run .

api:
	@echo "starting api server on :$(API_PORT)..."
	cd api && go run .

replay:
	@echo "starting replay engine on :$(REPLAY_PORT)..."
	cd replay && go run .

probe:
	@echo "building eBPF probe..."
	cd probe && cargo build --release

probe-run:
	@echo "running eBPF probe (requires sudo)..."
	cd probe && RUST_LOG=info cargo run --release

web:
	@echo "starting frontend on :$(WEB_PORT)..."
	cd web && npm run dev

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
	@echo "  infrastructure:"
	@echo "    make infra          start all services (kafka, clickhouse, neo4j, jaeger, grafana)"
	@echo "    make infra-down     tear down infrastructure"
	@echo "    make infra-logs     tail all infrastructure logs"
	@echo ""
	@echo "  services (run natively):"
	@echo "    make engine         start causal engine"
	@echo "    make api            start gRPC API server"
	@echo "    make replay         start replay engine"
	@echo "    make probe          build eBPF probe"
	@echo "    make probe-run      run eBPF probe"
	@echo "    make web            start frontend dev server"
	@echo ""
	@echo "  build:"
	@echo "    make build          build all services"
	@echo "    make test           run all tests"
	@echo "    make fmt            format all code"
	@echo "    make clean          remove build artifacts"