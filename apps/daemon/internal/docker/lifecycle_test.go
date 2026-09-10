//go:build integration

package docker

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLifecycleCreateStartStopRestartRemove(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	client, err := NewClient("")
	if err != nil {
		t.Skipf("docker not available: %v", err)
	}
	defer client.Close()

	if err := client.WaitForConnection(ctx, 3, 2*time.Second); err != nil {
		t.Skipf("docker not reachable: %v", err)
	}

	mgr := NewLifecycleManager(client, "test-node")

	serverID := fmt.Sprintf("test-%d", time.Now().UnixNano())
	volumePath := filepath.Join(t.TempDir(), serverID)

	cfg := &ContainerConfig{
		ServerID:       serverID,
		Image:          "alpine:latest",
		StartupCommand: "sleep infinity",
		Environment:    map[string]string{"TEST": "true"},
		VolumePath:     volumePath,
		MemoryMB:       64,
		CPULimit:       0.5,
		PidsLimit:      ptrInt(64),
	}

	// Create
	containerID, err := mgr.Create(ctx, cfg)
	if err != nil {
		t.Fatalf("create failed: %v", err)
	}
	if containerID == "" {
		t.Fatal("expected non-empty container ID")
	}
	t.Logf("created container: %s", containerID)

	// Verify it's running
	info, err := client.Raw().ContainerInspect(ctx, containerID)
	if err != nil {
		t.Fatalf("inspect failed: %v", err)
	}
	if !info.State.Running {
		t.Fatal("expected container to be running after create")
	}

	// Verify labels
	if info.Config.Labels[LabelServerID] != serverID {
		t.Errorf("expected label %s, got %s", serverID, info.Config.Labels[LabelServerID])
	}
	if info.Config.Labels[LabelManaged] != "true" {
		t.Error("expected sigilpanel.managed=true label")
	}

	// Stop
	if err := mgr.Stop(ctx, containerID, 5); err != nil {
		t.Fatalf("stop failed: %v", err)
	}
	info, _ = client.Raw().ContainerInspect(ctx, containerID)
	if info.State.Running {
		t.Fatal("expected container to be stopped")
	}

	// Start (from stopped)
	if err := mgr.Start(ctx, containerID); err != nil {
		t.Fatalf("start failed: %v", err)
	}
	info, _ = client.Raw().ContainerInspect(ctx, containerID)
	if !info.State.Running {
		t.Fatal("expected container to be running after start")
	}

	// Idempotent start (already running — should be no-op)
	if err := mgr.Start(ctx, containerID); err != nil {
		t.Fatalf("idempotent start failed: %v", err)
	}

	// Restart
	if err := mgr.Restart(ctx, containerID, 5); err != nil {
		t.Fatalf("restart failed: %v", err)
	}
	info, _ = client.Raw().ContainerInspect(ctx, containerID)
	if !info.State.Running {
		t.Fatal("expected container to be running after restart")
	}

	// Idempotent stop (running → stop, then stop again → no-op)
	if err := mgr.Stop(ctx, containerID, 5); err != nil {
		t.Fatalf("stop failed: %v", err)
	}
	if err := mgr.Stop(ctx, containerID, 5); err != nil {
		t.Fatalf("idempotent stop failed: %v", err)
	}

	// Remove
	if err := mgr.Remove(ctx, containerID, volumePath); err != nil {
		t.Fatalf("remove failed: %v", err)
	}

	// Verify container is gone
	_, err = client.Raw().ContainerInspect(ctx, containerID)
	if err == nil {
		t.Fatal("expected error inspecting removed container")
	}

	// Verify volume directory is cleaned up
	if _, err := os.Stat(volumePath); !os.IsNotExist(err) {
		t.Errorf("expected volume directory to be removed, got err: %v", err)
	}
}

func TestLifecycleFindByServerID(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	client, err := NewClient("")
	if err != nil {
		t.Skipf("docker not available: %v", err)
	}
	defer client.Close()

	if err := client.WaitForConnection(ctx, 3, 2*time.Second); err != nil {
		t.Skipf("docker not reachable: %v", err)
	}

	mgr := NewLifecycleManager(client, "test-node")
	serverID := fmt.Sprintf("find-%d", time.Now().UnixNano())

	cfg := &ContainerConfig{
		ServerID:       serverID,
		Image:          "alpine:latest",
		StartupCommand: "sleep infinity",
		VolumePath:     filepath.Join(t.TempDir(), serverID),
		MemoryMB:       64,
		CPULimit:       0.5,
	}

	containerID, err := mgr.Create(ctx, cfg)
	if err != nil {
		t.Fatalf("create failed: %v", err)
	}
	defer mgr.Remove(ctx, containerID, "")

	foundID, err := mgr.FindByServerID(ctx, serverID)
	if err != nil {
		t.Fatalf("FindByServerID failed: %v", err)
	}
	if foundID != containerID {
		t.Errorf("expected %s, got %s", containerID, foundID)
	}

	// Not found
	_, err = mgr.FindByServerID(ctx, "nonexistent-server-id")
	if err == nil {
		t.Fatal("expected error for non-existent server")
	}
}

func TestLifecycleListByLabel(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	client, err := NewClient("")
	if err != nil {
		t.Skipf("docker not available: %v", err)
	}
	defer client.Close()

	if err := client.WaitForConnection(ctx, 3, 2*time.Second); err != nil {
		t.Skipf("docker not reachable: %v", err)
	}

	mgr := NewLifecycleManager(client, "test-node")
	serverID := fmt.Sprintf("list-%d", time.Now().UnixNano())

	cfg := &ContainerConfig{
		ServerID:       serverID,
		Image:          "alpine:latest",
		StartupCommand: "sleep infinity",
		VolumePath:     filepath.Join(t.TempDir(), serverID),
		MemoryMB:       64,
		CPULimit:       0.5,
	}

	containerID, err := mgr.Create(ctx, cfg)
	if err != nil {
		t.Fatalf("create failed: %v", err)
	}
	defer mgr.Remove(ctx, containerID, "")

	containers, err := mgr.ListByLabel(ctx)
	if err != nil {
		t.Fatalf("ListByLabel failed: %v", err)
	}

	found := false
	for _, c := range containers {
		if c.ID == containerID {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected to find created container in list")
	}
}
