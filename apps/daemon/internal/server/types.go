package server

type ContainerState string

const (
	StateCreating ContainerState = "creating"
	StateRunning  ContainerState = "running"
	StateStopped  ContainerState = "stopped"
	StateCrashed  ContainerState = "crashed"
	StateRemoving ContainerState = "removing"
	StateMissing  ContainerState = "missing"
)

type PortMapping struct {
	HostIP        string `json:"hostIp,omitempty"`
	HostPort      int    `json:"hostPort"`
	ContainerPort int    `json:"containerPort"`
	Protocol      string `json:"protocol"` // "tcp" or "udp"
}

type ResourceLimits struct {
	MemoryMB  int     `json:"memoryMb"`
	CPULimit  float64 `json:"cpuLimit"`
	PidsLimit *int    `json:"pidsLimit,omitempty"`
}

type ServerConfiguration struct {
	ServerID       string            `json:"serverId"`
	Image          string            `json:"image"`
	StartupCommand string            `json:"startupCommand"`
	Environment    map[string]string `json:"environment"`
	PortMappings    []PortMapping     `json:"portMappings"`
	ResourceLimits ResourceLimits     `json:"resourceLimits"`
	VolumePath     string            `json:"volumePath"`
}

type LifecycleResponse struct {
	ServerID string         `json:"serverId"`
	State    ContainerState `json:"state"`
	Message  string         `json:"message,omitempty"`
}

type ServerStatus struct {
	ServerID    string         `json:"serverId"`
	State       ContainerState `json:"state"`
	ContainerID *string        `json:"containerId"`
	ExitCode    *int           `json:"exitCode,omitempty"`
	Uptime      *int64         `json:"uptime,omitempty"`
}
