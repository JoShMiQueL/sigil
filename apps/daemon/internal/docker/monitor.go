package docker

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/docker/docker/api/types/events"
	"github.com/docker/docker/api/types/filters"
)

// StateChangeEvent represents a container state change detected by the monitor.
type StateChangeEvent struct {
	ServerID      string `json:"serverId"`
	NodeID        string `json:"nodeId,omitempty"`
	ContainerID  string `json:"containerId"`
	PreviousState string `json:"previousState"`
	NewState      string `json:"newState"`
	Reason        string `json:"reason,omitempty"`
	ExitCode      *int   `json:"exitCode,omitempty"`
	Timestamp     int64  `json:"timestamp,omitempty"`
}

// Monitor subscribes to Docker events and emits state changes for managed containers.
type Monitor struct {
	client  *Client
	nodeID  string
	events  chan StateChangeEvent
	errCh   chan error
}

func NewMonitor(client *Client, nodeID string) *Monitor {
	return &Monitor{
		client: client,
		nodeID: nodeID,
		events: make(chan StateChangeEvent, 100),
		errCh:  make(chan error, 1),
	}
}

// Events returns the channel for receiving state change events.
func (m *Monitor) Events() <-chan StateChangeEvent {
	return m.events
}

// Errors returns the channel for receiving monitor errors.
func (m *Monitor) Errors() <-chan error {
	return m.errCh
}

// Start begins listening to Docker events. It blocks until the context is cancelled.
func (m *Monitor) Start(ctx context.Context) {
	defer close(m.events)

	slog.Info("starting docker event monitor")

	// Subscribe to container events with label filter
	filter := buildEventFilter()
	eventCh, errCh := m.client.Raw().Events(ctx, events.ListOptions{
		Filters: filter,
	})

	for {
		select {
		case <-ctx.Done():
			slog.Info("docker event monitor stopping")
			return

		case err := <-errCh:
			if err != nil {
				slog.Error("docker event monitor error", "error", err)
				select {
				case m.errCh <- err:
				default:
				}
			}

		case event := <-eventCh:
			if event.Type != "container" {
				continue
			}

			serverID, ok := event.Actor.Attributes[LabelServerID]
			if !ok || serverID == "" {
				continue
			}

			stateChange := m.mapEvent(event, serverID)
			if stateChange.NewState == "" {
				continue
			}

			select {
			case m.events <- stateChange:
			case <-ctx.Done():
				return
			}
		}
	}
}

func (m *Monitor) mapEvent(event events.Message, serverID string) StateChangeEvent {
	sc := StateChangeEvent{
		ServerID:     serverID,
		ContainerID:  event.Actor.ID,
	}

	switch event.Action {
	case "start":
		sc.PreviousState = "creating"
		sc.NewState = "running"

	case "die":
		exitCode := extractExitCode(event.Actor.Attributes)
		sc.ExitCode = exitCode
		slog.Debug("die event received", "serverId", serverID, "exitCode", exitCode, "attrs", event.Actor.Attributes)
		if exitCode == nil {
			sc.PreviousState = "running"
			sc.NewState = "stopped"
		} else if *exitCode == 0 || isGracefulExit(*exitCode) {
			sc.PreviousState = "running"
			sc.NewState = "stopped"
		} else {
			sc.PreviousState = "running"
			sc.NewState = "crashed"
			sc.Reason = fmt.Sprintf("exit code %d", *exitCode)
		}

	case "oom":
		sc.PreviousState = "running"
		sc.NewState = "crashed"
		sc.Reason = "oom"

	case "destroy":
		sc.PreviousState = "stopped"
		sc.NewState = "missing"

	case "stop":
		// Docker "stop" event is emitted when docker stop is called.
		// The actual state transition is handled by the "die" event.
		// Don't emit a state change here to avoid racing with "die".

	case "kill":
		// Docker "kill" event is just a signal being sent, not an actual death.
		// The "die" event will report the actual exit code and state.
		// Don't emit a state change here to avoid racing with "die".

	case "pause":
		sc.PreviousState = "running"
		sc.NewState = "stopped"
		sc.Reason = "paused"

	case "unpause":
		sc.PreviousState = "stopped"
		sc.NewState = "running"
	}

	return sc
}

func extractExitCode(attrs map[string]string) *int {
	exitCodeStr, ok := attrs["exitCode"]
	if !ok {
		return nil
	}
	var code int
	if _, err := fmt.Sscanf(exitCodeStr, "%d", &code); err != nil {
		return nil
	}
	return &code
}

// isGracefulExit returns true for exit codes that indicate a graceful shutdown
// (e.g. SIGTERM=143, SIGINT=130, SIGQUIT=131, SIGHUP=129).
func isGracefulExit(code int) bool {
	switch code {
	case 129, 130, 131, 143: // SIGHUP, SIGINT, SIGQUIT, SIGTERM
		return true
	default:
		return false
	}
}

func buildEventFilter() filters.Args {
	f := filters.NewArgs()
	f.Add("type", "container")
	f.Add("label", LabelManaged+"=true")
	return f
}
