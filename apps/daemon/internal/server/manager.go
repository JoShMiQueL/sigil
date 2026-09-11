package server

import (
	"context"
	"fmt"
	"log/slog"
	"sync"

	"github.com/sigil/sigil/apps/daemon/internal/docker"
	"github.com/sigil/sigil/apps/daemon/internal/jail"
)

type ServerEntry struct {
	ID           string
	ContainerID  string
	State        ContainerState
	Config       ServerConfiguration
	LastExitCode *int
	Jail         *jail.Jail
	lock         *sync.Mutex
}

type Manager struct {
	mu         sync.Mutex
	servers    map[string]*ServerEntry
	docker     *docker.Client
	lifecycle  *docker.LifecycleManager
	nodeID     string
	volumeBase string
	diskFullPct int
	eventCh    chan docker.StateChangeEvent
}

func NewManager(dockerClient *docker.Client, nodeID, volumeBase string, diskFullPct int) *Manager {
	return &Manager{
		servers:    make(map[string]*ServerEntry),
		docker:     dockerClient,
		lifecycle:  docker.NewLifecycleManager(dockerClient, nodeID),
		nodeID:     nodeID,
		volumeBase:  volumeBase,
		diskFullPct: diskFullPct,
		eventCh:    make(chan docker.StateChangeEvent, 100),
	}
}

// Events returns the channel for state change events from lifecycle operations.
func (m *Manager) Events() <-chan docker.StateChangeEvent {
	return m.eventCh
}

// emitEvent sends a state change event to the event channel (non-blocking).
func (m *Manager) emitEvent(event docker.StateChangeEvent) {
	select {
	case m.eventCh <- event:
	default:
		slog.Warn("state change event channel full, dropping event", "serverId", event.ServerID)
	}
}

func (m *Manager) Create(ctx context.Context, cfg *ServerConfiguration) (*LifecycleResponse, error) {
	if err := ValidateConfig(cfg); err != nil {
		return nil, fmt.Errorf("INVALID_CONFIG: %w", err)
	}

	if m.isDiskFull() {
		return nil, fmt.Errorf("DISK_FULL: disk usage exceeds threshold")
	}

	entry := m.getOrCreate(cfg.ServerID)
	entry.lock.Lock()
	defer entry.lock.Unlock()

	// Convert to docker.ContainerConfig
	dockerCfg := &docker.ContainerConfig{
		ServerID:       cfg.ServerID,
		Image:          cfg.Image,
		StartupCommand: cfg.StartupCommand,
		Environment:    cfg.Environment,
		VolumePath:     cfg.VolumePath,
		MemoryMB:       cfg.ResourceLimits.MemoryMB,
		CPULimit:       cfg.ResourceLimits.CPULimit,
		PidsLimit:      cfg.ResourceLimits.PidsLimit,
	}
	for _, pm := range cfg.PortMappings {
		dockerCfg.PortMappings = append(dockerCfg.PortMappings, docker.PortMapping{
			HostIP:        pm.HostIP,
			HostPort:      pm.HostPort,
			ContainerPort: pm.ContainerPort,
			Protocol:      pm.Protocol,
		})
	}

	containerID, err := m.lifecycle.Create(ctx, dockerCfg)
	if err != nil {
		return nil, err
	}

	m.mu.Lock()
	entry.ContainerID = containerID
	entry.State = StateRunning
	entry.Config = *cfg
	// Create jail for this server's volume
	serverJail, err := jail.New(cfg.VolumePath)
	if err != nil {
		slog.Warn("failed to create jail for server", "serverId", cfg.ServerID, "error", err)
	} else {
		entry.Jail = serverJail
	}
	m.mu.Unlock()

	return &LifecycleResponse{
		ServerID: cfg.ServerID,
		State:    StateRunning,
		Message:  "Container created and started",
	}, nil
}

func (m *Manager) Start(ctx context.Context, serverID string) (*LifecycleResponse, error) {
	entry, err := m.getEntry(serverID)
	if err != nil {
		return nil, err
	}
	entry.lock.Lock()
	defer entry.lock.Unlock()

	if err := m.lifecycle.Start(ctx, entry.ContainerID); err != nil {
		return nil, err
	}
	prevState := entry.State
	m.mu.Lock()
	entry.State = StateRunning
	m.mu.Unlock()
	m.emitEvent(docker.StateChangeEvent{
		ServerID:      serverID,
		ContainerID:  entry.ContainerID,
		PreviousState: string(prevState),
		NewState:      string(StateRunning),
	})
	return &LifecycleResponse{ServerID: serverID, State: StateRunning}, nil
}

