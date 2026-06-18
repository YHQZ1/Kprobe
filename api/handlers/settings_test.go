package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSettingsHandlerRejectsMalformedUpdateWithoutMutation(t *testing.T) {
	handler := NewSettingsHandler()
	req := httptest.NewRequest(http.MethodPut, "/api/settings", bytes.NewBufferString(`{"theme":`))
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}
	if handler.s != defaultSettings {
		t.Fatalf("malformed update mutated settings: %+v", handler.s)
	}
}

func TestSettingsHandlerValidatesAndStoresUpdate(t *testing.T) {
	handler := NewSettingsHandler()
	updated := defaultSettings
	updated.Theme = "system"
	updated.MaxStreamEvents = 1200
	body, err := json.Marshal(updated)
	if err != nil {
		t.Fatalf("marshal settings: %v", err)
	}

	req := httptest.NewRequest(http.MethodPut, "/api/settings", bytes.NewReader(body))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	if handler.s != updated {
		t.Fatalf("stored settings = %+v, want %+v", handler.s, updated)
	}
}

func TestSettingsHandlerRejectsOutOfRangeUpdate(t *testing.T) {
	handler := NewSettingsHandler()
	updated := defaultSettings
	updated.MaxGraphNodes = 0
	body, err := json.Marshal(updated)
	if err != nil {
		t.Fatalf("marshal settings: %v", err)
	}

	req := httptest.NewRequest(http.MethodPut, "/api/settings", bytes.NewReader(body))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}
	if handler.s != defaultSettings {
		t.Fatalf("invalid update mutated settings: %+v", handler.s)
	}
}
