package server

import (
	"sync"
	"testing"
)

func TestNewManager(t *testing.T) {
	m := NewManager(nil, "node-1", "/tmp/volumes", 95)
	if m == nil {
		t.Fatal("expected non-nil manager")
	}
	if m.nodeID != "node-1" {
		t.Errorf("expected nodeID node-1, got %s", m.nodeID)
	}
}

func TestGetEntryMissing(t *testing.T) {
	m := NewManager(nil, "node-1", "/tmp/volumes", 95)
	_, err := m.getEntry("nonexistent")
	if err == nil {
		t.Fatal("expected error for missing server")
	}
}

func TestGetOrCreate(t *testing.T) {
	m := NewManager(nil, "node-1", "/tmp/volumes", 95)
	entry1 := m.getOrCreate("server-1")
	entry2 := m.getOrCreate("server-1")
	if entry1 != entry2 {
		t.Fatal("expected same entry for same server ID")
	}
}

func TestListStatusEmpty(t *testing.T) {
	m := NewManager(nil, "node-1", "/tmp/volumes", 95)
	status := m.ListStatus()
	if len(status) != 0 {
		t.Errorf("expected empty list, got %d items", len(status))
	}
}

func TestListStatusWithServers(t *testing.T) {
	m := NewManager(nil, "node-1", "/tmp/volumes", 95)
	m.mu.Lock()
	m.servers["s1"] = &ServerEntry{
		ID:          "s1",
		ContainerID: "cid-1",
		State:       StateRunning,
		lock:        &sync.Mutex{},
	}
	m.servers["s2"] = &ServerEntry{
		ID:          "s2",
		ContainerID: "cid-2",
		State:       StateStopped,
		lock:        &sync.Mutex{},
	}
	m.mu.Unlock()

	status := m.ListStatus()
	if len(status) != 2 {
		t.Fatalf("expected 2 servers, got %d", len(status))
	}
}

func TestGetStatusMissing(t *testing.T) {
	m := NewManager(nil, "node-1", "/tmp/volumes", 95)
	_, err := m.GetStatus(nil, "nonexistent")
	if err == nil {
		t.Fatal("expected error for missing server")
	}
}

func TestRemoveMissing(t *testing.T) {
	m := NewManager(nil, "node-1", "/tmp/volumes", 95)
	err := m.Remove(nil, "nonexistent")
	if err == nil {
		t.Fatal("expected error for removing missing server")
	}
}

func TestIsDiskFull(t *testing.T) {
	// With threshold 0, any disk usage triggers full
	m := NewManager(nil, "node-1", "/tmp", 0)
	if !m.isDiskFull() {
		t.Error("expected disk full with threshold 0")
	}

	// With threshold 100, disk should not be full (unless actually 100%)
	m2 := NewManager(nil, "node-1", "/tmp", 100)
	if m2.isDiskFull() {
		t.Error("expected disk not full with threshold 100")
	}
}

func TestPerServerLocking(t *testing.T) {
	m := NewManager(nil, "node-1", "/tmp/volumes", 95)
	entry := m.getOrCreate("s1")

	// Lock the entry
	entry.lock.Lock()

	// Try to get the same entry — should return the same pointer
	entry2 := m.getOrCreate("s1")
	if entry != entry2 {
		t.Fatal("expected same entry pointer")
	}

	// Unlock
	entry.lock.Unlock()
}
