package console

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/gorilla/websocket"
	"github.com/sigil/sigil/apps/daemon/internal/docker"
)

// StatsCollector periodically collects per-container resource stats and
// broadcasts them to connected WebSocket clients.
type StatsCollector struct {
	docker   *docker.Client
	serverId string
	mu       sync.Mutex
	clients  map[*websocket.Conn]bool
	cancel   context.CancelFunc
	done     chan struct{}
}

// NewStatsCollector creates a new stats collector for the given server.
func NewStatsCollector(dockerClient *docker.Client, serverId string) *StatsCollector {
	return &StatsCollector{
		docker:   dockerClient,
		serverId: serverId,
		clients:  make(map[*websocket.Conn]bool),
	}
}

// Start begins collecting stats every 5 seconds.
func (sc *StatsCollector) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	sc.cancel = cancel
	sc.done = make(chan struct{})

	go sc.collectLoop(ctx)
}

// Stop terminates the stats collector.
func (sc *StatsCollector) Stop() {
	if sc.cancel != nil {
		sc.cancel()
	}
	if sc.done != nil {
		<-sc.done
	}
}

// AddClient registers a WebSocket client to receive stats.
func (sc *StatsCollector) AddClient(conn *websocket.Conn) {
	sc.mu.Lock()
	sc.clients[conn] = true
	sc.mu.Unlock()
}

// RemoveClient unregisters a WebSocket client.
func (sc *StatsCollector) RemoveClient(conn *websocket.Conn) {
	sc.mu.Lock()
	delete(sc.clients, conn)
	sc.mu.Unlock()
}

func (sc *StatsCollector) collectLoop(ctx context.Context) {
	defer close(sc.done)

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			stats, err := sc.collectStats(ctx)
			if err != nil {
				slog.Debug("failed to collect stats", "serverId", sc.serverId, "error", err)
				continue
			}
			sc.broadcastStats(stats)
		}
	}
}

func (sc *StatsCollector) collectStats(ctx context.Context) (map[string]interface{}, error) {
	containerId, err := sc.findContainer()
	if err != nil {
		return nil, err
	}

	resp, err := sc.docker.Raw().ContainerStats(ctx, containerId, false)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var stats container.StatsResponse
	if err := json.NewDecoder(resp.Body).Decode(&stats); err != nil {
		return nil, err
	}

	// Calculate CPU percentage
	cpuPct := 0.0
	if stats.CPUStats.CPUUsage.TotalUsage > 0 && stats.CPUStats.SystemUsage > 0 {
		cpuDelta := float64(stats.CPUStats.CPUUsage.TotalUsage - stats.PreCPUStats.CPUUsage.TotalUsage)
		systemDelta := float64(stats.CPUStats.SystemUsage - stats.PreCPUStats.SystemUsage)
		onlineCPUs := float64(stats.CPUStats.OnlineCPUs)
		if onlineCPUs == 0 {
			onlineCPUs = 1
		}
		if systemDelta > 0 {
			cpuPct = (cpuDelta / systemDelta) * onlineCPUs * 100
		}
	}

	// Memory usage
	memoryMb := 0.0
	memoryLimitMb := 0.0
	if stats.MemoryStats.Usage > 0 {
		memoryMb = float64(stats.MemoryStats.Usage) / (1024 * 1024)
	}
	if stats.MemoryStats.Limit > 0 {
		memoryLimitMb = float64(stats.MemoryStats.Limit) / (1024 * 1024)
	}

	// Disk usage is not available from Docker stats API directly.
	// It would require a separate filesystem call. For R10, we report 0
	// and defer real disk stats to a future feature.
	diskMb := 0.0
	diskLimitMb := 0.0

	return map[string]interface{}{
		"type":          "stats",
		"cpuPct":        cpuPct,
		"memoryMb":      memoryMb,
		"memoryLimitMb": memoryLimitMb,
		"diskMb":        diskMb,
		"diskLimitMb":   diskLimitMb,
		"timestamp":     time.Now().UnixMilli(),
	}, nil
}

func (sc *StatsCollector) findContainer() (string, error) {
	containers, err := sc.docker.Raw().ContainerList(context.Background(), container.ListOptions{
		All:     true,
		Filters: filterByServerId(sc.serverId),
	})
	if err != nil {
		return "", err
	}
	if len(containers) == 0 {
		return "", errContainerNotFound
	}
	return containers[0].ID, nil
}

var errContainerNotFound = fmt.Errorf("container not found")

func (sc *StatsCollector) broadcastStats(stats map[string]interface{}) {
	sc.mu.Lock()
	defer sc.mu.Unlock()
	for conn := range sc.clients {
		if err := conn.WriteJSON(stats); err != nil {
			delete(sc.clients, conn)
		}
	}
}
