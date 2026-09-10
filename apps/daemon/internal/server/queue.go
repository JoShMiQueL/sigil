package server

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/sigil/sigil/apps/daemon/internal/docker"
	"github.com/sigil/sigil/apps/daemon/internal/panel"
)

type QueuedEvent struct {
	Event     docker.StateChangeEvent
	Attempts  int
	NextRetry time.Time
}

type StateChangeQueue struct {
	mu      sync.Mutex
	queue   []QueuedEvent
	client  *panel.Client
	nodeID  string
	stopCh  chan struct{}
	doneCh  chan struct{}
}

func NewStateChangeQueue(client *panel.Client, nodeID string) *StateChangeQueue {
	return &StateChangeQueue{
		client: client,
		nodeID: nodeID,
		stopCh: make(chan struct{}),
		doneCh: make(chan struct{}),
	}
}

func (q *StateChangeQueue) Enqueue(event docker.StateChangeEvent) {
	q.mu.Lock()
	defer q.mu.Unlock()

	qe := QueuedEvent{
		Event:     event,
		Attempts:  0,
		NextRetry: time.Now(),
	}
	q.queue = append(q.queue, qe)
	slog.Info("state change event queued", "serverId", event.ServerID, "state", event.NewState, "queueLen", len(q.queue))
}

func (q *StateChangeQueue) Start(ctx context.Context) {
	go q.run(ctx)
}

func (q *StateChangeQueue) Stop() {
	close(q.stopCh)
	<-q.doneCh
}

func (q *StateChangeQueue) run(ctx context.Context) {
	defer close(q.doneCh)

	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-q.stopCh:
			q.drainQueue()
			return
		case <-ctx.Done():
			q.drainQueue()
			return
		case <-ticker.C:
			q.processQueue(ctx)
		}
	}
}

func (q *StateChangeQueue) processQueue(ctx context.Context) {
	q.mu.Lock()
	if len(q.queue) == 0 {
		q.mu.Unlock()
		return
	}

	now := time.Now()
	var remaining []QueuedEvent
	var toProcess []QueuedEvent

	for _, qe := range q.queue {
		if now.After(qe.NextRetry) {
			toProcess = append(toProcess, qe)
		} else {
			remaining = append(remaining, qe)
		}
	}
	q.queue = remaining
	q.mu.Unlock()

	for _, qe := range toProcess {
		err := q.sendEvent(ctx, qe.Event)
		if err == nil {
			slog.Info("state change event delivered", "serverId", qe.Event.ServerID, "state", qe.Event.NewState)
			continue
		}

		if err == panel.ErrCredentialsRevoked {
			slog.Error("credentials revoked, dropping state change event", "serverId", qe.Event.ServerID)
			continue
		}

		// Retry with backoff
		qe.Attempts++
		if qe.Attempts >= 10 {
			slog.Error("max retries exceeded, dropping state change event", "serverId", qe.Event.ServerID, "attempts", qe.Attempts)
			continue
		}

		backoff := q.backoffDuration(qe.Attempts)
		qe.NextRetry = time.Now().Add(backoff)
		slog.Warn("state change event retry scheduled", "serverId", qe.Event.ServerID, "attempt", qe.Attempts, "backoff", backoff)

		q.mu.Lock()
		q.queue = append(q.queue, qe)
		q.mu.Unlock()
	}
}

func (q *StateChangeQueue) sendEvent(ctx context.Context, event docker.StateChangeEvent) error {
	cfg := panel.DefaultRetryConfig()
	cfg.Max = 3
	return panel.RetryWithBackoff(ctx, cfg, func() error {
		return q.client.SendStateChange(event)
	})
}

func (q *StateChangeQueue) backoffDuration(attempt int) time.Duration {
	switch {
	case attempt <= 1:
		return 2 * time.Second
	case attempt == 2:
		return 4 * time.Second
	case attempt == 3:
		return 8 * time.Second
	case attempt == 4:
		return 16 * time.Second
	default:
		return 30 * time.Second
	}
}

func (q *StateChangeQueue) drainQueue() {
	q.mu.Lock()
	defer q.mu.Unlock()

	for _, qe := range q.queue {
		slog.Warn("state change event dropped on shutdown", "serverId", qe.Event.ServerID, "state", qe.Event.NewState, "attempts", qe.Attempts)
	}
	q.queue = nil
}

func (q *StateChangeQueue) Len() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.queue)
}
