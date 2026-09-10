package panel

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/sigil/sigil/apps/daemon/internal/auth"
	srvtypes "github.com/sigil/sigil/apps/daemon/internal/docker"
)

func TestRegisterSuccess(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/node/register" {
			t.Errorf("expected /api/node/register, got %s", r.URL.Path)
		}

		body, _ := io.ReadAll(r.Body)
		var req map[string]any
		if err := json.Unmarshal(body, &req); err != nil {
			t.Fatalf("invalid JSON: %v", err)
		}

		if req["pairingToken"] != "sigilpair_test" {
			t.Errorf("expected pairing token sigilpair_test, got %v", req["pairingToken"])
		}
		if req["hostname"] != "node-1" {
			t.Errorf("expected hostname node-1, got %v", req["hostname"])
		}

		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(`{"nodeId":"node-uuid","secretId":"sid-123","secret":"sigilnode_secret"}`))
	}))
	defer ts.Close()

	client := NewClient(ts.URL, 5*time.Second)
	creds, err := client.Register("sigilpair_test", "node-1", "10.0.0.1", map[string]bool{"docker": true})
	if err != nil {
		t.Fatalf("register failed: %v", err)
	}

	if creds.NodeID != "node-uuid" {
		t.Errorf("expected node-uuid, got %s", creds.NodeID)
	}
	if creds.SecretID != "sid-123" {
		t.Errorf("expected sid-123, got %s", creds.SecretID)
	}
	if creds.Secret != "sigilnode_secret" {
		t.Errorf("expected sigilnode_secret, got %s", creds.Secret)
	}
}

func TestRegisterPanelError(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"error":{"code":"PAIRING_TOKEN_INVALID","message":"token expired"}}`))
	}))
	defer ts.Close()

	client := NewClient(ts.URL, 5*time.Second)
	_, err := client.Register("badtoken", "node-1", "10.0.0.1", map[string]bool{})
	if err == nil {
		t.Fatal("expected error for invalid token, got nil")
	}
}

func TestRegisterConnectionError(t *testing.T) {
	client := NewClient("http://127.0.0.1:0", 1*time.Second)
	_, err := client.Register("token", "node-1", "10.0.0.1", map[string]bool{})
	if err == nil {
		t.Fatal("expected connection error, got nil")
	}
}

func TestSendHeartbeatSuccess(t *testing.T) {
	var receivedBody []byte
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/node/heartbeat" {
			t.Errorf("expected /api/node/heartbeat, got %s", r.URL.Path)
		}

		if r.Header.Get("X-Node-Id") != "sid-test" {
			t.Errorf("expected X-Node-Id sid-test, got %s", r.Header.Get("X-Node-Id"))
		}
		if r.Header.Get("X-Node-Signature") == "" {
			t.Error("expected non-empty X-Node-Signature")
		}
		if r.Header.Get("X-Node-Timestamp") == "" {
			t.Error("expected non-empty X-Node-Timestamp")
		}

		receivedBody, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer ts.Close()

	client := NewClient(ts.URL, 5*time.Second)
	client.SetCredentials(&auth.Credentials{
		NodeID:   "node-uuid",
		SecretID: "sid-test",
		Secret:   "testsecret",
	})

	payload := HeartbeatPayload{
		Timestamp:       time.Now().Unix(),
		CPUUsage:        42.5,
		MemoryUsage:     68.0,
		DiskUsage:       35.2,
		ContainerCount:  5,
		DockerAvailable: true,
	}

	if err := client.SendHeartbeat(payload); err != nil {
		t.Fatalf("heartbeat failed: %v", err)
	}

	var received HeartbeatPayload
	if err := json.Unmarshal(receivedBody, &received); err != nil {
		t.Fatalf("invalid heartbeat JSON: %v", err)
	}

	if received.CPUUsage != 42.5 {
		t.Errorf("expected CPU 42.5, got %f", received.CPUUsage)
	}
	if received.DockerAvailable != true {
		t.Errorf("expected dockerAvailable true, got %v", received.DockerAvailable)
	}
}

func TestSendHeartbeatRevoked(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"error":{"code":"NODE_AUTH_FAILED","message":"Invalid credentials"}}`))
	}))
	defer ts.Close()

	client := NewClient(ts.URL, 5*time.Second)
	client.SetCredentials(&auth.Credentials{
		NodeID:   "node-uuid",
		SecretID: "sid-test",
		Secret:   "testsecret",
	})

	err := client.SendHeartbeat(HeartbeatPayload{
		Timestamp: time.Now().Unix(),
	})
	if err != ErrCredentialsRevoked {
		t.Errorf("expected ErrCredentialsRevoked, got %v", err)
	}
}

func TestSendHeartbeatNoCredentials(t *testing.T) {
	client := NewClient("http://localhost:3000", 5*time.Second)
	err := client.SendHeartbeat(HeartbeatPayload{})
	if err == nil {
		t.Fatal("expected error for missing credentials, got nil")
	}
	if !strings.Contains(err.Error(), "no credentials") {
		t.Errorf("expected 'no credentials' error, got: %v", err)
	}
}

func TestSendStateChangeSuccess(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/node/server-state" {
			t.Errorf("expected /api/node/server-state, got %s", r.URL.Path)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer ts.Close()

	client := NewClient(ts.URL, 5*time.Second)
	client.SetCredentials(&auth.Credentials{
		NodeID:   "node-uuid",
		SecretID: "sid-test",
		Secret:   "testsecret",
	})

	exitCode := 137
	err := client.SendStateChange(srvtypes.StateChangeEvent{
		ServerID:      "server-uuid",
		NodeID:        "node-uuid",
		PreviousState: "running",
		NewState:      "crashed",
		Reason:        "oom",
		ExitCode:      &exitCode,
		Timestamp:     time.Now().Unix(),
	})
	if err != nil {
		t.Fatalf("state change failed: %v", err)
	}
}

func TestRetryWithBackoffSuccess(t *testing.T) {
	cfg := RetryConfig{Max: 3, Initial: 10 * time.Millisecond, MaxWait: 50 * time.Millisecond}

	calls := 0
	err := RetryWithBackoff(context.Background(), cfg, func() error {
		calls++
		if calls < 2 {
			return fmt.Errorf("transient error")
		}
		return nil
	})
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if calls != 2 {
		t.Errorf("expected 2 calls, got %d", calls)
	}
}

func TestRetryWithBackoffMaxRetries(t *testing.T) {
	cfg := RetryConfig{Max: 3, Initial: 10 * time.Millisecond, MaxWait: 50 * time.Millisecond}

	err := RetryWithBackoff(context.Background(), cfg, func() error {
		return fmt.Errorf("permanent failure")
	})
	if err == nil {
		t.Fatal("expected error after max retries, got nil")
	}
}

func TestRetryWithBackoffRevokedStopsImmediately(t *testing.T) {
	cfg := RetryConfig{Max: 5, Initial: 10 * time.Millisecond, MaxWait: 50 * time.Millisecond}

	calls := 0
	err := RetryWithBackoff(context.Background(), cfg, func() error {
		calls++
		return ErrCredentialsRevoked
	})
	if err != ErrCredentialsRevoked {
		t.Errorf("expected ErrCredentialsRevoked, got %v", err)
	}
	if calls != 1 {
		t.Errorf("expected 1 call (no retry on revoked), got %d", calls)
	}
}
