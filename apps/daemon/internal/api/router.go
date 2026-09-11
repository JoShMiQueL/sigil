package api

import (
	"net/http"

	"github.com/sigil/sigil/apps/daemon/internal/auth"
	"github.com/sigil/sigil/apps/daemon/internal/backup"
	"github.com/sigil/sigil/apps/daemon/internal/console"
	"github.com/sigil/sigil/apps/daemon/internal/docker"
	"github.com/sigil/sigil/apps/daemon/internal/server"
)

type Handlers struct {
	manager        *server.Manager
	dockerClient   *docker.Client
	stopTimeout    int
	consoleHandler *console.Handler
	backupMgr      *backup.Manager
}

func NewHandlers(manager *server.Manager, dockerClient *docker.Client, stopTimeout int, appSecret string, backupMgr *backup.Manager) *Handlers {
	return &Handlers{
		manager:        manager,
		dockerClient:   dockerClient,
		stopTimeout:    stopTimeout,
		consoleHandler: console.NewHandler(dockerClient, appSecret),
		backupMgr:      backupMgr,
	}
}

func NewRouter(h *Handlers, credStore auth.CredentialStore) http.Handler {
	mux := http.NewServeMux()

	// Health endpoint — no auth
	mux.HandleFunc("GET /health", h.Health)

	// WebSocket console endpoint — JWT auth (not HMAC)
	mux.HandleFunc("GET /ws/servers/{serverId}/console", h.consoleHandler.HandleConsole)

	// All other endpoints require HMAC auth
	authMw := auth.NewAuthMiddleware(credStore)

	protected := http.NewServeMux()
	protected.HandleFunc("POST /servers", h.Create)
	protected.HandleFunc("POST /servers/{serverId}/start", h.Start)
	protected.HandleFunc("POST /servers/{serverId}/stop", h.Stop)
	protected.HandleFunc("POST /servers/{serverId}/restart", h.Restart)
	protected.HandleFunc("DELETE /servers/{serverId}", h.Remove)
	protected.HandleFunc("GET /servers/{serverId}", h.GetStatus)
	protected.HandleFunc("GET /servers", h.ListStatus)
	// File operations — protected by jail
	protected.HandleFunc("POST /servers/{serverId}/files/write", h.WriteFile)
	protected.HandleFunc("GET /servers/{serverId}/files/read", h.ReadFile)
	protected.HandleFunc("GET /servers/{serverId}/files/list", h.ListFiles)
	protected.HandleFunc("DELETE /servers/{serverId}/files/delete", h.DeleteFile)
	protected.HandleFunc("POST /servers/{serverId}/files/mkdir", h.Mkdir)
	protected.HandleFunc("GET /servers/{serverId}/files/stat", h.StatFile)
	protected.HandleFunc("POST /servers/{serverId}/files/rename", h.RenameFile)
	protected.HandleFunc("POST /servers/{serverId}/files/upload", h.UploadFile)
	protected.HandleFunc("GET /servers/{serverId}/files/download", h.DownloadFile)
	// Backup operations
	protected.HandleFunc("POST /servers/{serverId}/backups", h.CreateBackup)
	protected.HandleFunc("POST /servers/{serverId}/backups/{backupId}/restore", h.RestoreBackup)
	protected.HandleFunc("DELETE /servers/{serverId}/backups/{backupId}", h.DeleteBackup)

	mux.Handle("/servers", authMw.Wrap(protected))
	mux.Handle("/servers/", authMw.Wrap(protected))

	return mux
}
