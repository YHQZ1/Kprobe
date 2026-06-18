package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sync"
)

type Settings struct {
	Version         int    `json:"version"`
	APIHost         string `json:"apiHost"`
	APIPort         string `json:"apiPort"`
	WSReconnect     bool   `json:"wsReconnect"`
	Theme           string `json:"theme"`
	TimestampFormat string `json:"timestampFormat"`
	MaxStreamEvents int    `json:"maxStreamEvents"`
	MaxGraphNodes   int    `json:"maxGraphNodes"`
	RetentionDays   int    `json:"retentionDays"`
	AutoExport      bool   `json:"autoExport"`
	ExportPath      string `json:"exportPath"`
	ProbeOverhead   string `json:"probeOverhead"`
}

var defaultSettings = Settings{
	Version:         1,
	APIHost:         "localhost",
	APIPort:         "8081",
	WSReconnect:     true,
	Theme:           "dark",
	TimestampFormat: "absolute",
	MaxStreamEvents: 500,
	MaxGraphNodes:   40,
	RetentionDays:   7,
	AutoExport:      false,
	ExportPath:      "/var/log/kprobe/exports",
	ProbeOverhead:   "standard",
}

type SettingsHandler struct {
	mu sync.RWMutex
	s  Settings
}

func NewSettingsHandler() *SettingsHandler {
	return &SettingsHandler{s: defaultSettings}
}

func (h *SettingsHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	switch r.Method {
	case http.MethodGet:
		h.mu.RLock()
		settings := h.s
		h.mu.RUnlock()
		json.NewEncoder(w).Encode(settings)
		return
	case http.MethodPut:
		var updated Settings
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&updated); err != nil {
			http.Error(w, "invalid settings payload", http.StatusBadRequest)
			return
		}
		if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
			http.Error(w, "invalid settings payload", http.StatusBadRequest)
			return
		}
		if err := validateSettings(updated); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		h.mu.Lock()
		h.s = updated
		h.mu.Unlock()
		json.NewEncoder(w).Encode(updated)
		return
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (h *SettingsHandler) ResetHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	h.mu.Lock()
	h.s = defaultSettings
	h.mu.Unlock()

	json.NewEncoder(w).Encode(defaultSettings)
}

func validateSettings(s Settings) error {
	if s.Version != defaultSettings.Version {
		return fmt.Errorf("unsupported settings version")
	}
	if s.APIHost == "" || s.APIPort == "" {
		return fmt.Errorf("apiHost and apiPort are required")
	}
	if !oneOf(s.Theme, "dark", "light", "system") {
		return fmt.Errorf("invalid theme")
	}
	if !oneOf(s.TimestampFormat, "absolute", "relative", "nanosecond") {
		return fmt.Errorf("invalid timestampFormat")
	}
	if s.MaxStreamEvents < 100 || s.MaxStreamEvents > 2000 {
		return fmt.Errorf("maxStreamEvents must be between 100 and 2000")
	}
	if s.MaxGraphNodes < 10 || s.MaxGraphNodes > 500 {
		return fmt.Errorf("maxGraphNodes must be between 10 and 500")
	}
	if s.RetentionDays < 1 || s.RetentionDays > 365 {
		return fmt.Errorf("retentionDays must be between 1 and 365")
	}
	if !oneOf(s.ProbeOverhead, "minimal", "standard", "verbose") {
		return fmt.Errorf("invalid probeOverhead")
	}
	return nil
}

func oneOf(value string, allowed ...string) bool {
	for _, candidate := range allowed {
		if value == candidate {
			return true
		}
	}
	return false
}
