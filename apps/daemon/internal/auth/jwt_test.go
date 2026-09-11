package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestValidateConsoleToken_Valid(t *testing.T) {
	secret := "test-secret"
	serverId := "550e8400-e29b-41d4-a716-446655440000"
	now := time.Now()

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, &ConsoleTokenClaims{
		ServerId: serverId,
		UserId:   "user-123",
		Scope:    "console",
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(5 * time.Minute)),
		},
	})
	tokenString, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}

	claims, err := ValidateConsoleToken(tokenString, serverId, secret)
	if err != nil {
		t.Fatalf("expected valid token, got error: %v", err)
	}
	if claims.ServerId != serverId {
		t.Errorf("expected serverId %s, got %s", serverId, claims.ServerId)
	}
	if claims.Scope != "console" {
		t.Errorf("expected scope 'console', got '%s'", claims.Scope)
	}
}

func TestValidateConsoleToken_Expired(t *testing.T) {
	secret := "test-secret"
	serverId := "550e8400-e29b-41d4-a716-446655440000"
	now := time.Now()

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, &ConsoleTokenClaims{
		ServerId: serverId,
		UserId:   "user-123",
		Scope:    "console",
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now.Add(-10 * time.Minute)),
			ExpiresAt: jwt.NewNumericDate(now.Add(-5 * time.Minute)),
		},
	})
	tokenString, _ := token.SignedString([]byte(secret))

	_, err := ValidateConsoleToken(tokenString, serverId, secret)
	if err == nil {
		t.Fatal("expected error for expired token, got nil")
	}
}

func TestValidateConsoleToken_WrongServerId(t *testing.T) {
	secret := "test-secret"
	serverId := "550e8400-e29b-41d4-a716-446655440000"
	now := time.Now()

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, &ConsoleTokenClaims{
		ServerId: "different-server-id",
		UserId:   "user-123",
		Scope:    "console",
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(5 * time.Minute)),
		},
	})
	tokenString, _ := token.SignedString([]byte(secret))

	_, err := ValidateConsoleToken(tokenString, serverId, secret)
	if err == nil {
		t.Fatal("expected error for wrong serverId, got nil")
	}
}

func TestValidateConsoleToken_WrongSecret(t *testing.T) {
	secret := "test-secret"
	wrongSecret := "wrong-secret"
	serverId := "550e8400-e29b-41d4-a716-446655440000"
	now := time.Now()

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, &ConsoleTokenClaims{
		ServerId: serverId,
		UserId:   "user-123",
		Scope:    "console",
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(5 * time.Minute)),
		},
	})
	tokenString, _ := token.SignedString([]byte(secret))

	_, err := ValidateConsoleToken(tokenString, serverId, wrongSecret)
	if err == nil {
		t.Fatal("expected error for wrong secret, got nil")
	}
}

func TestValidateConsoleToken_WrongScope(t *testing.T) {
	secret := "test-secret"
	serverId := "550e8400-e29b-41d4-a716-446655440000"
	now := time.Now()

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, &ConsoleTokenClaims{
		ServerId: serverId,
		UserId:   "user-123",
		Scope:    "admin",
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(5 * time.Minute)),
		},
	})
	tokenString, _ := token.SignedString([]byte(secret))

	_, err := ValidateConsoleToken(tokenString, serverId, secret)
	if err == nil {
		t.Fatal("expected error for wrong scope, got nil")
	}
}
