package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestValidAuthorization(t *testing.T) {
	const apiToken = "api-token"
	const secret = "test-secret"

	validJWT := signedToken(t, secret, jwt.MapClaims{
		"sub": "admin",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	expiredJWT := signedToken(t, secret, jwt.MapClaims{
		"sub": "admin",
		"exp": time.Now().Add(-time.Hour).Unix(),
	})
	noExpiryJWT := signedToken(t, secret, jwt.MapClaims{"sub": "admin"})

	tests := []struct {
		name string
		raw  string
		want bool
	}{
		{name: "static api token", raw: "Bearer " + apiToken, want: true},
		{name: "valid jwt", raw: "Bearer " + validJWT, want: true},
		{name: "expired jwt", raw: "Bearer " + expiredJWT, want: false},
		{name: "jwt without expiry", raw: "Bearer " + noExpiryJWT, want: false},
		{name: "wrong scheme", raw: "Basic " + apiToken, want: false},
		{name: "missing token", raw: "", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ValidAuthorization(tt.raw, apiToken, secret); got != tt.want {
				t.Fatalf("ValidAuthorization() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestHTTPMiddleware(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	handler := HTTPMiddleware("api-token", "test-secret", next)

	unauthorized := httptest.NewRecorder()
	handler.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "/", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d, want %d", unauthorized.Code, http.StatusUnauthorized)
	}

	authorizedReq := httptest.NewRequest(http.MethodGet, "/", nil)
	authorizedReq.Header.Set("Authorization", "Bearer api-token")
	authorized := httptest.NewRecorder()
	handler.ServeHTTP(authorized, authorizedReq)
	if authorized.Code != http.StatusNoContent {
		t.Fatalf("authorized status = %d, want %d", authorized.Code, http.StatusNoContent)
	}
}

func TestValidWebSocketRequest(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/ws?access_token=api-token", nil)
	if !ValidWebSocketRequest(request, "api-token", "test-secret") {
		t.Fatal("expected query token to authorize WebSocket request")
	}

	request = httptest.NewRequest(http.MethodGet, "/ws", nil)
	request.Header.Set("Authorization", "Bearer api-token")
	if !ValidWebSocketRequest(request, "api-token", "test-secret") {
		t.Fatal("expected authorization header to authorize WebSocket request")
	}

	request = httptest.NewRequest(http.MethodGet, "/ws?access_token=wrong", nil)
	if ValidWebSocketRequest(request, "api-token", "test-secret") {
		t.Fatal("expected invalid query token to be rejected")
	}
}

func signedToken(t *testing.T, secret string, claims jwt.MapClaims) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return signed
}
