package server

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/sigil/sigil/apps/daemon/internal/docker"
	"github.com/sigil/sigil/apps/daemon/internal/panel"
)

// mockPanelClient is a mock panel.Client for testing the queue.
// We can't easily mock the real panel.Client, so we test the queue logic directly.
type mockPanelClient struct {
	mu         sync.Mutex
	calls      int32
	shouldFail bool
	failStatus  int
}

func (m *mockPanelClient) SendStateChangeCallCount() int32 {
	return atomic.LoadInt32(&m.calls)
}

func TestQueueEnqueueAndProcess(t *testing.T) {
	queue := &StateChangeQueue{
		queue:  make([]QueuedEvent, 0),
		stopCh: make(chan struct{}),
		doneCh: make(chan struct{}),
	}

	event := docker.StateChangeEvent{
		ServerID:      "test-server-1",
		ContainerID:  "cid-1",
		PreviousState: "running",
		NewState:      "stopped",
	}

	queue.Enqueue(event)

	if queue.Len() != 1 {
		t.Errorf("expected queue length 1, got %d", queue.Len())
	}
}

func TestQueueMultipleEnqueue(t *testing.T) {
	queue := &StateChangeQueue{
		queue:  make([]QueuedEvent, 0),
		stopCh: make(chan struct{}),
		doneCh: make(chan struct{}),
	}

	for i := 0; i < 5; i++ {
		queue.Enqueue(docker.StateChangeEvent{
			ServerID:      "test-server",
			NewState:      "stopped",
		})
	}

	if queue.Len() != 5 {
		t.Errorf("expected queue length 5, got %d", queue.Len())
	}
}

func TestQueueDrainOnShutdown(t *testing.T) {
	queue := &StateChangeQueue{
		queue:  make([]QueuedEvent, 0),
		stopCh: make(chan struct{}),
		doneCh: make(chan struct{}),
	}

	queue.Enqueue(docker.StateChangeEvent{
		ServerID: "test-server",
		NewState: "stopped",
	})

	// Drain should clear the queue
	queue.drainQueue()

	if queue.Len() != 0 {
		t.Errorf("expected queue length 0 after drain, got %d", queue.Len())
	}
}

func TestQueueBackoffDuration(t *testing.T) {
	queue := &StateChangeQueue{}

	tests := []struct {
		attempt int
		min     time.Duration
		max     time.Duration
	}{
		{1, 2 * time.Second, 2 * time.Second},
		{2, 4 * time.Second, 4 * time.Second},
		{3, 8 * time.Second, 8 * time.Second},
		{4, 16 * time.Second, 16 * time.Second},
		{5, 30 * time.Second, 30 * time.Second},
		{10, 30 * time.Second, 30 * time.Second},
	}

	for _, tt := range tests {
		got := queue.backoffDuration(tt.attempt)
		if got < tt.min || got > tt.max {
			t.Errorf("attempt %d: expected %v-%v, got %v", tt.attempt, tt.min, tt.max, got)
		}
	}
}

func TestQueueStartStop(t *testing.T) {
	queue := &StateChangeQueue{
		queue:  make([]QueuedEvent, 0),
		stopCh: make(chan struct{}),
		doneCh: make(chan struct{}),
		nodeID: "test-node",
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	queue.Start(ctx)

	// Stop should not block
	stopDone := make(chan struct{})
	go func() {
		queue.Stop()
		close(stopDone)
	}()

	select {
	case <-stopDone:
		// OK
	case <-time.After(5 * time.Second):
		t.Fatal("queue.Stop() blocked for too long")
	}
}

// Test that the queue type compiles and has the right interface
func TestQueueCompiles(t *testing.T) {
	var _ *StateChangeQueue = NewStateChangeQueue(nil, "test-node")
}

// Test that events are properly structured
func TestQueuedEventStructure(t *testing.T) {
	event := docker.StateChangeEvent{
		ServerID:      "server-1",
		ContainerID:  "cid-1",
		PreviousState: "running",
		NewState:      "crashed",
		Reason:        "oom",
		ExitCode:      intPtr(137),
	}

	qe := QueuedEvent{
		Event:     event,
		Attempts:  0,
		NextRetry: time.Now(),
	}

	if qe.Event.ServerID != "server-1" {
		t.Error("expected serverId server-1")
	}
	if qe.Event.NewState != "crashed" {
		t.Error("expected newState crashed")
	}
	if qe.Event.Reason != "oom" {
		t.Error("expected reason oom")
	}
	if *qe.Event.ExitCode != 137 {
		t.Error("expected exit code 137")
	}
}

func intPtr(i int) *int {
	return &i
}

// Ensure panel package is referenced (for compile)
var _ = panel.ErrCredentialsRevoked
