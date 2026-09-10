package server

import (
	"fmt"
	"strings"
)

func ValidateConfig(cfg *ServerConfiguration) error {
	if cfg.ServerID == "" {
		return fmt.Errorf("serverId is required")
	}
	if cfg.Image == "" {
		return fmt.Errorf("image is required")
	}
	if cfg.StartupCommand == "" {
		return fmt.Errorf("startupCommand is required")
	}
	if cfg.VolumePath == "" {
		return fmt.Errorf("volumePath is required")
	}

	if cfg.ResourceLimits.MemoryMB <= 0 {
		return fmt.Errorf("resourceLimits.memoryMb must be > 0")
	}
	if cfg.ResourceLimits.CPULimit <= 0 {
		return fmt.Errorf("resourceLimits.cpuLimit must be > 0")
	}
	if cfg.ResourceLimits.PidsLimit != nil && *cfg.ResourceLimits.PidsLimit < 16 {
		return fmt.Errorf("resourceLimits.pidsLimit must be >= 16")
	}

	for i, pm := range cfg.PortMappings {
		if pm.HostPort < 1 || pm.HostPort > 65535 {
			return fmt.Errorf("portMappings[%d].hostPort must be 1-65535", i)
		}
		if pm.ContainerPort < 1 || pm.ContainerPort > 65535 {
			return fmt.Errorf("portMappings[%d].containerPort must be 1-65535", i)
		}
		if pm.Protocol != "tcp" && pm.Protocol != "udp" {
			return fmt.Errorf("portMappings[%d].protocol must be tcp or udp", i)
		}
	}

	if isUnsafeStartupCommand(cfg.StartupCommand) {
		return fmt.Errorf("startupCommand contains unsafe patterns")
	}

	return nil
}

func isUnsafeStartupCommand(cmd string) bool {
	// Reject shell injection patterns
	dangerous := []string{
		"$(",
		"`",
		";",
		"&&",
		"||",
		">",
		"<",
		"|",
		"\n",
		"\r",
	}
	for _, d := range dangerous {
		if strings.Contains(cmd, d) {
			return true
		}
	}
	return false
}
