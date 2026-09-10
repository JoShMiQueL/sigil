//go:build integration

package docker

import (
	"context"
	"fmt"
	"testing"
	"time"
)

func TestMonitorStartDieStopEvents(t *testing.T) {
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
	monitor := NewMonitor(client, "test-node")

	// Start monitor in background
	go monitor.Start(ctx)

	serverID := fmt.Sprintf("monitor-test-%d", time.Now().UnixNano())
	cfg := &ContainerConfig{
		ServerID:       serverID,
		Image:          "alpine:latest",
		StartupCommand: "sleep 2",
		VolumePath:     fmt.Sprintf("/tmp/sigil-test-%d", time.Now().UnixNano()),
		MemoryMB:       64,
		CPULimit:       0.5,
	}

	// Create container
	containerID, err := mgr.Create(ctx, cfg)
	if err != nil {
		t.Fatalf("create failed: %v", err)
	}
	defer mgr.Remove(ctx, containerID, "")

	// Wait for start event
	startEvent := waitForEvent(t, monitor.Events(), 5*time.Second)
	if startEvent == nil {
		t.Fatal("expected start event")
	}
	if startEvent.ServerID != serverID {
		t.Errorf("expected serverId %s, got %s", serverID, startEvent.ServerID)
	}
	if startEvent.NewState != "running" {
		t.Errorf("expected newState running, got %s", startEvent.NewState)
	}

	// Wait for die event (container exits after 2s)
	dieEvent := waitForEvent(t, monitor.Events(), 10*time.Second)
	if dieEvent == nil {
		t.Fatal("expected die event")
	}
	if dieEvent.NewState != "stopped" && dieEvent.NewState != "crashed" {
		t.Errorf("expected newState stopped or crashed, got %s", dieEvent.NewState)
	}
}

func TestMonitorDestroyEvent(t *testing.T) {
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
	monitor := NewMonitor(client, "test-node")

	go monitor.Start(ctx)

	serverID := fmt.Sprintf("monitor-destroy-%d", time.Now().UnixNano())
	cfg := &ContainerConfig{
		ServerID:       serverID,
		Image:          "alpine:latest",
		StartupCommand: "sleep infinity",
		VolumePath:     fmt.Sprintf("/tmp/sigil-destroy-%d", time.Now().UnixNano()),
		MemoryMB:       64,
		CPULimit:       0.5,
	}

	containerID, err := mgr.Create(ctx, cfg)
	if err != nil {
		t.Fatalf("create failed: %v", err)
	}

	// Wait for start event
	_ = waitForEvent(t, monitor.Events(), 5*time.Second)

	// Remove container — should produce destroy event
	if err := mgr.Remove(ctx, containerID, ""); err != nil {
		t.Fatalf("remove failed: %v", err)
	}

	// Wait for destroy or die event
	destroyEvent := waitForEvent(t, monitor.Events(), 10*time.Second)
	if destroyEvent == nil {
		t.Fatal("expected destroy or die event")
	}
}

func waitForEvent(t *testing.T, ch <-chan StateChangeEvent, timeout time.Duration) *StateChangeEvent {
	t.Helper()
	select {
	case event := <-ch:
		return &event
	case <-time.After(timeout):
		return nil
	}
}
