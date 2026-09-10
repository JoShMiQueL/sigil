package heartbeat

import (
	"context"
	"log/slog"
	"os"
	"runtime"
	"strconv"
	"strings"
	"syscall"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/sigilpanel/sigilpanel/apps/daemon/internal/docker"
)

type ResourceStats struct {
	CPUUsage        float64
	MemoryUsage     float64
	DiskUsage       float64
	ContainerCount  int
	DockerAvailable bool
}

type Collector struct {
	dockerClient *docker.Client
	volumePath   string
}

func NewCollector(dockerClient *docker.Client, volumePath string) *Collector {
	return &Collector{
		dockerClient: dockerClient,
		volumePath:   volumePath,
	}
}

func (c *Collector) Collect(ctx context.Context) ResourceStats {
	stats := ResourceStats{
		CPUUsage:        collectCPUUsage(),
		MemoryUsage:     collectMemoryUsage(),
		DiskUsage:       collectDiskUsage(c.volumePath),
		DockerAvailable: true,
	}

	if c.dockerClient != nil {
		count, err := c.countContainers(ctx)
		if err != nil {
			slog.Warn("docker unavailable during collection", "error", err)
			stats.DockerAvailable = false
			stats.ContainerCount = 0
		} else {
			stats.ContainerCount = count
		}
	} else {
		stats.DockerAvailable = false
	}

	return stats
}

func (c *Collector) countContainers(ctx context.Context) (int, error) {
	filter := filters.NewArgs()
	filter.Add("label", "sigilpanel.managed=true")

	containers, err := c.dockerClient.Raw().ContainerList(ctx, container.ListOptions{
		Filters: filter,
	})
	if err != nil {
		return 0, err
	}
	return len(containers), nil
}

func collectCPUUsage() float64 {
	data, err := os.ReadFile("/proc/loadavg")
	if err != nil {
		return 0
	}

	fields := strings.Fields(string(data))
	if len(fields) < 1 {
		return 0
	}

	load1, err := strconv.ParseFloat(fields[0], 64)
	if err != nil {
		return 0
	}

	numCPU := runtime.NumCPU()
	if numCPU <= 0 {
		numCPU = 1
	}

	usage := (load1 / float64(numCPU)) * 100
	if usage > 100 {
		usage = 100
	}
	if usage < 0 {
		usage = 0
	}
	return usage
}

func collectMemoryUsage() float64 {
	data, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0
	}

	var memTotal, memAvailable int64
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "MemTotal:") {
			memTotal = parseMemInfoKB(line)
		} else if strings.HasPrefix(line, "MemAvailable:") {
			memAvailable = parseMemInfoKB(line)
		}
	}

	if memTotal <= 0 {
		return 0
	}

	used := memTotal - memAvailable
	usage := float64(used) / float64(memTotal) * 100
	if usage > 100 {
		usage = 100
	}
	if usage < 0 {
		usage = 0
	}
	return usage
}

func parseMemInfoKB(line string) int64 {
	fields := strings.Fields(line)
	if len(fields) < 2 {
		return 0
	}
	val, err := strconv.ParseInt(fields[1], 10, 64)
	if err != nil {
		return 0
	}
	return val
}

func collectDiskUsage(path string) float64 {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0
	}

	total := stat.Blocks * uint64(stat.Bsize)
	avail := stat.Bavail * uint64(stat.Bsize)
	if total <= 0 {
		return 0
	}

	used := total - avail
	usage := float64(used) / float64(total) * 100
	if usage > 100 {
		usage = 100
	}
	if usage < 0 {
		usage = 0
	}
	return usage
}
