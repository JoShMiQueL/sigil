package server

import (
	"testing"
)

func ptr(i int) *int { return &i }

func TestValidateValidConfig(t *testing.T) {
	cfg := &ServerConfiguration{
		ServerID:       "550e8400-e29b-41d4-a716-446655440000",
		Image:          "alpine:latest",
		StartupCommand: "sleep infinity",
		VolumePath:     "/tmp/volumes/test",
		ResourceLimits: ResourceLimits{
			MemoryMB:  512,
			CPULimit:  1.0,
			PidsLimit: ptr(256),
		},
		PortMappings: []PortMapping{
			{HostPort: 25565, ContainerPort: 25565, Protocol: "tcp"},
		},
	}
	if err := ValidateConfig(cfg); err != nil {
		t.Fatalf("expected valid config, got: %v", err)
	}
}

func TestValidateMissingImage(t *testing.T) {
	cfg := &ServerConfiguration{
		ServerID:       "uuid",
		StartupCommand: "sleep infinity",
		VolumePath:     "/tmp/v",
		ResourceLimits: ResourceLimits{MemoryMB: 512, CPULimit: 1.0},
	}
	if err := ValidateConfig(cfg); err == nil {
		t.Fatal("expected error for missing image")
	}
}

func TestValidateMissingStartupCommand(t *testing.T) {
	cfg := &ServerConfiguration{
		ServerID:   "uuid",
		Image:      "alpine:latest",
		VolumePath: "/tmp/v",
		ResourceLimits: ResourceLimits{MemoryMB: 512, CPULimit: 1.0},
	}
	if err := ValidateConfig(cfg); err == nil {
		t.Fatal("expected error for missing startupCommand")
	}
}

func TestValidateMissingVolumePath(t *testing.T) {
	cfg := &ServerConfiguration{
		ServerID:       "uuid",
		Image:          "alpine:latest",
		StartupCommand: "sleep infinity",
		ResourceLimits: ResourceLimits{MemoryMB: 512, CPULimit: 1.0},
	}
	if err := ValidateConfig(cfg); err == nil {
		t.Fatal("expected error for missing volumePath")
	}
}

func TestValidateInvalidPort(t *testing.T) {
	cfg := &ServerConfiguration{
		ServerID:       "uuid",
		Image:          "alpine:latest",
		StartupCommand: "sleep infinity",
		VolumePath:     "/tmp/v",
		ResourceLimits: ResourceLimits{MemoryMB: 512, CPULimit: 1.0},
		PortMappings: []PortMapping{
			{HostPort: 0, ContainerPort: 25565, Protocol: "tcp"},
		},
	}
	if err := ValidateConfig(cfg); err == nil {
		t.Fatal("expected error for port 0")
	}
}

func TestValidateInvalidProtocol(t *testing.T) {
	cfg := &ServerConfiguration{
		ServerID:       "uuid",
		Image:          "alpine:latest",
		StartupCommand: "sleep infinity",
		VolumePath:     "/tmp/v",
		ResourceLimits: ResourceLimits{MemoryMB: 512, CPULimit: 1.0},
		PortMappings: []PortMapping{
			{HostPort: 25565, ContainerPort: 25565, Protocol: "icmp"},
		},
	}
	if err := ValidateConfig(cfg); err == nil {
		t.Fatal("expected error for invalid protocol")
	}
}

func TestValidateInvalidMemory(t *testing.T) {
	cfg := &ServerConfiguration{
		ServerID:       "uuid",
		Image:          "alpine:latest",
		StartupCommand: "sleep infinity",
		VolumePath:     "/tmp/v",
		ResourceLimits: ResourceLimits{MemoryMB: 0, CPULimit: 1.0},
	}
	if err := ValidateConfig(cfg); err == nil {
		t.Fatal("expected error for memoryMb=0")
	}
}

func TestValidateInvalidPidsLimit(t *testing.T) {
	cfg := &ServerConfiguration{
		ServerID:       "uuid",
		Image:          "alpine:latest",
		StartupCommand: "sleep infinity",
		VolumePath:     "/tmp/v",
		ResourceLimits: ResourceLimits{MemoryMB: 512, CPULimit: 1.0, PidsLimit: ptr(10)},
	}
	if err := ValidateConfig(cfg); err == nil {
		t.Fatal("expected error for pidsLimit < 16")
	}
}

func TestValidateUnsafeCommand(t *testing.T) {
	tests := []string{
		"sleep infinity && rm -rf /",
		"sleep infinity; cat /etc/passwd",
		"$(whoami)",
		"`whoami`",
		"sleep > /dev/null",
		"sleep | grep foo",
		"sleep infinity\nrm -rf /",
	}

	for _, cmd := range tests {
		cfg := &ServerConfiguration{
			ServerID:       "uuid",
			Image:          "alpine:latest",
			StartupCommand: cmd,
			VolumePath:     "/tmp/v",
			ResourceLimits: ResourceLimits{MemoryMB: 512, CPULimit: 1.0},
		}
		if err := ValidateConfig(cfg); err == nil {
			t.Errorf("expected error for unsafe command: %s", cmd)
		}
	}
}

func TestValidateSafeCommand(t *testing.T) {
	cfg := &ServerConfiguration{
		ServerID:       "uuid",
		Image:          "alpine:latest",
		StartupCommand: "sleep infinity",
		VolumePath:     "/tmp/v",
		ResourceLimits: ResourceLimits{MemoryMB: 512, CPULimit: 1.0},
	}
	if err := ValidateConfig(cfg); err != nil {
		t.Fatalf("expected valid for safe command, got: %v", err)
	}
}
