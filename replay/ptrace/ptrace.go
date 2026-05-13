//go:build linux

package ptrace

import (
	"errors"
	"os"
)

var ErrNotImplemented = errors.New("ptrace replay not yet implemented")

type Tracer struct {
	pid  int
	proc *os.Process
}

func NewTracer(pid int) (*Tracer, error) {
	proc, err := os.FindProcess(pid)
	if err != nil {
		return nil, err
	}
	return &Tracer{pid: pid, proc: proc}, nil
}

func (t *Tracer) Run() error {
	return ErrNotImplemented
}

func (t *Tracer) Detach() error {
	return ErrNotImplemented
}
