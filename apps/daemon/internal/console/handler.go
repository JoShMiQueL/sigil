package console

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/sigil/sigil/apps/daemon/internal/auth"
	"github.com/sigil/sigil/apps/daemon/internal/docker"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// Handler manages WebSocket console connections and per-server sessions.
type Handler struct {
	docker    *docker.Client
	appSecret string
	mu        sync.Mutex
	sessions  map[string]*Session
	stats     map[string]*StatsCollector
}

// NewHandler creates a new console WebSocket handler.
func NewHandler(dockerClient *docker.Client, appSecret string) *Handler {
	return &Handler{
		docker:    dockerClient,
		appSecret: appSecret,
		sessions:  make(map[string]*Session),
		stats:     make(map[string]*StatsCollector),
	}
}

// HandleConsole is the HTTP handler that upgrades to WebSocket and manages the console session.
func (h *Handler) HandleConsole(w http.ResponseWriter, r *http.Request) {
	serverId := r.PathValue("serverId")
	if serverId == "" {
		http.Error(w, "serverId is required", http.StatusBadRequest)
		return
	}

	// Validate JWT from query param
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "token is required", http.StatusUnauthorized)
		return
	}

	_, err := auth.ValidateConsoleToken(token, serverId, h.appSecret)
	if err != nil {
		slog.Warn("console token validation failed", "serverId", serverId, "error", err)
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	// Upgrade to WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("websocket upgrade failed", "serverId", serverId, "error", err)
		return
	}
	defer conn.Close()

	// Get or create session
	session := h.getOrCreateSession(serverId)
	if session == nil {
		writeError(conn, "ATTACH_FAILED", "Failed to start console session")
		return
	}

	// Get or create stats collector
	statsCollector := h.getOrCreateStats(serverId)

	// Add client and send buffer
	if err := session.AddClient(conn); err != nil {
		slog.Error("failed to add console client", "serverId", serverId, "error", err)
		return
	}
	defer session.RemoveClient(conn)

	// Register for stats updates
	statsCollector.AddClient(conn)
	defer statsCollector.RemoveClient(conn)

	// Read messages from client (commands)
	for {
		_, msgBytes, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				slog.Warn("console websocket closed unexpectedly", "serverId", serverId, "error", err)
			}
			break
		}

		var msg map[string]interface{}
		if err := json.Unmarshal(msgBytes, &msg); err != nil {
			continue
		}

		if msgType, ok := msg["type"].(string); ok && msgType == "command" {
			text, _ := msg["text"].(string)
			if len(text) > 4096 {
				text = text[:4096]
			}
			if err := session.WriteCommand(text); err != nil {
				slog.Error("failed to write command", "serverId", serverId, "error", err)
				writeError(conn, "COMMAND_FAILED", err.Error())
			}
		}
	}
}

// getOrCreateSession returns an existing session or creates a new one.
func (h *Handler) getOrCreateSession(serverId string) *Session {
	h.mu.Lock()
	defer h.mu.Unlock()

	if session, ok := h.sessions[serverId]; ok {
		return session
	}

	session := NewSession(serverId, h.docker)
	if err := session.Start(); err != nil {
		slog.Error("failed to start console session", "serverId", serverId, "error", err)
		return nil
	}

	h.sessions[serverId] = session

	return session
}

// getOrCreateStats returns an existing stats collector or creates a new one.
func (h *Handler) getOrCreateStats(serverId string) *StatsCollector {
	h.mu.Lock()
	defer h.mu.Unlock()

	if sc, ok := h.stats[serverId]; ok {
		return sc
	}

	sc := NewStatsCollector(h.docker, serverId)
	sc.Start()
	h.stats[serverId] = sc

	return sc
}

// writeError sends an error message to the WebSocket client.
func writeError(conn *websocket.Conn, code, message string) {
	msg := map[string]interface{}{
		"type":    "error",
		"code":    code,
		"message": message,
	}
	_ = conn.WriteJSON(msg)
}
