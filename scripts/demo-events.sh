#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT/infrastructure/docker/docker-compose.yml"
TX_ID="${1:-demo-$(date +%s)}"
BASE_NS="$(($(date +%s) * 1000000000))"

if ! docker compose -f "$COMPOSE_FILE" ps --status running kafka vector >/dev/null; then
  echo "Kafka and Vector are not running. Start them with: make infra" >&2
  exit 1
fi

echo "publishing demo transaction: $TX_ID"

{
  printf '{"event_type":"tcp_recv","timestamp_ns":%s,"pid":4200,"tid":4200,"cpu":1,"cgroup_id":42,"trace_id":"trace-%s","span_id":"span-ingress","service_name":"api-worker","transaction_id":"%s","duration_ns":120000,"return_value":0,"payload":{"tcp_data_len":2048}}\n' "$((BASE_NS + 1000000))" "$TX_ID" "$TX_ID"
  sleep 0.3
  printf '{"event_type":"sys_write","timestamp_ns":%s,"pid":4200,"tid":4200,"cpu":1,"cgroup_id":42,"trace_id":"trace-%s","span_id":"span-write","service_name":"api-worker","transaction_id":"%s","duration_ns":0,"return_value":0,"payload":{"syscall_fd":7,"syscall_bytes":4096}}\n' "$((BASE_NS + 3000000))" "$TX_ID" "$TX_ID"
  sleep 0.3
  printf '{"event_type":"sys_write","timestamp_ns":%s,"pid":4200,"tid":4200,"cpu":1,"cgroup_id":42,"trace_id":"trace-%s","span_id":"span-write","service_name":"api-worker","transaction_id":"%s","duration_ns":0,"return_value":4096,"payload":{}}\n' "$((BASE_NS + 11000000))" "$TX_ID" "$TX_ID"
  sleep 0.3
  printf '{"event_type":"page_fault","timestamp_ns":%s,"pid":7331,"tid":7331,"cpu":1,"cgroup_id":77,"trace_id":"","span_id":"","service_name":"batch-worker","transaction_id":"%s","duration_ns":900000,"return_value":0,"payload":{"fault_address":140734799806464,"fault_flags":6}}\n' "$((BASE_NS + 12000000))" "$TX_ID"
  sleep 0.3
  printf '{"event_type":"sched_switch","timestamp_ns":%s,"pid":7331,"tid":7331,"cpu":1,"cgroup_id":77,"sched_next_pid":4200,"trace_id":"","span_id":"","service_name":"batch-worker","transaction_id":"%s","duration_ns":0,"return_value":0,"payload":{}}\n' "$((BASE_NS + 13000000))" "$TX_ID"
  sleep 0.3
  printf '{"event_type":"sys_read","timestamp_ns":%s,"pid":4200,"tid":4200,"cpu":1,"cgroup_id":42,"trace_id":"trace-%s","span_id":"span-read","service_name":"api-worker","transaction_id":"%s","duration_ns":0,"return_value":0,"payload":{"syscall_fd":7,"syscall_bytes":1024}}\n' "$((BASE_NS + 15000000))" "$TX_ID" "$TX_ID"
  sleep 0.3
  printf '{"event_type":"sys_read","timestamp_ns":%s,"pid":4200,"tid":4200,"cpu":1,"cgroup_id":42,"trace_id":"trace-%s","span_id":"span-read","service_name":"api-worker","transaction_id":"%s","duration_ns":0,"return_value":1024,"payload":{}}\n' "$((BASE_NS + 22000000))" "$TX_ID" "$TX_ID"
  sleep 0.3
  printf '{"event_type":"tcp_send","timestamp_ns":%s,"pid":4200,"tid":4200,"cpu":1,"cgroup_id":42,"trace_id":"trace-%s","span_id":"span-egress","service_name":"api-worker","transaction_id":"%s","duration_ns":160000,"return_value":0,"payload":{"tcp_data_len":768}}\n' "$((BASE_NS + 25000000))" "$TX_ID" "$TX_ID"
} | docker exec -i kprobe-kafka kafka-console-producer \
  --bootstrap-server localhost:9092 \
  --topic kernel.raw

echo "published demo transaction: $TX_ID"
