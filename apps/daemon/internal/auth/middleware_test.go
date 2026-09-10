package auth

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

func makeAuthRequest(secret, body string, ts int64) *http.Request {
	req := httptest.NewRequest(http.MethodPost, "/servers", strings.NewReader(body))
	sig := ComputeSignature(secret, ts, []byte(body))
	req.Header.Set("X-Node-Id", "sid-test")
	req.Header.Set("X-Node-Signature", sig)
	req.Header.Set("X-Node-Timestamp", strconv.FormatInt(ts, 10))
	return req
}

func TestMWValidAuth(t *testing.T) {
	secret := "testsecret"
	body := `{"hello":"world"}`
	ts := time.Now().Unix()

	store := &StaticCredentialStore{SecretID: "sid-test", Secret: secret}
	mw := NewAuthMiddleware(store)

	called := false
	handler := mw.Wrap(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}))

	req := makeAuthRequest(secret, body, ts)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if !called {
		t.Fatal("expected handler to be called with valid auth")
	}
	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}
}

func TestMWMissingHeaders(t *testing.T) {
	store := &StaticCredentialStore{SecretID: "sid-test", Secret: "secret"}
	mw := NewAuthMiddleware(store)

	handler := mw.Wrap(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not be called")
	}))

	req := httptest.NewRequest(http.MethodPost, "/servers", strings.NewReader(`{}`))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rr.Code)
	}
}

func TestMWInvalidSignature(t *testing.T) {
	store := &StaticCredentialStore{SecretID: "sid-test", Secret: "realsecret"}
	mw := NewAuthMiddleware(store)

	handler := mw.Wrap(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not be called")
	}))

	body := `{"test":true}`
	ts := time.Now().Unix()
	req := httptest.NewRequest(http.MethodPost, "/servers", strings.NewReader(body))
	req.Header.Set("X-Node-Id", "sid-test")
	req.Header.Set("X-Node-Signature", "invalid-signature")
	req.Header.Set("X-Node-Timestamp", intToStr(ts))

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rr.Code)
	}
}

func TestMWExpiredTimestamp(t *testing.T) {
	secret := "testsecret"
	store := &StaticCredentialStore{SecretID: "sid-test", Secret: secret}
	mw := NewAuthMiddleware(store)

	handler := mw.Wrap(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not be called")
	}))

	body := `{"test":true}`
	ts := time.Now().Unix() - 120
	req := httptest.NewRequest(http.MethodPost, "/servers", strings.NewReader(body))
	sig := ComputeSignature(secret, ts, []byte(body))
	req.Header.Set("X-Node-Id", "sid-test")
	req.Header.Set("X-Node-Signature", sig)
	req.Header.Set("X-Node-Timestamp", intToStr(ts))

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for expired timestamp, got %d", rr.Code)
	}
}

func TestMWWrongSecretID(t *testing.T) {
	store := &StaticCredentialStore{SecretID: "sid-correct", Secret: "secret"}
	mw := NewAuthMiddleware(store)

	handler := mw.Wrap(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not be called")
	}))

	body := `{"test":true}`
	ts := time.Now().Unix()
	req := httptest.NewRequest(http.MethodPost, "/servers", strings.NewReader(body))
	sig := ComputeSignature("secret", ts, []byte(body))
	req.Header.Set("X-Node-Id", "sid-wrong")
	req.Header.Set("X-Node-Signature", sig)
	req.Header.Set("X-Node-Timestamp", intToStr(ts))

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rr.Code)
	}
}

func intToStr(n int64) string {
	return strconv.FormatInt(n, 10)
}