func (m *Manager) Stop(ctx context.Context, serverID string, timeout int) (*LifecycleResponse, error) {
	entry, err := m.getEntry(serverID)
	if err != nil {
		return nil, err
	}
	entry.lock.Lock()
	defer entry.lock.Unlock()

	if err := m.lifecycle.Stop(ctx, entry.ContainerID, timeout); err != nil {
		return nil, err
	}
	prevState := entry.State
	m.mu.Lock()
	entry.State = StateStopped
	m.mu.Unlock()
	m.emitEvent(docker.StateChangeEvent{
		ServerID:      serverID,
		ContainerID:  entry.ContainerID,
		PreviousState: string(prevState),
		NewState:      string(StateStopped),
	})
	return &LifecycleResponse{ServerID: serverID, State: StateStopped}, nil
}

func (m *Manager) Restart(ctx context.Context, serverID string, timeout int) (*LifecycleResponse, error) {
	entry, err := m.getEntry(serverID)
	if err != nil {
		return nil, err
	}
	entry.lock.Lock()
	defer entry.lock.Unlock()

	if err := m.lifecycle.Restart(ctx, entry.ContainerID, timeout); err != nil {
		return nil, err
	}
	prevState := entry.State
	m.mu.Lock()
	entry.State = StateRunning
	m.mu.Unlock()
	m.emitEvent(docker.StateChangeEvent{
		ServerID:      serverID,
		ContainerID:  entry.ContainerID,
		PreviousState: string(prevState),
		NewState:      string(StateRunning),
	})
	return &LifecycleResponse{ServerID: serverID, State: StateRunning}, nil
}

func (m *Manager) Remove(ctx context.Context, serverID string) error {
	entry, err := m.getEntry(serverID)
	if err != nil {
		return err
	}
	entry.lock.Lock()
	defer entry.lock.Unlock()

	volumePath := ""
	m.mu.Lock()
	volumePath = entry.Config.VolumePath
	m.mu.Unlock()

	if err := m.lifecycle.Remove(ctx, entry.ContainerID, volumePath); err != nil {
		return err
	}

	m.mu.Lock()
	delete(m.servers, serverID)
	m.mu.Unlock()
	m.emitEvent(docker.StateChangeEvent{
		ServerID:      serverID,
		ContainerID:  entry.ContainerID,
		PreviousState: string(StateStopped),
		NewState:      string(StateMissing),
	})
	return nil
}

func (m *Manager) GetStatus(ctx context.Context, serverID string) (*ServerStatus, error) {
	entry, err := m.getEntry(serverID)
	if err != nil {
		return nil, err
	}

	m.mu.Lock()
	state := entry.State
	containerID := entry.ContainerID
	m.mu.Unlock()

	cid := containerID
	return &ServerStatus{
		ServerID:    serverID,
		State:       state,
		ContainerID: &cid,
	}, nil
}

func (m *Manager) ListStatus() []*ServerStatus {
	m.mu.Lock()
	defer m.mu.Unlock()

	result := make([]*ServerStatus, 0, len(m.servers))
	for _, entry := range m.servers {
		cid := entry.ContainerID
		result = append(result, &ServerStatus{
			ServerID:    entry.ID,
			State:       entry.State,
			ContainerID: &cid,
		})
	}
	return result
}

func (m *Manager) Reconcile(ctx context.Context) error {
	containers, err := m.lifecycle.ListByLabel(ctx)
	if err != nil {
		return fmt.Errorf("list containers: %w", err)
	}

	for _, c := range containers {
		serverID := c.Labels[docker.LabelServerID]
		if serverID == "" {
			continue
		}

		state := StateStopped
		if c.State == "running" {
			state = StateRunning
		}

		m.mu.Lock()
		if _, exists := m.servers[serverID]; !exists {
			m.servers[serverID] = &ServerEntry{
				ID:          serverID,
				ContainerID: c.ID,
				State:       state,
				lock:        &sync.Mutex{},
			}
		} else {
			m.servers[serverID].ContainerID = c.ID
			m.servers[serverID].State = state
		}
		m.mu.Unlock()

		// Emit reconciliation event: previous "missing" → actual state
		m.emitEvent(docker.StateChangeEvent{
			ServerID:      serverID,
			ContainerID:  c.ID,
			PreviousState: string(StateMissing),
			NewState:      string(state),
		})

		slog.Info("reconciled server", "serverId", serverID, "state", state)
	}
	return nil
}

