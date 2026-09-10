package auth

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type CredentialStore interface {
	GetSecret(secretID string) (string, error)
}

type StaticCredentialStore struct {
	SecretID string
	Secret   string
}

func (s *StaticCredentialStore) GetSecret(secretID string) (string, error) {
	if secretID != s.SecretID {
		return "", fmt.Errorf("secret_id mismatch")
	}
	return s.Secret, nil
}

type AuthMiddleware struct {
	store CredentialStore
}

func NewAuthMiddleware(store CredentialStore) *AuthMiddleware {
	return &AuthMiddleware{store: store}
}

func (m *AuthMiddleware) Wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := m.Verify(r); err != nil {
			writeAuthError(w, err)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (m *AuthMiddleware) Verify(r *http.Request) error {
	secretID := r.Header.Get("X-Node-Id")
	sig := r.Header.Get("X-Node-Signature")
	tsStr := r.Header.Get("X-Node-Timestamp")

	if secretID == "" || sig == "" || tsStr == "" {
		return fmt.Errorf("AUTH_FAILED: missing auth headers")
	}

	ts, err := VerifyTimestamp(tsStr)
	if err != nil {
		return fmt.Errorf("TIMESTAMP_OUT_OF_WINDOW: %w", err)
	}

	secret, err := m.store.GetSecret(secretID)
	if err != nil {
		return fmt.Errorf("AUTH_FAILED: %w", err)
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		return fmt.Errorf("AUTH_FAILED: read body: %w", err)
	}
	// Restore body for downstream handlers
	r.Body = io.NopCloser(stringReader(string(body)))

	if err := VerifySignature(secret, ts, body, sig); err != nil {
		return fmt.Errorf("AUTH_FAILED: %w", err)
	}

	return nil
}

func writeAuthError(w http.ResponseWriter, err error) {
	msg := err.Error()
	code := "AUTH_FAILED"
	status := http.StatusUnauthorized

	if strings.Contains(msg, "TIMESTAMP_OUT_OF_WINDOW") {
		code = "TIMESTAMP_OUT_OF_WINDOW"
		status = http.StatusBadRequest
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	fmt.Fprintf(w, `{"error":{"code":%q,"message":%q}}`, code, msg)
}

// stringReader wraps a string as an io.ReadCloser
type stringReaderCloser struct {
	*stringReaderImpl
}

type stringReaderImpl struct {
	s   string
	pos int
}

func (r *stringReaderImpl) Read(p []byte) (int, error) {
	if r.pos >= len(r.s) {
		return 0, io.EOF
	}
	n := copy(p, r.s[r.pos:])
	r.pos += n
	return n, nil
}

func (r *stringReaderImpl) Close() error { return nil }

func stringReader(s string) io.ReadCloser {
	return &stringReaderCloser{&stringReaderImpl{s: s}}
}

// Timeout wrapper for auth operations (not currently used but available)
func (m *AuthMiddleware) VerifyWithTimeout(r *http.Request, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	defer cancel()

	done := make(chan error, 1)
	go func() {
		done <- m.Verify(r.WithContext(ctx))
	}()

	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		return fmt.Errorf("AUTH_FAILED: timeout")
	}
}
