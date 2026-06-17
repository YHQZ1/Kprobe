#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export CLICKHOUSE_ADDR="${CLICKHOUSE_ADDR:-localhost:9000}"
export CLICKHOUSE_DB="${CLICKHOUSE_DB:-kprobe}"
export CLICKHOUSE_USER="${CLICKHOUSE_USER:-kprobe}"
export CLICKHOUSE_PASS="${CLICKHOUSE_PASS:-kprobe}"
export NEO4J_BOLT="${NEO4J_BOLT:-neo4j://localhost:7687}"
export NEO4J_USER="${NEO4J_USER:-neo4j}"
export NEO4J_PASS="${NEO4J_PASS:-kprobe_secret}"
export KAFKA_BROKERS="${KAFKA_BROKERS:-localhost:9092}"
export KPROBE_API_TOKEN="${KPROBE_API_TOKEN:-dev-token}"
export KPROBE_API_USER="${KPROBE_API_USER:-admin}"
export KPROBE_API_PASS="${KPROBE_API_PASS:-admin}"
export KPROBE_JWT_SECRET="${KPROBE_JWT_SECRET:-dev-secret-change-me}"

children=()

cleanup() {
  trap - INT TERM EXIT
  for pid in "${children[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}

trap cleanup INT TERM EXIT

cd "$ROOT"
make infra

(
  cd "$ROOT/engine"
  go run .
) &
children+=("$!")

(
  cd "$ROOT/api"
  go run .
) &
children+=("$!")

(
  cd "$ROOT/console"
  pnpm dev --host 127.0.0.1
) &
children+=("$!")

echo
echo "kprobe local stack is starting"
echo "  console: http://127.0.0.1:5173"
echo "  login:   admin / admin"
echo "  events:  run 'make demo' in another terminal"
echo

wait
