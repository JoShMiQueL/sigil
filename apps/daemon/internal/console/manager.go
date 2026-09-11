package console

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/gorilla/websocket"
	"github.com/sigil/sigil/apps/daemon/internal/docker"
)

const (
	maxBufferLines = 1000
	maxLineLength  = 8192
)

// bufferedLine is a single line of console output stored in the ring buffer.
type bufferedLine struct {
	Stream    string `json:"stream"`
	Text      string `json:"text"`
	Timestamp int64  `json:"timestamp"`
}

// Session manages a single server's console connection: attaches to the
// container, streams output to connected WebSocket clients, and maintains
// a ring buffer for reconnection.
type Session struct {
	serverId string
	docker   *docker.Client
	mu       sync.Mutex
	clients  map[*websocket.Conn]bool
	buffer   []bufferedLine
	cancel   context.CancelFunc
	done     chan struct{}
}

// NewSession creates a new console session for the given server.
func NewSession(serverId string, dockerClient *docker.Client) *Session {
	return &Session{
		serverId: serverId,
		docker:   dockerClient,
		clients:  make(map[*websocket.Conn]bool),
		buffer:   make([]bufferedLine, 0, maxBufferLines),
	}
}

// Start attaches to the container and begins streaming output.
func (s *Session) Start() error {
	containerId, err := s.findContainer()
	if err != nil {
		return fmt.Errorf("CONTAINER_NOT_FOUND: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel
	s.done = make(chan struct{})

	go s.streamOutput(ctx, containerId)

	return nil
}

// Stop terminates the console session.
func (s *Session) Stop() {
	if s.cancel != nil {
		s.cancel()
	}
	if s.done != nil {
		<-s.done
	}
}

// AddClient registers a WebSocket client and sends the buffer.
func (s *Session) AddClient(conn *websocket.Conn) error {
	s.mu.Lock()
	s.clients[conn] = true
	bufferCopy := make([]bufferedLine, len(s.buffer))
	copy(bufferCopy, s.buffer)
	s.mu.Unlock()

	for _, line := range bufferCopy {
		msg := map[string]interface{}{
			"type":      "output",
			"stream":    line.Stream,
			"text":      line.Text,
			"timestamp": line.Timestamp,
		}
		if err := conn.WriteJSON(msg); err != nil {
			s.RemoveClient(conn)
			return err
		}
	}

	return nil
}

// RemoveClient unregisters a WebSocket client.
func (s *Session) RemoveClient(conn *websocket.Conn) {
	s.mu.Lock()
	delete(s.clients, conn)
	s.mu.Unlock()
}

// HasClients returns true if the session has any connected clients.
func (s *Session) HasClients() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.clients) > 0
}

// WriteCommand sends a command to the container's stdin via exec.
func (s *Session) WriteCommand(text string) error {
	containerId, err := s.findContainer()
	if err != nil {
		return fmt.Errorf("CONTAINER_NOT_FOUND: %w", err)
	}

	execCfg := container.ExecOptions{
		AttachStdin:  false,
		AttachStdout: false,
		AttachStderr: false,
		Tty:          false,
		Cmd:          []string{"/bin/sh", "-c", text},
	}

	execResp, err := s.docker.Raw().ContainerExecCreate(context.Background(), containerId, execCfg)
	if err != nil {
		return fmt.Errorf("exec create: %w", err)
	}

	err = s.docker.Raw().ContainerExecStart(context.Background(), execResp.ID, container.ExecStartOptions{
		Detach: false,
		Tty:    false,
	})
	if err != nil {
		return fmt.Errorf("exec start: %w", err)
	}

	return nil
}

// findContainer finds the container ID for the server.
func (s *Session) findContainer() (string, error) {
	ctx := context.Background()
	containers, err := s.docker.Raw().ContainerList(ctx, container.ListOptions{
		All:     true,
		Filters: filterByServerId(s.serverId),
	})
	if err != nil {
		return "", err
	}
	if len(containers) == 0 {
		return "", fmt.Errorf("no container found for server %s", s.serverId)
	}
	return containers[0].ID, nil
}

// streamOutput attaches to the container and streams stdout/stderr.
func (s *Session) streamOutput(ctx context.Context, containerId string) {
	defer close(s.done)

	options := container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Follow:     true,
		Tail:       "1000",
		Timestamps: false,
	}

	reader, err := s.docker.Raw().ContainerLogs(ctx, containerId, options)
	if err != nil {
		slog.Error("failed to attach to container logs", "serverId", s.serverId, "error", err)
		s.broadcastError("ATTACH_FAILED", fmt.Sprintf("Failed to attach: %v", err))
		return
	}
	defer reader.Close()

	demuxed := demuxStream(reader)
	scanner := newLineScanner(demuxed, maxLineLength)

	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return
		default:
		}

		line := scanner.Text()
		stream := scanner.Stream()
		ts := time.Now().UnixMilli()

		s.mu.Lock()
		s.buffer = append(s.buffer, bufferedLine{
			Stream:    stream,
			Text:      line,
			Timestamp: ts,
		})
		if len(s.buffer) > maxBufferLines {
			s.buffer = s.buffer[len(s.buffer)-maxBufferLines:]
		}
		msg := map[string]interface{}{
			"type":      "output",
			"stream":    stream,
			"text":      line,
			"timestamp": ts,
		}
		for conn := range s.clients {
			if err := conn.WriteJSON(msg); err != nil {
				delete(s.clients, conn)
			}
		}
		s.mu.Unlock()
	}

	if err := scanner.Err(); err != nil {
		slog.Error("log stream error", "serverId", s.serverId, "error", err)
	}
}

// broadcastError sends an error message to all connected clients.
func (s *Session) broadcastError(code, message string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	msg := map[string]interface{}{
		"type":    "error",
		"code":    code,
		"message": message,
	}
	for conn := range s.clients {
		if err := conn.WriteJSON(msg); err != nil {
			delete(s.clients, conn)
		}
	}
}
