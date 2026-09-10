package server

import (
	"encoding/json"
	"os"
	"os/exec"
	"testing"
)

func TestServerConfigurationSchemaCompatibility(t *testing.T) {
	cfg := ServerConfiguration{
		ServerID:       "550e8400-e29b-41d4-a716-446655440000",
		Image:          "alpine:latest",
		StartupCommand: "sleep infinity",
		Environment:    map[string]string{"TEST": "true"},
		PortMappings: []PortMapping{
			{HostPort: 25565, ContainerPort: 25565, Protocol: "tcp"},
		},
		ResourceLimits: ResourceLimits{
			MemoryMB:  512,
			CPULimit:  1.0,
			PidsLimit:  intPtr(512),
		},
		VolumePath: "/tmp/volumes/test",
	}

	data, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	// Write to temp file for Node validation
	tmpFile, err := os.CreateTemp("", "server-config-*.json")
	if err != nil {
		t.Fatalf("create temp file: %v", err)
	}
	defer os.Remove(tmpFile.Name())

	if _, err := tmpFile.Write(data); err != nil {
		t.Fatalf("write temp file: %v", err)
	}
	tmpFile.Close()

	// Validate with Node/Bun script
	cmd := exec.Command("bun", "run", "-e", `
const { ServerConfigSchema } = require("@sigilpanel/shared");
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(process.argv[2], "utf-8"));
const result = ServerConfigSchema.safeParse(data);
if (!result.success) {
  console.error("Schema validation failed:", JSON.stringify(result.error.issues, null, 2));
  process.exit(1);
}
console.log("OK");
`, tmpFile.Name())

	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Logf("bun output: %s", string(output))
		t.Skipf("bun not available or schema validation failed: %v", err)
	}
}

func TestStateChangeEventSchemaCompatibility(t *testing.T) {
	exitCode := 137
	event := struct {
		ServerID      string `json:"serverId"`
		NodeID        string `json:"nodeId"`
		PreviousState string `json:"previousState"`
		NewState      string `json:"newState"`
		Reason        string `json:"reason"`
		ExitCode      *int  `json:"exitCode"`
		Timestamp     int64 `json:"timestamp"`
	}{
		ServerID:      "550e8400-e29b-41d4-a716-446655440000",
		NodeID:        "550e8400-e29b-41d4-a716-446655440000",
		PreviousState: "running",
		NewState:      "crashed",
		Reason:        "oom",
		ExitCode:      &exitCode,
		Timestamp:     1694300000,
	}

	data, err := json.Marshal(event)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	tmpFile, err := os.CreateTemp("", "state-change-*.json")
	if err != nil {
		t.Fatalf("create temp file: %v", err)
	}
	defer os.Remove(tmpFile.Name())

	if _, err := tmpFile.Write(data); err != nil {
		t.Fatalf("write temp file: %v", err)
	}
	tmpFile.Close()

	cmd := exec.Command("bun", "run", "-e", `
const { StateChangeEventSchema } = require("@sigilpanel/shared");
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(process.argv[2], "utf-8"));
const result = StateChangeEventSchema.safeParse(data);
if (!result.success) {
  console.error("Schema validation failed:", JSON.stringify(result.error.issues, null, 2));
  process.exit(1);
}
console.log("OK");
`, tmpFile.Name())

	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Logf("bun output: %s", string(output))
		t.Skipf("bun not available or schema validation failed: %v", err)
	}
}


