package panel

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/sigil/sigil/apps/daemon/internal/auth"
	"github.com/sigil/sigil/apps/daemon/internal/docker"
)

type Client struct {
	baseURL    string
	httpClient  *http.Client
	credentials *auth.Credentials
}

func NewClient(baseURL string, timeout time.Duration) *Client {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

func (c *Client) SetCredentials(creds *auth.Credentials) {
	c.credentials = creds
}

func (c *Client) Register(pairingToken, hostname, ipAddress string, capabilities map[string]bool) (*auth.Credentials, error) {
	body := map[string]any{
		"pairingToken": pairingToken,
		"hostname":     hostname,
		"ipAddress":   ipAddress,
		"capabilities": capabilities,
	}

	data, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal register request: %w", err)
	}

	url := c.baseURL + "/api/node/register"
	resp, err := c.httpClient.Post(url, "application/json", bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("register request: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("register failed: status %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		NodeID   string `json:"nodeId"`
		SecretID string `json:"secretId"`
		Secret   string `json:"secret"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("parse register response: %w", err)
	}

	return &auth.Credentials{
		NodeID:   result.NodeID,
		SecretID: result.SecretID,
		Secret:   result.Secret,
	}, nil
}

type HeartbeatPayload struct {
	Timestamp       int64   `json:"timestamp"`
	CPUUsage        float64 `json:"cpuUsage"`
	MemoryUsage     float64 `json:"memoryUsage"`
	DiskUsage       float64 `json:"diskUsage"`
	ContainerCount  int     `json:"containerCount"`
	DockerAvailable bool    `json:"dockerAvailable"`
}

func (c *Client) SendHeartbeat(payload HeartbeatPayload) error {
	if c.credentials == nil {
		return fmt.Errorf("no credentials set")
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal heartbeat: %w", err)
	}

	return c.signedPost("/api/node/heartbeat", data)
}

func (c *Client) SendStateChange(event docker.StateChangeEvent) error {
	if c.credentials == nil {
		return fmt.Errorf("no credentials set")
	}

	// Add node ID and timestamp
	event.NodeID = c.credentials.NodeID
	if event.Timestamp == 0 {
		event.Timestamp = time.Now().Unix()
	}

	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal state change: %w", err)
	}

	return c.signedPost("/api/node/server-state", data)
}

func (c *Client) signedPost(path string, body []byte) error {
	sig, ts := auth.Sign(c.credentials.Secret, body)

	url := c.baseURL + path
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Node-Id", c.credentials.SecretID)
	req.Header.Set("X-Node-Signature", sig)
	req.Header.Set("X-Node-Timestamp", fmt.Sprintf("%d", ts))

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return ErrCredentialsRevoked
	}

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("status %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

var ErrCredentialsRevoked = fmt.Errorf("credentials revoked")
