package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
	"time"
)

const timestampWindowSec = 60

func ComputeSignature(secret string, timestamp int64, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(fmt.Sprintf("%d", timestamp)))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func Sign(secret string, body []byte) (string, int64) {
	ts := time.Now().Unix()
	sig := ComputeSignature(secret, ts, body)
	return sig, ts
}

func VerifySignature(secret string, timestamp int64, body []byte, signature string) error {
	now := time.Now().Unix()

	// Check timestamp window
	diff := now - timestamp
	if diff < 0 {
		diff = -diff
	}
	if diff > timestampWindowSec {
		return fmt.Errorf("TIMESTAMP_OUT_OF_WINDOW: timestamp outside ±%ds window", timestampWindowSec)
	}

	expected := ComputeSignature(secret, timestamp, body)
	if !hmac.Equal([]byte(expected), []byte(signature)) {
		return fmt.Errorf("invalid signature")
	}

	return nil
}

func VerifyTimestamp(tsStr string) (int64, error) {
	ts, err := strconv.ParseInt(tsStr, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid timestamp: %w", err)
	}
	return ts, nil
}
