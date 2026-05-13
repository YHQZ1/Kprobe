//go:build !linux

package ptrace

import (
	"fmt"

	"github.com/YHQZ1/kprobe/replay/store"
)

type Tracer struct{}

func New(binary string, args []string, events []store.Event) *Tracer {
	return &Tracer{}
}

func (t *Tracer) Run() error {
	return fmt.Errorf("ptrace: not supported on this platform (Linux only)")
}

func (t *Tracer) Detach() error {
	return nil
}
