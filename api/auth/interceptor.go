package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

func UnaryInterceptor(apiToken, jwtSecret string) grpc.UnaryServerInterceptor {
	return func(
		ctx context.Context,
		req any,
		info *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (any, error) {
		if err := validateToken(ctx, apiToken, jwtSecret); err != nil {
			return nil, err
		}
		return handler(ctx, req)
	}
}

func StreamInterceptor(apiToken, jwtSecret string) grpc.StreamServerInterceptor {
	return func(
		srv any,
		ss grpc.ServerStream,
		info *grpc.StreamServerInfo,
		handler grpc.StreamHandler,
	) error {
		if err := validateToken(ss.Context(), apiToken, jwtSecret); err != nil {
			return err
		}
		return handler(srv, ss)
	}
}

func validateToken(ctx context.Context, apiToken, jwtSecret string) error {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return status.Error(codes.Unauthenticated, "missing metadata")
	}

	values := md.Get("authorization")
	if len(values) == 0 {
		return status.Error(codes.Unauthenticated, "missing authorization header")
	}

	if !ValidAuthorization(values[0], apiToken, jwtSecret) {
		return status.Error(codes.PermissionDenied, "invalid token")
	}

	return nil
}

func ValidAuthorization(raw, apiToken, jwtSecret string) bool {
	if !strings.HasPrefix(raw, "Bearer ") {
		return false
	}

	tokenStr := strings.TrimPrefix(raw, "Bearer ")
	if tokenStr == apiToken {
		return true
	}

	token, err := jwt.Parse(
		tokenStr,
		func(token *jwt.Token) (any, error) {
			return []byte(jwtSecret), nil
		},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithExpirationRequired(),
	)
	return err == nil && token.Valid
}

func ValidWebSocketRequest(r *http.Request, apiToken, jwtSecret string) bool {
	if ValidAuthorization(r.Header.Get("Authorization"), apiToken, jwtSecret) {
		return true
	}
	token := r.URL.Query().Get("access_token")
	return token != "" && ValidAuthorization("Bearer "+token, apiToken, jwtSecret)
}

func HTTPMiddleware(apiToken, jwtSecret string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !ValidAuthorization(r.Header.Get("Authorization"), apiToken, jwtSecret) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}
