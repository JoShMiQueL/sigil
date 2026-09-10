package docker

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/docker/docker/client"
)

type Client struct {
	cli *client.Client
}

func NewClient(socketPath string) (*Client, error) {
	if socketPath == "" {
		socketPath = "/var/run/docker.sock"
	}

	httpClient := &http.Client{
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, _, addr string) (net.Conn, error) {
				return (&net.Dialer{}).DialContext(ctx, "unix", socketPath)
			},
		},
	}

	cli, err := client.NewClientWithOpts(
		client.WithAPIVersionNegotiation(),
		client.WithHTTPClient(httpClient),
		client.WithHost("unix://"+socketPath),
	)
	if err != nil {
		return nil, fmt.Errorf("create docker client: %w", err)
	}

	return &Client{cli: cli}, nil
}

func (c *Client) Ping(ctx context.Context) error {
	_, err := c.cli.Ping(ctx)
	return err
}

func (c *Client) Close() error {
	if c.cli != nil {
		return c.cli.Close()
	}
	return nil
}

func (c *Client) Raw() *client.Client {
	return c.cli
}

func (c *Client) WaitForConnection(ctx context.Context, maxRetries int, interval time.Duration) error {
	for i := 0; i < maxRetries; i++ {
		if err := c.Ping(ctx); err == nil {
			slog.Info("docker connection established")
			return nil
		} else {
			slog.Warn("docker connection failed, retrying", "attempt", i+1, "error", err)
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(interval):
		}
	}
	return fmt.Errorf("docker connection failed after %d retries", maxRetries)
}
