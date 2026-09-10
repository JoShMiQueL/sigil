package auth

import (
	"fmt"
	"testing"
	"time"
)

func TestValidSignature(t *testing.T) {
	secret := "testsecret"
	body := []byte(`{"hello":"world"}`)
	ts := time.Now().Unix()

	sig := ComputeSignature(secret, ts, body)
	if err := VerifySignature(secret, ts, body, sig); err != nil {
		t.Fatalf("expected valid signature, got: %v", err)
	}
}

func TestInvalidSignature(t *testing.T) {
	secret := "testsecret"
	body := []byte(`{"hello":"world"}`)
	ts := time.Now().Unix()

	wrongSig := "deadbeef"
	err := VerifySignature(secret, ts, body, wrongSig)
	if err == nil {
		t.Fatal("expected error for invalid signature, got nil")
	}
}

func TestWrongSecret(t *testing.T) {
	secret := "testsecret"
	wrongSecret := "othersecret"
	body := []byte(`{"hello":"world"}`)
	ts := time.Now().Unix()

	sig := ComputeSignature(secret, ts, body)
	err := VerifySignature(wrongSecret, ts, body, sig)
	if err == nil {
		t.Fatal("expected error for wrong secret, got nil")
	}
}

func TestExpiredTimestamp(t *testing.T) {
	secret := "testsecret"
	body := []byte(`{}`)
	ts := time.Now().Unix() - 120 // 2 minutes ago

	sig := ComputeSignature(secret, ts, body)
	err := VerifySignature(secret, ts, body, sig)
	if err == nil {
		t.Fatal("expected error for expired timestamp, got nil")
	}
}

func TestFutureTimestamp(t *testing.T) {
	secret := "testsecret"
	body := []byte(`{}`)
	ts := time.Now().Unix() + 120 // 2 minutes in future

	sig := ComputeSignature(secret, ts, body)
	err := VerifySignature(secret, ts, body, sig)
	if err == nil {
		t.Fatal("expected error for future timestamp, got nil")
	}
}

func TestSignHelper(t *testing.T) {
	secret := "testsecret"
	body := []byte(`{"test":true}`)

	sig, ts := Sign(secret, body)
	if sig == "" {
		t.Fatal("expected non-empty signature")
	}
	if ts == 0 {
		t.Fatal("expected non-zero timestamp")
	}

	// Verify the signed output
	if err := VerifySignature(secret, ts, body, sig); err != nil {
		t.Fatalf("sign+verify failed: %v", err)
	}
}

func TestVerifyTimestampValid(t *testing.T) {
	ts, err := VerifyTimestamp("1736380800")
	if err != nil {
		t.Fatalf("expected valid timestamp, got: %v", err)
	}
	if ts != 1736380800 {
		t.Errorf("expected 1736380800, got %d", ts)
	}
}

func TestVerifyTimestampInvalid(t *testing.T) {
	_, err := VerifyTimestamp("notanumber")
	if err == nil {
		t.Fatal("expected error for invalid timestamp string")
	}
}

func TestVerifyTimestampEmpty(t *testing.T) {
	_, err := VerifyTimestamp("")
	if err == nil {
		t.Fatal("expected error for empty timestamp string")
	}
}

func TestDifferentBodyProducesDifferentSignature(t *testing.T) {
	secret := "testsecret"
	ts := time.Now().Unix()

	sig1 := ComputeSignature(secret, ts, []byte(`{"a":1}`))
	sig2 := ComputeSignature(secret, ts, []byte(`{"a":2}`))

	if sig1 == sig2 {
		t.Fatal("expected different signatures for different bodies")
	}
}

func TestSignatureFormat(t *testing.T) {
	secret := "testsecret"
	body := []byte(`test`)
	ts := time.Now().Unix()

	sig := ComputeSignature(secret, ts, body)
	if len(sig) != 64 { // SHA-256 hex = 64 chars
		t.Errorf("expected 64-char hex signature, got %d chars: %s", len(sig), sig)
	}
}

func init() {
	// Ensure fmt is used (for linter)
	_ = fmt.Sprintf("")
}
