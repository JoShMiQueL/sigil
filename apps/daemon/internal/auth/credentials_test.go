package auth

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSaveLoadRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "creds.json")

	creds := &Credentials{
		NodeID:   "node-uuid-123",
		SecretID: "sid-abc",
		Secret:   "sigilnode_secretvalue",
	}

	if err := SaveCredentials(path, creds); err != nil {
		t.Fatalf("save: %v", err)
	}

	loaded, err := LoadCredentials(path)
	if err != nil {
		t.Fatalf("load: %v", err)
	}

	if loaded.NodeID != creds.NodeID {
		t.Errorf("node_id mismatch: got %s, want %s", loaded.NodeID, creds.NodeID)
	}
	if loaded.SecretID != creds.SecretID {
		t.Errorf("secret_id mismatch: got %s, want %s", loaded.SecretID, creds.SecretID)
	}
	if loaded.Secret != creds.Secret {
		t.Errorf("secret mismatch: got %s, want %s", loaded.Secret, creds.Secret)
	}
}

func TestFilePermissions(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "creds.json")

	creds := &Credentials{
		NodeID:   "n",
		SecretID: "s",
		Secret:   "x",
	}
	if err := SaveCredentials(path, creds); err != nil {
		t.Fatalf("save: %v", err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}

	perm := info.Mode().Perm()
	if perm != credFilePerm {
		t.Errorf("expected permissions 0600, got %o", perm)
	}
}

func TestLoadMissingFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "nonexistent.json")

	_, err := LoadCredentials(path)
	if err == nil {
		t.Fatal("expected error for missing file, got nil")
	}
}

func TestLoadIncompleteCreds(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "creds.json")

	// Write credentials with missing secret
	data := []byte(`{"node_id":"x","secret_id":"y"}`)
	if err := os.WriteFile(path, data, credFilePerm); err != nil {
		t.Fatal(err)
	}

	_, err := LoadCredentials(path)
	if err == nil {
		t.Fatal("expected error for incomplete credentials, got nil")
	}
}

func TestCredentialsExist(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "creds.json")

	if CredentialsExist(path) {
		t.Fatal("expected CredentialsExist to return false for missing file")
	}

	creds := &Credentials{NodeID: "n", SecretID: "s", Secret: "x"}
	if err := SaveCredentials(path, creds); err != nil {
		t.Fatal(err)
	}

	if !CredentialsExist(path) {
		t.Fatal("expected CredentialsExist to return true after save")
	}
}
