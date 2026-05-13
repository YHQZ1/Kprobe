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

type Tracer struct {
	cmd    *exec.Cmd
	pid    int
	events []store.Event
	cursor int
}

func New(binary string, args []string, events []store.Event) *Tracer {
	return &Tracer{
		cmd:    exec.Command(binary, args...),
		events: events,
	}
}

func (t *Tracer) Run() error {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	t.cmd.SysProcAttr = &syscall.SysProcAttr{
		Ptrace: true,
	}

	t.cmd.Stdout = os.Stdout
	t.cmd.Stderr = os.Stderr

	if err := t.cmd.Start(); err != nil {
		return fmt.Errorf("ptrace: start process: %w", err)
	}

	t.pid = t.cmd.Process.Pid

	if _, err := waitForStop(t.pid); err != nil {
		return fmt.Errorf("ptrace: wait for initial stop: %w", err)
	}

	if err := syscall.PtraceSetOptions(t.pid, syscall.PTRACE_O_TRACESYSGOOD); err != nil {
		return fmt.Errorf("ptrace: set options: %w", err)
	}

	return t.interceptLoop()
}

func (t *Tracer) Detach() error {
	if t.pid == 0 {
		return nil
	}
	if err := syscall.PtraceDetach(t.pid); err != nil {
		return fmt.Errorf("ptrace: detach: %w", err)
	}
	return nil
}

func (t *Tracer) interceptLoop() error {
	inSyscall := false

	for {
		if err := syscall.PtraceSyscall(t.pid, 0); err != nil {
			return fmt.Errorf("ptrace: resume: %w", err)
		}

		ws, err := waitForStop(t.pid)
		if err != nil {
			return fmt.Errorf("ptrace: wait: %w", err)
		}

		if ws.Exited() {
			return nil
		}

		if !isSyscallStop(ws) {
			sig := ws.StopSignal()
			if sig == syscall.SIGTRAP {
				sig = 0
			}
			_ = syscall.PtraceSyscall(t.pid, int(sig))
			continue
		}

		regs, err := getRegs(t.pid)
		if err != nil {
			return fmt.Errorf("ptrace: get regs: %w", err)
		}

		if !inSyscall {
			inSyscall = true
		} else {
			inSyscall = false

			if t.cursor < len(t.events) {
				event := t.events[t.cursor]
				t.cursor++

				if err := overwriteReturnValue(t.pid, regs, event); err != nil {
					fmt.Fprintf(os.Stderr, "ptrace: overwrite return: %v\n", err)
				}
			}
		}
	}
}

func overwriteReturnValue(pid int, regs syscall.PtraceRegs, event store.Event) error {
	switch event.EventType {
	case types.EventTypeTCPSend, types.EventTypeTCPRecv,
		types.EventTypeSysRead, types.EventTypeSysWrite:
		regs.Rax = uint64(event.ReturnValue)
	default:
		return nil
	}

	if err := syscall.PtraceSetRegs(pid, &regs); err != nil {
		return fmt.Errorf("set regs: %w", err)
	}
	return nil
}

func getRegs(pid int) (syscall.PtraceRegs, error) {
	var regs syscall.PtraceRegs
	if err := syscall.PtraceGetRegs(pid, &regs); err != nil {
		return regs, fmt.Errorf("get regs pid %d: %w", pid, err)
	}
	return regs, nil
}

func waitForStop(pid int) (syscall.WaitStatus, error) {
	var ws syscall.WaitStatus
	_, err := syscall.Wait4(pid, &ws, 0, nil)
	if err != nil {
		return ws, fmt.Errorf("wait4 pid %d: %w", pid, err)
	}
	return ws, nil
}

func isSyscallStop(ws syscall.WaitStatus) bool {
	return ws.Stopped() && ws.StopSignal() == syscall.SIGTRAP|0x80
}
