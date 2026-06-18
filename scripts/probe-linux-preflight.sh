#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'probe preflight: %s\n' "$1" >&2
  exit 1
}

if [[ "$(uname -s)" != "Linux" ]]; then
  fail "Linux is required; current system is $(uname -s)"
fi

if [[ ! -r /sys/kernel/btf/vmlinux ]]; then
  fail "kernel BTF not found at /sys/kernel/btf/vmlinux"
fi

trace_root=""
for candidate in /sys/kernel/tracing/events /sys/kernel/debug/tracing/events; do
  if [[ -d "$candidate" ]]; then
    trace_root="$candidate"
    break
  fi
done

if [[ -z "$trace_root" ]]; then
  fail "tracefs events directory not found"
fi

check_tracepoint() {
  local category="$1"
  local event="$2"
  if [[ ! -d "$trace_root/$category/$event" ]]; then
    fail "missing tracepoint $category:$event under $trace_root"
  fi
}

check_symbol() {
  local symbol="$1"
  if ! grep -qw "$symbol" /proc/kallsyms; then
    fail "missing kernel symbol $symbol in /proc/kallsyms"
  fi
}

check_tracepoint syscalls sys_enter_read
check_tracepoint syscalls sys_exit_read
check_tracepoint syscalls sys_enter_write
check_tracepoint syscalls sys_exit_write
check_tracepoint sched sched_switch
check_tracepoint exceptions page_fault_user
check_tracepoint block block_rq_issue
check_tracepoint block block_rq_complete

check_symbol tcp_sendmsg
check_symbol tcp_recvmsg
check_symbol tcp_retransmit_skb

command -v cargo >/dev/null || fail "cargo not found"
command -v bpf-linker >/dev/null || fail "bpf-linker not found"

printf 'probe preflight: ok\n'
printf 'tracefs: %s\n' "$trace_root"
printf 'kernel: %s\n' "$(uname -r)"