// ReportStateChanges consumes the manager's event channel and forwards events to the queue.
func (m *Manager) ReportStateChanges(ctx context.Context, queue *StateChangeQueue) {
	for {
		select {
		case <-ctx.Done():
			return
		case event, ok := <-m.eventCh:
			if !ok {
				return
			}
			queue.Enqueue(event)
		}
	}
}

// UpdateStateFromMonitor updates the manager's internal state based on a monitor event.
func (m *Manager) UpdateStateFromMonitor(event docker.StateChangeEvent) {
	m.mu.Lock()
	defer m.mu.Unlock()

	entry, exists := m.servers[event.ServerID]
	if !exists {
		// Server not in map — create entry if container still exists
		if event.NewState == "missing" {
			return
		}
		entry = &ServerEntry{
			ID:          event.ServerID,
			ContainerID: event.ContainerID,
			State:       ContainerState(event.NewState),
			lock:        &sync.Mutex{},
		}
		m.servers[event.ServerID] = entry
		return
	}

	// Don't overwrite a deliberate "stopped" state with "crashed" from the monitor
	// (the monitor sees the die event with non-zero exit code, but the stop was intentional)
	if entry.State == StateStopped && event.NewState == "crashed" {
		return
	}

	// Ignore stale events from old containers (e.g. after restart creates a new container ID).
	// The old container's "destroy"/"missing" event should not affect the new container's state.
	if event.ContainerID != "" && entry.ContainerID != "" && event.ContainerID != entry.ContainerID {
		return
	}

	entry.State = ContainerState(event.NewState)
	if event.NewState == "missing" {
		delete(m.servers, event.ServerID)
	}
}

// ShouldReportState returns true if a monitor event should be reported to the panel.
// It returns false when the manager kept "stopped" state despite the monitor reporting "crashed"
// (which happens when a deliberate stop produces a non-zero exit code).
func (m *Manager) ShouldReportState(event docker.StateChangeEvent) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	entry, exists := m.servers[event.ServerID]
	if !exists {
		return event.NewState != "missing"
	}

	// If manager kept "stopped" but monitor said "crashed", don't report the crash
	if entry.State == StateStopped && event.NewState == "crashed" {
		return false
	}

	// Ignore stale events from old containers (e.g. after restart creates a new container ID)
	if event.ContainerID != "" && entry.ContainerID != "" && event.ContainerID != entry.ContainerID {
		return false
	}

	return true
}

func (m *Manager) getOrCreate(serverID string) *ServerEntry {
	m.mu.Lock()
	defer m.mu.Unlock()
	if entry, exists := m.servers[serverID]; exists {
		return entry
	}
	entry := &ServerEntry{ID: serverID, lock: &sync.Mutex{}}
	m.servers[serverID] = entry
	return entry
}

func (m *Manager) getEntry(serverID string) (*ServerEntry, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	entry, exists := m.servers[serverID]
	if !exists {
		return nil, fmt.Errorf("SERVER_NOT_FOUND: %s", serverID)
	}
	return entry, nil
}

func (m *Manager) isDiskFull() bool {
	usage := getDiskUsage(m.volumeBase)
	return usage >= float64(m.diskFullPct)
}

// File operations through the jail

func (m *Manager) ReadFile(serverID, relPath string) ([]byte, error) {
	entry, err := m.getEntry(serverID)
	if err != nil {
		return nil, err
	}
	m.mu.Lock()
	j := entry.Jail
	m.mu.Unlock()
	if j == nil {
		return nil, fmt.Errorf("jail not initialized for server %s", serverID)
	}
	return j.SafeRead(relPath)
}

func (m *Manager) WriteFile(serverID, relPath string, data []byte) error {
	entry, err := m.getEntry(serverID)
	if err != nil {
		return err
	}
	m.mu.Lock()
	j := entry.Jail
	m.mu.Unlock()
	if j == nil {
		return fmt.Errorf("jail not initialized for server %s", serverID)
	}
	return j.SafeWrite(relPath, data)
}

func (m *Manager) ListFiles(serverID, relPath string) ([]string, error) {
	entry, err := m.getEntry(serverID)
	if err != nil {
		return nil, err
	}
	m.mu.Lock()
	j := entry.Jail
	m.mu.Unlock()
	if j == nil {
		return nil, fmt.Errorf("jail not initialized for server %s", serverID)
	}
	return j.SafeList(relPath)
}

