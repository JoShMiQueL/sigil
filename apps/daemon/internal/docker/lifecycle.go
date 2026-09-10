package docker

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/go-connections/nat"
)

// ContainerConfig is the configuration for creating a container.
// It is populated by the server package from ServerConfiguration.
type ContainerConfig struct {
	ServerID       string
	Image          string
	StartupCommand string
	Environment    map[string]string
	PortMappings   []PortMapping
	MemoryMB       int
	CPULimit       float64
	PidsLimit      *int
	VolumePath     string
	NodeID         string
}

type PortMapping struct {
	HostIP        string
	HostPort      int
	ContainerPort int
	Protocol      string
}

// Label keys for managed containers
const (
	LabelServerID = "sigil.server-id"
	LabelNodeID   = "sigil.node-id"
	LabelManaged  = "sigil.managed"
)

type LifecycleManager struct {
	client    *Client
	nodeID    string
}

func NewLifecycleManager(client *Client, nodeID string) *LifecycleManager {
	return &LifecycleManager{
		client: client,
		nodeID: nodeID,
	}
}

func (m *LifecycleManager) Create(ctx context.Context, cfg *ContainerConfig) (string, error) {
	// Check if image exists, pull if needed
	if err := m.ensureImage(ctx, cfg.Image); err != nil {
		return "", fmt.Errorf("IMAGE_PULL_FAILED: %w", err)
	}

	// Create volume directory
	if err := os.MkdirAll(cfg.VolumePath, 0o755); err != nil {
		return "", fmt.Errorf("create volume dir: %w", err)
	}

	// Build container config
	env := make([]string, 0, len(cfg.Environment))
	for k, v := range cfg.Environment {
		env = append(env, fmt.Sprintf("%s=%s", k, v))
	}

	containerConfig := &container.Config{
		Image: cfg.Image,
		Cmd:   []string{"/bin/sh", "-c", cfg.StartupCommand},
		Env:   env,
		User:  "1000:1000",
		Labels: map[string]string{
			LabelServerID: cfg.ServerID,
			LabelNodeID:   m.nodeID,
			LabelManaged:  "true",
		},
		ExposedPorts: buildExposedPorts(cfg.PortMappings),
	}

	hostConfig := &container.HostConfig{
		Binds:        []string{fmt.Sprintf("%s:/server", cfg.VolumePath)},
		PortBindings: buildPortBindings(cfg.PortMappings),
	}

	// Apply security hardening
	applyHardening(hostConfig, cfg.MemoryMB, cfg.CPULimit, cfg.PidsLimit)

	createResp, err := m.client.Raw().ContainerCreate(ctx, containerConfig, hostConfig, nil, nil, "")
	if err != nil {
		return "", fmt.Errorf("create container: %w", err)
	}

	if err := m.client.Raw().ContainerStart(ctx, createResp.ID, container.StartOptions{}); err != nil {
		_ = m.client.Raw().ContainerRemove(ctx, createResp.ID, container.RemoveOptions{Force: true})
		return "", fmt.Errorf("start container: %w", err)
	}

	slog.Info("container created and started", "serverId", cfg.ServerID, "containerId", createResp.ID)
	return createResp.ID, nil
}

func (m *LifecycleManager) Start(ctx context.Context, containerID string) error {
	info, err := m.client.Raw().ContainerInspect(ctx, containerID)
	if err != nil {
		return fmt.Errorf("inspect container: %w", err)
	}
	if info.State.Running {
		return nil
	}
	return m.client.Raw().ContainerStart(ctx, containerID, container.StartOptions{})
}

func (m *LifecycleManager) Stop(ctx context.Context, containerID string, timeout int) error {
	info, err := m.client.Raw().ContainerInspect(ctx, containerID)
	if err != nil {
		return fmt.Errorf("inspect container: %w", err)
	}
	if !info.State.Running {
		return nil
	}
	return m.client.Raw().ContainerStop(ctx, containerID, container.StopOptions{Timeout: &timeout})
}

func (m *LifecycleManager) Restart(ctx context.Context, containerID string, timeout int) error {
	if err := m.Stop(ctx, containerID, timeout); err != nil {
		return err
	}
	return m.Start(ctx, containerID)
}

