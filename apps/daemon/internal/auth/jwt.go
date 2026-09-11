package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ConsoleTokenClaims represents the JWT claims for a console access token.
type ConsoleTokenClaims struct {
	ServerId string `json:"serverId"`
	UserId   string `json:"userId"`
	Scope    string `json:"scope"`
	jwt.RegisteredClaims
}

// ValidateConsoleToken validates a JWT console token and checks that it
// matches the expected server ID and scope.
func ValidateConsoleToken(tokenString, expectedServerId, appSecret string) (*ConsoleTokenClaims, error) {
	claims := &ConsoleTokenClaims{}

	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(appSecret), nil
	})
	if err != nil {
		return nil, fmt.Errorf("INVALID_TOKEN: %w", err)
	}
	if !token.Valid {
		return nil, fmt.Errorf("INVALID_TOKEN: token is not valid")
	}

	// Check scope
	if claims.Scope != "console" {
		return nil, fmt.Errorf("INVALID_TOKEN: expected scope 'console', got '%s'", claims.Scope)
	}

	// Check server ID matches
	if claims.ServerId != expectedServerId {
		return nil, fmt.Errorf("INVALID_TOKEN: serverId mismatch")
	}

	// Check expiry
	if claims.ExpiresAt != nil && claims.ExpiresAt.Before(time.Now()) {
		return nil, fmt.Errorf("INVALID_TOKEN: token expired")
	}

	return claims, nil
}
