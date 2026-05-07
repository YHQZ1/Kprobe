# ─── kprobe Makefile ─────────────────────────────────────────────────────────
# Usage:
#   make infra        start Kafka, ClickHouse, Neo4j
#   make infra-down   tear down infrastructure
#   make engine       run causal engine (native Go)
#   make api          run API server (native Go)
#   make replay       run replay engine (native Go)
#   make probe        build eBPF probe (Rust)
#   make web          start frontend dev server
#   make build        build all Go services
#   make test         run all tests
#   make fmt          format all code
#   make clean        remove all build artifacts

.PHONY: all infra infra-down engine api replay probe web build test fmt clean

# ─── Ports ───────────────────────────────────────────────────────────────────
API_PORT        := 8080
WEB_PORT        := 5173
KAFKA_PORT      := 9092
CLICKHOUSE_PORT := 8123
NEO4J_PORT      := 7474

# ─── Infrastructure ──────────────────────────────────────────────────────────
infra:
	@echo "→ Starting infrastructure (Kafka, ClickHouse, Neo4j)..."
	docker compose -f infrastructure/docker/docker-compose.yml up -d
	@echo "✓ Kafka     → localhost:$(KAFKA_PORT)"
	@echo "✓ ClickHouse → localhost:$(CLICKHOUSE_PORT)"
	@echo "✓ Neo4j      → localhost:$(NEO4J_PORT)"

infra-down:
	@echo "→ Stopping infrastructure..."
	docker compose -f infrastructure/docker/docker-compose.yml down
	@echo "✓ Done"

infra-logs:
	docker compose -f infrastructure/docker/docker-compose.yml logs -f

# ─── Go Services (native) ────────────────────────────────────────────────────
engine:
	@echo "→ Starting causal engine..."
	cd engine && go run .

api:
	@echo "→ Starting API server on :$(API_PORT)..."
	cd api && go run .

replay:
	@echo "→ Starting replay engine..."
	cd replay && go run .

# ─── Rust / eBPF Probe ───────────────────────────────────────────────────────
probe:
	@echo "→ Building eBPF probe..."
	cd probe && cargo xtask build-ebpf
	@echo "✓ Probe built"

probe-run:
	@echo "→ Running eBPF probe (requires sudo)..."
	cd probe && cargo xtask run

# ─── Frontend ────────────────────────────────────────────────────────────────
web:
	@echo "→ Starting frontend dev server on :$(WEB_PORT)..."
	cd web && npm run dev

web-install:
	@echo "→ Installing frontend dependencies..."
	cd web && npm install

# ─── Build All ───────────────────────────────────────────────────────────────
build: build-engine build-api build-replay build-probe
	@echo "✓ All services built"

build-engine:
	@echo "→ Building engine..."
	cd engine && go build -o bin/engine .

build-api:
	@echo "→ Building api..."
	cd api && go build -o bin/api .

build-replay:
	@echo "→ Building replay..."
	cd replay && go build -o bin/replay .

build-probe:
	@echo "→ Building probe..."
	cd probe && cargo build --release

# ─── Test ────────────────────────────────────────────────────────────────────
test: test-go test-rust
	@echo "✓ All tests passed"

test-go:
	@echo "→ Running Go tests..."
	cd engine && go test ./...
	cd api && go test ./...
	cd replay && go test ./...
	cd shared && go test ./...

test-rust:
	@echo "→ Running Rust tests..."
	cd probe && cargo test

# ─── Format ──────────────────────────────────────────────────────────────────
fmt: fmt-go fmt-rust
	@echo "✓ All code formatted"

fmt-go:
	@echo "→ Formatting Go..."
	gofmt -w engine/ api/ replay/ shared/

fmt-rust:
	@echo "→ Formatting Rust..."
	cd probe && cargo fmt

# ─── Clean ───────────────────────────────────────────────────────────────────
clean:
	@echo "→ Cleaning build artifacts..."
	rm -rf engine/bin api/bin replay/bin
	cd probe && cargo clean
	@echo "✓ Clean"

# ─── Helpers ─────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  kprobe — available commands"
	@echo ""
	@echo "  Infrastructure"
	@echo "    make infra          start Kafka, ClickHouse, Neo4j"
	@echo "    make infra-down     stop infrastructure"
	@echo "    make infra-logs     tail infrastructure logs"
	@echo ""
	@echo "  Services (native)"
	@echo "    make engine         run causal engine"
	@echo "    make api            run API server"
	@echo "    make replay         run replay engine"
	@echo "    make probe          build eBPF probe"
	@echo "    make probe-run      run eBPF probe (needs sudo)"
	@echo "    make web            start frontend dev server"
	@echo ""
	@echo "  Build"
	@echo "    make build          build all services"
	@echo "    make test           run all tests"
	@echo "    make fmt            format all code"
	@echo "    make clean          remove build artifacts"
	@echo ""