func (m *LifecycleManager) Remove(ctx context.Context, containerID string, volumePath string) error {
	_ = m.client.Raw().ContainerStop(ctx, containerID, container.StopOptions{Timeout: ptrInt(10)})
	if err := m.client.Raw().ContainerRemove(ctx, containerID, container.RemoveOptions{
		Force:         true,
		RemoveVolumes: true,
	}); err != nil {
		return fmt.Errorf("remove container: %w", err)
	}
	if volumePath != "" {
		if err := os.RemoveAll(volumePath); err != nil {
			slog.Warn("failed to remove volume directory", "path", volumePath, "error", err)
		}
	}
	slog.Info("container removed", "containerId", containerID)
	return nil
}

func (m *LifecycleManager) ListByLabel(ctx context.Context) ([]container.Summary, error) {
	filter := filters.NewArgs()
	filter.Add("label", LabelManaged+"=true")
	return m.client.Raw().ContainerList(ctx, container.ListOptions{Filters: filter})
}

func (m *LifecycleManager) FindByServerID(ctx context.Context, serverID string) (string, error) {
	filter := filters.NewArgs()
	filter.Add("label", LabelServerID+"="+serverID)
	containers, err := m.client.Raw().ContainerList(ctx, container.ListOptions{
		Filters: filter,
		All:     true,
	})
	if err != nil {
		return "", err
	}
	if len(containers) == 0 {
		return "", fmt.Errorf("SERVER_NOT_FOUND: no container for server %s", serverID)
	}
	return containers[0].ID, nil
}

func (m *LifecycleManager) ensureImage(ctx context.Context, imageRef string) error {
	filter := filters.NewArgs()
	filter.Add("reference", imageRef)
	images, err := m.client.Raw().ImageList(ctx, image.ListOptions{Filters: filter})
	if err != nil {
		return fmt.Errorf("list images: %w", err)
	}
	if len(images) > 0 {
		return nil
	}
	slog.Info("pulling image", "image", imageRef)
	reader, err := m.client.Raw().ImagePull(ctx, imageRef, image.PullOptions{})
	if err != nil {
		return fmt.Errorf("pull image: %w", err)
	}
	defer reader.Close()
	io.Copy(io.Discard, reader)
	return nil
}

func buildExposedPorts(mappings []PortMapping) nat.PortSet {
	ports := nat.PortSet{}
	for _, pm := range mappings {
		port := nat.Port(fmt.Sprintf("%d/%s", pm.ContainerPort, pm.Protocol))
		ports[port] = struct{}{}
	}
	return ports
}

func buildPortBindings(mappings []PortMapping) nat.PortMap {
	bindings := nat.PortMap{}
	for _, pm := range mappings {
		port := nat.Port(fmt.Sprintf("%d/%s", pm.ContainerPort, pm.Protocol))
		binding := nat.PortBinding{HostPort: fmt.Sprintf("%d", pm.HostPort)}
		if pm.HostIP != "" {
			binding.HostIP = pm.HostIP
		}
		bindings[port] = append(bindings[port], binding)
	}
	return bindings
}

func applyHardening(hostConfig *container.HostConfig, memoryMB int, cpuLimit float64, pidsLimit *int) {
	hostConfig.CapDrop = []string{"ALL"}
	hostConfig.SecurityOpt = []string{"no-new-privileges"}
	pids := int64(512)
	if pidsLimit != nil {
		pids = int64(*pidsLimit)
	}
	hostConfig.PidsLimit = &pids
	hostConfig.Memory = int64(memoryMB) * 1024 * 1024
	// Use CpuQuota/CpuPeriod for CPU limit (more widely supported than NanoCPUs)
	if cpuLimit > 0 {
		hostConfig.CPUPeriod = 100000
		hostConfig.CPUQuota = int64(cpuLimit * 100000)
	}
	hostConfig.ReadonlyRootfs = true
	hostConfig.Tmpfs = map[string]string{"/tmp": "rw,noexec,nosuid,size=64m"}
	hostConfig.Privileged = false
}

func ptrInt(i int) *int { return &i }
