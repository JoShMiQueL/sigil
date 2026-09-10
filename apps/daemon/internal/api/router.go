package api

import (
	"net/http"

	"github.com/sigil/sigil/apps/daemon/internal/auth"
	"github.com/sigil/sigil/apps/daemon/internal/docker"
	"github.com/sigil/sigil/apps/daemon/internal/server"
)

type Handlers struct {
	manager      *server.Manager
	dockerClient  *docker.Client
	stopTimeout   int
}

func NewHandlers(manager *server.Manager, dockerClient *docker.Client, stopTimeout int) *Handlers {
	return &Handlers{
		manager:      manager,
		dockerClient:  dockerClient,
		stopTimeout:   stopTimeout,
	}
}

func NewRouter(h *Handlers, credStore auth.CredentialStore) http.Handler {
	mux := http.NewServeMux()

	// Health endpoint — no auth
	mux.HandleFunc("GET /health", h.Health)

	// All other endpoints require auth
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

	mux.Handle("/servers", authMw.Wrap(protected))
	mux.Handle("/servers/", authMw.Wrap(protected))

	return mux
}
