package heartbeat

import (
	"context"
	"log/slog"
	"time"

	"github.com/sigil/sigil/apps/daemon/internal/panel"
)

type Loop struct {
	collector  *Collector
	client     *panel.Client
	interval   time.Duration
	stopCh     chan struct{}
	stoppedCh  chan struct{}
}

func NewLoop(collector *Collector, client *panel.Client, intervalSec int) *Loop {
	return &Loop{
		collector: collector,
		client:    client,
		interval:  time.Duration(intervalSec) * time.Second,
		stopCh:    make(chan struct{}),
		stoppedCh: make(chan struct{}),
	}
}

func (l *Loop) Start(ctx context.Context) {
	go l.run(ctx)
}

func (l *Loop) Stop() {
	close(l.stopCh)
	<-l.stoppedCh
}

func (l *Loop) run(ctx context.Context) {
	defer close(l.stoppedCh)

	ticker := time.NewTicker(l.interval)
	defer ticker.Stop()

	// Send immediately on start
	l.tick(ctx)

	for {
		select {
		case <-l.stopCh:
			slog.Info("heartbeat loop stopping")
			return
		case <-ctx.Done():
			slog.Info("heartbeat loop stopping (context cancelled)")
			return
		case <-ticker.C:
			l.tick(ctx)
		}
	}
}

func (l *Loop) tick(ctx context.Context) {
	stats := l.collector.Collect(ctx)

	payload := panel.HeartbeatPayload{
		Timestamp:       time.Now().Unix(),
		CPUUsage:        stats.CPUUsage,
		MemoryUsage:     stats.MemoryUsage,
		DiskUsage:       stats.DiskUsage,
		ContainerCount:  stats.ContainerCount,
		DockerAvailable: stats.DockerAvailable,
	}

	cfg := panel.DefaultRetryConfig()
	cfg.Max = 3 // fewer retries for heartbeat — it'll try again next tick

	err := panel.RetryWithBackoff(ctx, cfg, func() error {
		return l.client.SendHeartbeat(payload)
	})

	if err != nil {
		if err == panel.ErrCredentialsRevoked {
			slog.Error("credentials revoked by panel, stopping heartbeat loop")
			// Signal the main process to shut down
			select {
			case <-l.stopCh:
			default:
				close(l.stopCh)
			}
			return
		}
		slog.Error("heartbeat delivery failed", "error", err)
		return
	}

	slog.Debug("heartbeat delivered",
		"cpu", stats.CPUUsage,
		"mem", stats.MemoryUsage,
		"disk", stats.DiskUsage,
		"containers", stats.ContainerCount,
		"docker", stats.DockerAvailable,
	)
}
