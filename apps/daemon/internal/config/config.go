package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

type Config struct {
	PanelURL            string  `yaml:"panel_url"`
	PairingToken        string  `yaml:"pairing_token"`
	CredentialsPath     string  `yaml:"credentials_path"`
	VolumeBasePath      string  `yaml:"volume_base_path"`
	DockerSocket        string  `yaml:"docker_socket"`
	ListenAddress       string  `yaml:"listen_address"`
	HeartbeatIntervalSec int     `yaml:"heartbeat_interval_sec"`
	StopTimeoutSec      int     `yaml:"stop_timeout_sec"`
	DiskFullThresholdPct int     `yaml:"disk_full_threshold_pct"`
	UIDRangeStart       int     `yaml:"uid_range_start"`
	UIDRangeEnd         int     `yaml:"uid_range_end"`
	DefaultPidsLimit    int     `yaml:"default_pids_limit"`
	DefaultMemoryLimitMB int    `yaml:"default_memory_limit_mb"`
	DefaultCPULimit     float64 `yaml:"default_cpu_limit"`
	LogLevel            string  `yaml:"log_level"`
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	return &cfg, nil
}

func (c *Config) Validate() error {
	if c.PanelURL == "" {
		return fmt.Errorf("panel_url is required")
	}
	if c.CredentialsPath == "" {
		return fmt.Errorf("credentials_path is required")
	}
	if c.VolumeBasePath == "" {
		return fmt.Errorf("volume_base_path is required")
	}
	if c.ListenAddress == "" {
		c.ListenAddress = "0.0.0.0:8080"
	}
	if c.DockerSocket == "" {
		c.DockerSocket = "/var/run/docker.sock"
	}
	if c.HeartbeatIntervalSec <= 0 {
		return fmt.Errorf("heartbeat_interval_sec must be > 0")
	}
	if c.StopTimeoutSec <= 0 {
		c.StopTimeoutSec = 10
	}
	if c.DiskFullThresholdPct <= 0 || c.DiskFullThresholdPct > 100 {
		return fmt.Errorf("disk_full_threshold_pct must be 1-100")
	}
	if c.UIDRangeStart <= 0 || c.UIDRangeEnd <= c.UIDRangeStart {
		return fmt.Errorf("uid_range_start must be < uid_range_end and > 0")
	}
	if c.DefaultPidsLimit <= 0 {
		c.DefaultPidsLimit = 512
	}
	if c.DefaultMemoryLimitMB <= 0 {
		c.DefaultMemoryLimitMB = 512
	}
	if c.DefaultCPULimit <= 0 {
		c.DefaultCPULimit = 1.0
	}
	if c.LogLevel == "" {
		c.LogLevel = "info"
	}

	// Ensure credential directory exists
	dir := filepath.Dir(c.CredentialsPath)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return fmt.Errorf("create credentials dir: %w", err)
		}
	}

	// Ensure volume base path exists
	if err := os.MkdirAll(c.VolumeBasePath, 0o755); err != nil {
		return fmt.Errorf("create volume base path: %w", err)
	}

	return nil
}
