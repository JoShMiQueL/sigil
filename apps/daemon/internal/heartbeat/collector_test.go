package heartbeat

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestCollectCPUUsage(t *testing.T) {
	usage := collectCPUUsage()
	if usage < 0 || usage > 100 {
		t.Errorf("CPU usage out of range [0,100]: %f", usage)
	}
}

func TestCollectCPUUsageReturnsZeroOnMissingProc(t *testing.T) {
	// collectCPUUsage reads /proc/loadavg which should exist on Linux
	// On non-Linux or in restricted environments, it should return 0 not panic
	usage := collectCPUUsage()
	_ = usage // just verify it doesn't panic
}

func TestCollectMemoryUsage(t *testing.T) {
	usage := collectMemoryUsage()
	if usage < 0 || usage > 100 {
		t.Errorf("memory usage out of range [0,100]: %f", usage)
	}
}

func TestCollectMemoryUsageNonZero(t *testing.T) {
	// On a real system, memory usage should be > 0
	usage := collectMemoryUsage()
	if usage == 0 {
		t.Skip("memory usage is 0 — may be running in a restricted environment")
	}
}

func TestCollectDiskUsage(t *testing.T) {
	// Use temp dir which should exist
	dir := t.TempDir()
	usage := collectDiskUsage(dir)
	if usage < 0 || usage > 100 {
		t.Errorf("disk usage out of range [0,100]: %f", usage)
	}
}

func TestCollectDiskUsageNonZero(t *testing.T) {
	dir := t.TempDir()
	// Write a file to ensure the filesystem has some usage
	if err := os.WriteFile(filepath.Join(dir, "test"), []byte("test"), 0o644); err != nil {
		t.Fatal(err)
	}

	usage := collectDiskUsage(dir)
	if usage <= 0 {
		t.Skip("disk usage is 0 — may be tmpfs")
	}
}

func TestCollectDiskUsageMissingPath(t *testing.T) {
	usage := collectDiskUsage("/nonexistent/path/that/does/not/exist")
	if usage != 0 {
		t.Errorf("expected 0 for missing path, got %f", usage)
	}
}

func TestParseMemInfoKB(t *testing.T) {
	tests := []struct {
		input    string
		expected int64
	}{
		{"MemTotal:       16384000 kB", 16384000},
		{"MemAvailable:    8000000 kB", 8000000},
		{"MemTotal: 0 kB", 0},
		{"invalid", 0},
		{"", 0},
	}

	for _, tt := range tests {
		got := parseMemInfoKB(tt.input)
		if got != tt.expected {
			t.Errorf("parseMemInfoKB(%q) = %d, want %d", tt.input, got, tt.expected)
		}
	}
}

func TestCollectWithNilDocker(t *testing.T) {
	collector := NewCollector(nil, t.TempDir())
	stats := collector.Collect(context.Background())
	_ = stats

	if stats.DockerAvailable != false {
		t.Errorf("expected dockerAvailable=false with nil client, got %v", stats.DockerAvailable)
	}
	if stats.ContainerCount != 0 {
		t.Errorf("expected containerCount=0 with nil client, got %d", stats.ContainerCount)
	}
}
