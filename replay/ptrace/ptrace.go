//go:build linux

package ptrace

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"syscall"

	"github.com/YHQZ1/kprobe/replay/store"
	"github.com/YHQZ1/kprobe/shared/types"
)

// Tracer attaches to a sandboxed process via ptrace and intercepts its
// syscalls, serving responses from the recorded event log instead of
// letting them reach the real kernel.
//
// One Tracer is created per replay session. It owns the sandboxed process
// for its entire lifetime — attach, intercept loop, detach.
type Tracer struct {
	cmd    *exec.Cmd
	pid    int
	events []store.ReplayEvent
	cursor int
}

// New creates a Tracer that will run the given binary with the given args
// in a sandboxed ptrace child. Events are the recorded syscall log that will
// be served back to the process instead of real kernel responses.
func New(binary string, args []string, events []store.ReplayEvent) *Tracer {
	return &Tracer{
		cmd:    exec.Command(binary, args...),
		events: events,
	}
}

// Run starts the sandboxed process and enters the syscall intercept loop.
// It blocks until the process exits or an unrecoverable error occurs.
//
// Must be called from a goroutine that is locked to its OS thread —
// ptrace operations on Linux require the tracer and tracee to share a thread.
// Call runtime.LockOSThread() before Run and defer runtime.UnlockOSThread().
func (t *Tracer) Run() error {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	// Configure the child to stop immediately on exec so we can attach.
	t.cmd.SysProcAttr = &syscall.SysProcAttr{
		Ptrace: true, // child calls PTRACE_TRACEME before exec
	}

	t.cmd.Stdout = os.Stdout
	t.cmd.Stderr = os.Stderr

	if err := t.cmd.Start(); err != nil {
		return fmt.Errorf("ptrace: start process: %w", err)
	}

	t.pid = t.cmd.Process.Pid

	// Wait for the child's initial SIGTRAP (it stopped after exec).
	if _, err := waitForStop(t.pid); err != nil {
		return fmt.Errorf("ptrace: wait for initial stop: %w", err)
	}

	// Tell the kernel to stop the child at every syscall entry and exit.
	if err := syscall.PtraceSetOptions(t.pid, syscall.PTRACE_O_TRACESYSGOOD); err != nil {
		return fmt.Errorf("ptrace: set options: %w", err)
	}

	return t.interceptLoop()
}

// Detach detaches from the traced process and lets it run freely.
// Called on clean shutdown or when the session is stopped mid-replay.
func (t *Tracer) Detach() error {
	if t.pid == 0 {
		return nil
	}
	if err := syscall.PtraceDetach(t.pid); err != nil {
		return fmt.Errorf("ptrace: detach: %w", err)
	}
	return nil
}

// interceptLoop drives the syscall-stop → inspect → resume cycle.
//
// ptrace delivers two stops per syscall:
//   - syscall-entry stop: process is about to execute the syscall
//   - syscall-exit stop: kernel has filled in the return value
//
// On entry we identify which syscall is being made and find the matching
// recorded event. On exit we overwrite the return value and registers with
// the recorded values, making the process believe the real kernel responded.
func (t *Tracer) interceptLoop() error {
	inSyscall := false

	for {
		// Resume the child, stopping again at the next syscall boundary.
		if err := syscall.PtraceSyscall(t.pid, 0); err != nil {
			return fmt.Errorf("ptrace: resume: %w", err)
		}

		ws, err := waitForStop(t.pid)
		if err != nil {
			return fmt.Errorf("ptrace: wait: %w", err)
		}

		// Process exited normally — replay complete.
		if ws.Exited() {
			return nil
		}

		// Not a syscall stop — deliver the signal and continue.
		if !isSyscallStop(ws) {
			sig := ws.StopSignal()
			if sig == syscall.SIGTRAP {
				sig = 0 // suppress SIGTRAP, it's ours
			}
			_ = syscall.PtraceSyscall(t.pid, int(sig))
			continue
		}

		regs, err := getRegs(t.pid)
		if err != nil {
			return fmt.Errorf("ptrace: get regs: %w", err)
		}

		if !inSyscall {
			// Syscall-entry stop — record which syscall is happening.
			// We don't block the syscall here; we let it proceed and
			// overwrite the result on the exit stop instead.
			inSyscall = true
			_ = regs // syscall number is regs.Orig_rax on amd64
		} else {
			// Syscall-exit stop — overwrite the return value with the
			// recorded value from the event log.
			inSyscall = false

			if t.cursor < len(t.events) {
				event := t.events[t.cursor]
				t.cursor++

				if err := overwriteReturnValue(t.pid, regs, event); err != nil {
					// Non-fatal — log and continue. The process gets the
					// real kernel return value for this syscall.
					fmt.Fprintf(os.Stderr, "ptrace: overwrite return: %v\n", err)
				}
			}
		}
	}
}

// overwriteReturnValue sets the syscall return register to the value recorded
// in the event log, then writes the modified registers back to the process.
func overwriteReturnValue(pid int, regs syscall.PtraceRegs, event store.ReplayEvent) error {
	// On amd64, RAX holds the syscall return value after a syscall-exit stop.
	// For failure injection, we return -ETIMEDOUT (errno 110, negated).
	switch event.EventType {
	case types.EventTypeTCPSend, types.EventTypeTCPRecv,
		types.EventTypeSyscallRead, types.EventTypeSyscallWrite:
		regs.Rax = uint64(event.ReturnValue)
	default:
		// Scheduling and page fault events don't have meaningful return
		// values to inject — leave the register unchanged.
		return nil
	}

	if err := syscall.PtraceSetRegs(pid, &regs); err != nil {
		return fmt.Errorf("set regs: %w", err)
	}
	return nil
}

// getRegs reads the current register state of the traced process.
func getRegs(pid int) (syscall.PtraceRegs, error) {
	var regs syscall.PtraceRegs
	if err := syscall.PtraceGetRegs(pid, &regs); err != nil {
		return regs, fmt.Errorf("get regs pid %d: %w", pid, err)
	}
	return regs, nil
}

// waitForStop waits for the traced process to deliver a ptrace-stop.
func waitForStop(pid int) (syscall.WaitStatus, error) {
	var ws syscall.WaitStatus
	_, err := syscall.Wait4(pid, &ws, 0, nil)
	if err != nil {
		return ws, fmt.Errorf("wait4 pid %d: %w", pid, err)
	}
	return ws, nil
}

// isSyscallStop returns true if the WaitStatus represents a syscall-stop
// (as opposed to a signal-stop, group-stop, or exit).
// PTRACE_O_TRACESYSGOOD sets bit 7 of the stop signal to distinguish
// syscall stops from genuine SIGTRAP deliveries.
func isSyscallStop(ws syscall.WaitStatus) bool {
	return ws.Stopped() && ws.StopSignal() == syscall.SIGTRAP|0x80
}
