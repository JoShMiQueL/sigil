package api

import (
	"encoding/json"
	"net/http"

	"github.com/sigil/sigil/apps/daemon/internal/server"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, code string, message string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]any{
			"code":    code,
			"message": message,
		},
	})
}

func writeNoContent(w http.ResponseWriter) {
	w.WriteHeader(http.StatusNoContent)
}

func decodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		writeError(w, "INVALID_CONFIG", "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return false
	}
	return true
}

func mapErrorToHTTP(err error) (code string, status int) {
	msg := err.Error()
	switch {
	case contains(msg, "INVALID_CONFIG"):
		return "INVALID_CONFIG", http.StatusBadRequest
	case contains(msg, "SERVER_NOT_FOUND"):
		return "SERVER_NOT_FOUND", http.StatusNotFound
	case contains(msg, "DOCKER_UNAVAILABLE"):
		return "DOCKER_UNAVAILABLE", http.StatusServiceUnavailable
	case contains(msg, "DISK_FULL"):
		return "DISK_FULL", http.StatusServiceUnavailable
	case contains(msg, "IMAGE_PULL_FAILED"):
		return "IMAGE_PULL_FAILED", http.StatusUnprocessableEntity
	case contains(msg, "CONFLICT"):
		return "CONFLICT", http.StatusConflict
	default:
		return "INTERNAL_ERROR", http.StatusInternalServerError
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s[:len(substr)] == substr || containsInner(s, substr))
}

func containsInner(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// Handlers

func (h *Handlers) Create(w http.ResponseWriter, r *http.Request) {
	var cfg server.ServerConfiguration
	if !decodeJSON(w, r, &cfg) {
		return
	}

	resp, err := h.manager.Create(r.Context(), &cfg)
	if err != nil {
		code, status := mapErrorToHTTP(err)
		writeError(w, code, err.Error(), status)
		return
	}
	writeJSON(w, http.StatusCreated, resp)
}

func (h *Handlers) Start(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("serverId")
	resp, err := h.manager.Start(r.Context(), serverID)
	if err != nil {
		code, status := mapErrorToHTTP(err)
		writeError(w, code, err.Error(), status)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handlers) Stop(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("serverId")
	resp, err := h.manager.Stop(r.Context(), serverID, h.stopTimeout)
	if err != nil {
		code, status := mapErrorToHTTP(err)
		writeError(w, code, err.Error(), status)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handlers) Restart(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("serverId")
	resp, err := h.manager.Restart(r.Context(), serverID, h.stopTimeout)
	if err != nil {
		code, status := mapErrorToHTTP(err)
		writeError(w, code, err.Error(), status)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handlers) Remove(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("serverId")
	if err := h.manager.Remove(r.Context(), serverID); err != nil {
		code, status := mapErrorToHTTP(err)
		writeError(w, code, err.Error(), status)
		return
	}
	writeNoContent(w)
}

func (h *Handlers) GetStatus(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("serverId")
	resp, err := h.manager.GetStatus(r.Context(), serverID)
	if err != nil {
		code, status := mapErrorToHTTP(err)
		writeError(w, code, err.Error(), status)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handlers) ListStatus(w http.ResponseWriter, r *http.Request) {
	resp := h.manager.ListStatus()
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handlers) Health(w http.ResponseWriter, r *http.Request) {
	dockerStatus := "connected"
	httpCode := http.StatusOK
	status := "ok"

	if h.dockerClient == nil {
		dockerStatus = "disconnected"
		status = "degraded"
		httpCode = http.StatusServiceUnavailable
	} else if err := h.dockerClient.Ping(r.Context()); err != nil {
		dockerStatus = "disconnected"
		status = "degraded"
		httpCode = http.StatusServiceUnavailable
	}

	servers := h.manager.ListStatus()
	writeJSON(w, httpCode, map[string]any{
		"status":     status,
		"docker":     dockerStatus,
		"registered": true,
		"servers":    len(servers),
	})
}

// File operations — protected by jail

func (h *Handlers) WriteFile(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("serverId")

	var req struct {
		Path string `json:"path"`
		Data string `json:"data"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	if err := h.manager.WriteFile(serverID, req.Path, []byte(req.Data)); err != nil {
		code, status := mapErrorToHTTP(err)
		writeError(w, code, err.Error(), status)
		return
	}
	writeNoContent(w)
}

func (h *Handlers) ReadFile(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("serverId")
	path := r.URL.Query().Get("path")

	data, err := h.manager.ReadFile(serverID, path)
	if err != nil {
		code, status := mapErrorToHTTP(err)
		writeError(w, code, err.Error(), status)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"path":    path,
		"content": string(data),
		"size":    len(data),
	})
}

func (h *Handlers) ListFiles(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("serverId")
	path := r.URL.Query().Get("path")
	if path == "" {
		path = "."
	}

	entries, err := h.manager.ListFiles(serverID, path)
	if err != nil {
		code, status := mapErrorToHTTP(err)
		writeError(w, code, err.Error(), status)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"path":    path,
		"entries": entries,
	})
}

func (h *Handlers) DeleteFile(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("serverId")
	path := r.URL.Query().Get("path")

	if err := h.manager.DeleteFile(serverID, path); err != nil {
		code, status := mapErrorToHTTP(err)
		writeError(w, code, err.Error(), status)
		return
	}
	writeNoContent(w)
}
