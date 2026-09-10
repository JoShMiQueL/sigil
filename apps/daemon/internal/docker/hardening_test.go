//go:build integration

package docker

import (
	"context"
	"fmt"
	"testing"
	"time"
)

func TestHardeningContainerSecurity(t *testing.T) {
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
	serverID := fmt.Sprintf("harden-test-%d", time.Now().UnixNano())

	cfg := &ContainerConfig{
		ServerID:       serverID,
		Image:          "alpine:latest",
		StartupCommand: "sleep infinity",
		VolumePath:     fmt.Sprintf("/tmp/sigil-harden-%d", time.Now().UnixNano()),
		MemoryMB:       64,
		CPULimit:       0.5,
		PidsLimit:      ptrInt(64),
	}

	containerID, err := mgr.Create(ctx, cfg)
	if err != nil {
		t.Fatalf("create failed: %v", err)
	}
	defer mgr.Remove(ctx, containerID, "")

	info, err := client.Raw().ContainerInspect(ctx, containerID)
	if err != nil {
		t.Fatalf("inspect failed: %v", err)
	}

	// CapDrop contains ALL
	capDropAll := false
	for _, cap := range info.HostConfig.CapDrop {
		if cap == "ALL" {
			capDropAll = true
			break
		}
	}
	if !capDropAll {
		t.Error("expected CapDrop to contain ALL")
	}

	// SecurityOpt includes no-new-privileges
	noNewPrivs := false
	for _, opt := range info.HostConfig.SecurityOpt {
		if opt == "no-new-privileges" {
			noNewPrivs = true
			break
		}
	}
	if !noNewPrivs {
		t.Error("expected SecurityOpt to include no-new-privileges")
	}

	// User is non-root (1000:1000)
	if info.Config.User != "1000:1000" {
		t.Errorf("expected User 1000:1000, got %s", info.Config.User)
	}

	// PidsLimit is set
	if info.HostConfig.PidsLimit == nil || *info.HostConfig.PidsLimit != 64 {
		t.Error("expected PidsLimit to be 64")
	}

	// Memory limit is set
	if info.HostConfig.Memory == 0 {
		t.Error("expected Memory limit to be set")
	}

	// CPU limit is set (via CpuQuota/CpuPeriod)
	if info.HostConfig.CPUQuota == 0 {
		t.Error("expected CPUQuota to be set")
	}
	if info.HostConfig.CPUPeriod == 0 {
		t.Error("expected CPUPeriod to be set")
	}

	// Privileged is false
	if info.HostConfig.Privileged {
		t.Error("expected Privileged to be false")
	}

	// ReadonlyRootfs is true
	if !info.HostConfig.ReadonlyRootfs {
		t.Error("expected ReadonlyRootfs to be true")
	}

	// Docker socket is NOT mounted
	for _, mount := range info.Mounts {
		if mount.Source == "/var/run/docker.sock" {
			t.Error("docker socket should not be mounted")
		}
	}
}

func TestUIDAllocatorAllocateAndRelease(t *testing.T) {
	alloc := NewUIDAllocator(1000, 1010)

	uid1, err := alloc.Allocate("server-1")
	if err != nil {
		t.Fatalf("allocate failed: %v", err)
	}
	if uid1 < 1000 || uid1 > 1010 {
		t.Errorf("expected UID in range 1000-1010, got %d", uid1)
	}

	// Same server gets same UID
	uid1Again, err := alloc.Allocate("server-1")
	if err != nil {
		t.Fatalf("second allocate failed: %v", err)
	}
	if uid1 != uid1Again {
		t.Errorf("expected same UID %d, got %d", uid1, uid1Again)
	}

	// Different server gets different UID
	uid2, err := alloc.Allocate("server-2")
	if err != nil {
		t.Fatalf("allocate server-2 failed: %v", err)
	}
	if uid1 == uid2 {
		t.Error("expected different UIDs for different servers")
	}

	// Release server-1
	alloc.Release("server-1")

	// server-1's UID should be available again
	uid3, err := alloc.Allocate("server-3")
	if err != nil {
		t.Fatalf("allocate server-3 failed: %v", err)
	}
	if uid3 != uid1 {
		t.Errorf("expected released UID %d to be reused, got %d", uid1, uid3)
	}
}

func TestUIDAllocatorExhaustion(t *testing.T) {
	alloc := NewUIDAllocator(1000, 1002)

	_, err := alloc.Allocate("server-1")
	if err != nil {
		t.Fatalf("allocate 1 failed: %v", err)
	}
	_, err = alloc.Allocate("server-2")
	if err != nil {
		t.Fatalf("allocate 2 failed: %v", err)
	}
	_, err = alloc.Allocate("server-3")
	if err != nil {
		t.Fatalf("allocate 3 failed: %v", err)
	}

	_, err = alloc.Allocate("server-4")
	if err == nil {
		t.Fatal("expected error when UID range exhausted, got nil")
	}
}

func TestUIDAllocatorGet(t *testing.T) {
	alloc := NewUIDAllocator(1000, 1010)

	uid, err := alloc.Allocate("server-1")
	if err != nil {
		t.Fatalf("allocate failed: %v", err)
	}

	got, ok := alloc.Get("server-1")
	if !ok {
		t.Fatal("expected to find allocated UID")
	}
	if got != uid {
		t.Errorf("expected UID %d, got %d", uid, got)
	}

	_, ok = alloc.Get("nonexistent")
	if ok {
		t.Error("expected no UID for nonexistent server")
	}
}
