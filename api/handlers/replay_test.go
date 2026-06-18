package handlers

import "testing"

func TestReplayWatcherRemovalDeletesEmptySessionEntry(t *testing.T) {
	handler := NewReplayHandler(nil)
	watcher := handler.addWatcher("session-1")

	if len(handler.watchChans["session-1"]) != 1 {
		t.Fatalf("expected one watcher, got %d", len(handler.watchChans["session-1"]))
	}

	handler.removeWatcher("session-1", watcher)
	if _, exists := handler.watchChans["session-1"]; exists {
		t.Fatal("expected empty watcher session entry to be deleted")
	}
}
