package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestParseTransactionPath(t *testing.T) {
	tx, action, ok := parseTransactionPath("/api/transactions/tx-123/causal-chain")
	if !ok || tx != "tx-123" || action != "causal-chain" {
		t.Fatalf("parseTransactionPath returned tx=%q action=%q ok=%v", tx, action, ok)
	}

	for _, path := range []string{
		"/api/transactions",
		"/api/transactions/",
		"/api/transactions/tx-123",
		"/api/transactions/tx-123/causal-chain/extra",
		"/wrong/tx-123/causal-chain",
	} {
		if _, _, ok := parseTransactionPath(path); ok {
			t.Fatalf("parseTransactionPath(%q) ok = true, want false", path)
		}
	}
}

func TestCausalHTTPHandlerValidatesMethodAndDependency(t *testing.T) {
	handler := NewCausalHTTPHandler(nil)

	req := httptest.NewRequest(http.MethodPost, "/api/transactions/tx/events", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST status = %d, want %d", rec.Code, http.StatusMethodNotAllowed)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/transactions/tx/events", nil)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("nil dependency status = %d, want %d", rec.Code, http.StatusServiceUnavailable)
	}
}
