package handlers

import (
	"encoding/json"
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

	h.mu.Lock()
	defer h.mu.Unlock()

	if r.Method == http.MethodGet {
		json.NewEncoder(w).Encode(h.s)
		return
	}

	if r.Method == http.MethodPut {
		var updated Settings
		if err := json.NewDecoder(r.Body).Decode(&updated); err == nil {
			h.s = updated
		}
		json.NewEncoder(w).Encode(h.s)
		return
	}

	w.WriteHeader(http.StatusMethodNotAllowed)
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