// FileEntry represents a file or directory with metadata.
type FileEntry struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Size    int64  `json:"size"`
	IsDir   bool   `json:"isDir"`
	ModTime string `json:"modTime"`
}

// ListFileEntries lists a directory within the jail, returning structured entries with metadata.
func (m *Manager) ListFileEntries(serverID, relPath string) ([]FileEntry, error) {
	entry, err := m.getEntry(serverID)
	if err != nil {
		return nil, err
	}
	m.mu.Lock()
	j := entry.Jail
	m.mu.Unlock()
	if j == nil {
		return nil, fmt.Errorf("jail not initialized for server %s", serverID)
	}

	names, err := j.SafeList(relPath)
	if err != nil {
		return nil, err
	}

	result := make([]FileEntry, 0, len(names))
	for _, name := range names {
		childPath := relPath
		if relPath == "" || relPath == "." {
			childPath = name
		} else {
			childPath = relPath + "/" + name
		}
		info, err := j.SafeStat(childPath)
		if err != nil {
			continue // skip entries we can't stat
		}
		result = append(result, FileEntry{
			Name:    name,
			Path:    childPath,
			Size:    info.Size(),
			IsDir:   info.IsDir(),
			ModTime: info.ModTime().UTC().Format("2006-01-02T15:04:05Z"),
		})
	}
	return result, nil
}

func (m *Manager) DeleteFile(serverID, relPath string) error {
	entry, err := m.getEntry(serverID)
	if err != nil {
		return err
	}
	m.mu.Lock()
	j := entry.Jail
	m.mu.Unlock()
	if j == nil {
		return fmt.Errorf("jail not initialized for server %s", serverID)
	}
	return j.SafeDelete(relPath)
}

func (m *Manager) Mkdir(serverID, relPath string) error {
	entry, err := m.getEntry(serverID)
	if err != nil {
		return err
	}
	m.mu.Lock()
	j := entry.Jail
	m.mu.Unlock()
	if j == nil {
		return fmt.Errorf("jail not initialized for server %s", serverID)
	}
	return j.SafeMkdirAll(relPath, 0o755)
}

func (m *Manager) Stat(serverID, relPath string) (FileEntry, error) {
	entry, err := m.getEntry(serverID)
	if err != nil {
		return FileEntry{}, err
	}
	m.mu.Lock()
	j := entry.Jail
	m.mu.Unlock()
	if j == nil {
		return FileEntry{}, fmt.Errorf("jail not initialized for server %s", serverID)
	}
	info, err := j.SafeStat(relPath)
	if err != nil {
		return FileEntry{}, err
	}
	name := relPath
	if idx := len(relPath) - 1; idx >= 0 && relPath[idx] == '/' {
		name = relPath[:idx]
	}
	if idx := lastIndexByte(relPath, '/'); idx >= 0 {
		name = relPath[idx+1:]
	}
	return FileEntry{
		Name:    name,
		Path:    relPath,
		Size:    info.Size(),
		IsDir:   info.IsDir(),
		ModTime: info.ModTime().UTC().Format("2006-01-02T15:04:05Z"),
	}, nil
}

func (m *Manager) Rename(serverID, fromRel, toRel string) error {
	entry, err := m.getEntry(serverID)
	if err != nil {
		return err
	}
	m.mu.Lock()
	j := entry.Jail
	m.mu.Unlock()
	if j == nil {
		return fmt.Errorf("jail not initialized for server %s", serverID)
	}
	return j.SafeRename(fromRel, toRel)
}

func lastIndexByte(s string, b byte) int {
	for i := len(s) - 1; i >= 0; i-- {
		if s[i] == b {
			return i
		}
	}
	return -1
}

func (m *Manager) ExtractZip(serverID string, data []byte, destPath string) error {
	entry, err := m.getEntry(serverID)
	if err != nil {
		return err
	}
	m.mu.Lock()
	j := entry.Jail
	m.mu.Unlock()
	if j == nil {
		return fmt.Errorf("jail not initialized for server %s", serverID)
	}
	return j.ExtractZip(data, destPath)
}

func (m *Manager) ExtractTar(serverID string, data []byte, destPath string) error {
	entry, err := m.getEntry(serverID)
	if err != nil {
		return err
	}
	m.mu.Lock()
	j := entry.Jail
	m.mu.Unlock()
	if j == nil {
		return fmt.Errorf("jail not initialized for server %s", serverID)
	}
	return j.ExtractTar(data, destPath)
}
