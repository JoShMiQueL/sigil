package config

import (
	"os"
	"path/filepath"
	"testing"
)

func writeTempConfig(t *testing.T, content string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "daemon.yaml")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestLoadValidConfig(t *testing.T) {
	volDir := t.TempDir()
	credDir := t.TempDir()
	backupDir := t.TempDir()
	cfg := `
panel_url: http://localhost:3000
pairing_token: sigilpair_test
credentials_path: ` + filepath.Join(credDir, "creds.json") + `
volume_base_path: ` + volDir + `
backup_base_path: ` + backupDir + `
docker_socket: /var/run/docker.sock
listen_address: 127.0.0.1:8080
heartbeat_interval_sec: 5
stop_timeout_sec: 10
disk_full_threshold_pct: 95
uid_range_start: 1000
uid_range_end: 65535
default_pids_limit: 512
default_memory_limit_mb: 512
default_cpu_limit: 1.0
log_level: info
`
	path := writeTempConfig(t, cfg)
	c, err := Load(path)
	if err != nil {
		t.Fatalf("expected valid config, got error: %v", err)
	}
	if c.PanelURL != "http://localhost:3000" {
		t.Errorf("expected panel_url http://localhost:3000, got %s", c.PanelURL)
	}
	if c.HeartbeatIntervalSec != 5 {
		t.Errorf("expected heartbeat 5, got %d", c.HeartbeatIntervalSec)
	}
}

func TestLoadMissingPanelURL(t *testing.T) {
	volDir := t.TempDir()
	credDir := t.TempDir()
	cfg := `
credentials_path: ` + filepath.Join(credDir, "creds.json") + `
volume_base_path: ` + volDir + `
heartbeat_interval_sec: 5
disk_full_threshold_pct: 95
uid_range_start: 1000
uid_range_end: 65535
`
	path := writeTempConfig(t, cfg)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for missing panel_url, got nil")
	}
}

func TestLoadInvalidHeartbeat(t *testing.T) {
	volDir := t.TempDir()
	credDir := t.TempDir()
	cfg := `
panel_url: http://localhost:3000
credentials_path: ` + filepath.Join(credDir, "creds.json") + `
volume_base_path: ` + volDir + `
heartbeat_interval_sec: 0
disk_full_threshold_pct: 95
uid_range_start: 1000
uid_range_end: 65535
`
	path := writeTempConfig(t, cfg)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for heartbeat_interval_sec=0, got nil")
	}
}

func TestLoadInvalidDiskThreshold(t *testing.T) {
	volDir := t.TempDir()
	credDir := t.TempDir()
	cfg := `
panel_url: http://localhost:3000
credentials_path: ` + filepath.Join(credDir, "creds.json") + `
volume_base_path: ` + volDir + `
heartbeat_interval_sec: 5
disk_full_threshold_pct: 150
uid_range_start: 1000
uid_range_end: 65535
`
	path := writeTempConfig(t, cfg)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for disk_full_threshold_pct=150, got nil")
	}
}

func TestLoadInvalidUIDRange(t *testing.T) {
	volDir := t.TempDir()
	credDir := t.TempDir()
	cfg := `
panel_url: http://localhost:3000
credentials_path: ` + filepath.Join(credDir, "creds.json") + `
volume_base_path: ` + volDir + `
heartbeat_interval_sec: 5
disk_full_threshold_pct: 95
uid_range_start: 5000
uid_range_end: 1000
`
	path := writeTempConfig(t, cfg)
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for uid_range_start > uid_range_end, got nil")
	}
}

func TestLoadMissingFile(t *testing.T) {
	_, err := Load("/nonexistent/path/daemon.yaml")
	if err == nil {
		t.Fatal("expected error for missing file, got nil")
	}
}

func TestLoadMalformedYAML(t *testing.T) {
	path := writeTempConfig(t, "{{{malformed")
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for malformed YAML, got nil")
	}
}
