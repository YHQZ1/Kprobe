//go:build !linux

package ptrace

import (
	"fmt"

	"github.com/YHQZ1/kprobe/replay/store"
)

// Tracer is a stub on non-Linux platforms.
// ptrace syscall interception requires Linux — use Codespaces or a Linux VM.
type Tracer struct{}

func New(binary string, args []string, events []store.ReplayEvent) *Tracer {
	return &Tracer{}
}

func (t *Tracer) Run() error {
	return fmt.Errorf("ptrace: not supported on this platform (Linux only)")
}

func (t *Tracer) Detach() error {
	return nil
}
