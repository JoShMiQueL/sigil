package auth

import (
	"encoding/json"
	"fmt"
	"os"
)

type Credentials struct {
	NodeID   string `json:"node_id"`
	SecretID string `json:"secret_id"`
	Secret   string `json:"secret"`
}

const credFilePerm = 0o600

func LoadCredentials(path string) (*Credentials, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("credentials not found at %s (first run?)", path)
		}
		return nil, fmt.Errorf("read credentials: %w", err)
	}

	var creds Credentials
	if err := json.Unmarshal(data, &creds); err != nil {
		return nil, fmt.Errorf("parse credentials: %w", err)
	}

	if creds.NodeID == "" || creds.SecretID == "" || creds.Secret == "" {
		return nil, fmt.Errorf("credentials file is incomplete")
	}

	return &creds, nil
}

func SaveCredentials(path string, creds *Credentials) error {
	data, err := json.MarshalIndent(creds, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal credentials: %w", err)
	}

	if err := os.WriteFile(path, data, credFilePerm); err != nil {
		return fmt.Errorf("write credentials: %w", err)
	}

	// Ensure permissions are exactly 0600 (WriteFile respects umask)
	if err := os.Chmod(path, credFilePerm); err != nil {
		return fmt.Errorf("chmod credentials: %w", err)
	}

	return nil
}

func CredentialsExist(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
