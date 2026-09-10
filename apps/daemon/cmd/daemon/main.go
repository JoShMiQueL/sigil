package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/sigil/sigil/apps/daemon/internal/api"
	"github.com/sigil/sigil/apps/daemon/internal/auth"
	"github.com/sigil/sigil/apps/daemon/internal/config"
	"github.com/sigil/sigil/apps/daemon/internal/docker"
	"github.com/sigil/sigil/apps/daemon/internal/heartbeat"
	"github.com/sigil/sigil/apps/daemon/internal/logger"
	"github.com/sigil/sigil/apps/daemon/internal/panel"
	"github.com/sigil/sigil/apps/daemon/internal/server"
)

func main() {
	configPath := flag.String("config", "/etc/sigil/daemon.yaml", "Path to daemon config file")
	flag.Parse()

	// Load config
	cfg, err := config.Load(*configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load config: %v\n", err)
		os.Exit(1)
	}

	// Init logger
	logger.Init(cfg.LogLevel)
	slog.Info("starting sigil daemon", "config", *configPath)

	// Create context for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Connect to Docker
	dockerClient, err := docker.NewClient(cfg.DockerSocket)
	if err != nil {
		slog.Warn("failed to create docker client, starting in degraded mode", "error", err)
		dockerClient = nil
	} else {
		if err := dockerClient.WaitForConnection(ctx, 5, 2*time.Second); err != nil {
			slog.Warn("docker not available, starting in degraded mode", "error", err)
			dockerClient.Close()
			dockerClient = nil
		}
	}
	defer func() {
		if dockerClient != nil {
			dockerClient.Close()
		}
	}()

	// Create panel client
	panelClient := panel.NewClient(cfg.PanelURL, 10*time.Second)

	// Load or register credentials
	var creds *auth.Credentials
	if auth.CredentialsExist(cfg.CredentialsPath) {
		creds, err = auth.LoadCredentials(cfg.CredentialsPath)
		if err != nil {
			slog.Error("failed to load stored credentials", "error", err)
			os.Exit(1)
		}
		slog.Info("using stored credentials, skipping registration", "node_id", creds.NodeID)
	} else {
		if cfg.PairingToken == "" {
			slog.Error("no credentials found and no pairing token in config — cannot register")
			os.Exit(1)
		}

		slog.Info("registering with panel...")
		hostname := cfg.Hostname
		if hostname == "" {
			hostname, _ = os.Hostname()
		}
		capabilities := map[string]bool{
			"docker": dockerClient != nil,
			"sftp":   false,
		}

		ipAddress := cfg.AdvertiseIP
		if ipAddress == "" {
			ipAddress = getOutboundIP()
		}

		retryCfg := panel.DefaultRetryConfig()
		err = panel.RetryWithBackoff(ctx, retryCfg, func() error {
			creds, err = panelClient.Register(cfg.PairingToken, hostname, ipAddress, capabilities)
			return err
		})
		if err != nil {
			slog.Error("failed to register with panel", "error", err)
			os.Exit(1)
		}

		if err := auth.SaveCredentials(cfg.CredentialsPath, creds); err != nil {
			slog.Error("failed to save credentials", "error", err)
			os.Exit(1)
		}

		slog.Info("registered with panel", "node_id", creds.NodeID)
	}

	panelClient.SetCredentials(creds)

	// Start heartbeat loop
	collector := heartbeat.NewCollector(dockerClient, cfg.VolumeBasePath)
	heartbeatLoop := heartbeat.NewLoop(collector, panelClient, cfg.HeartbeatIntervalSec)
	heartbeatLoop.Start(ctx)

	// Create server manager
	serverManager := server.NewManager(dockerClient, creds.NodeID, cfg.VolumeBasePath, cfg.DiskFullThresholdPct)

	// Create state change queue
	stateQueue := server.NewStateChangeQueue(panelClient, creds.NodeID)
	stateQueue.Start(ctx)

	// Start reporting state changes from manager to queue
	go serverManager.ReportStateChanges(ctx, stateQueue)

	// Reconcile existing containers on startup
	if dockerClient != nil {
		if err := serverManager.Reconcile(ctx); err != nil {
			slog.Warn("failed to reconcile containers on startup", "error", err)
		}

		// Start Docker event monitor
		monitor := docker.NewMonitor(dockerClient, creds.NodeID)
		go monitor.Start(ctx)

		// Forward monitor events to the manager's event channel via queue
		go func() {
			for {
				select {
				case <-ctx.Done():
					return
				case event, ok := <-monitor.Events():
					if !ok {
						return
					}
					// Update manager state from monitor event
					serverManager.UpdateStateFromMonitor(event)
					// Only enqueue if the manager accepted the state change
					// (skip if manager kept "stopped" when monitor said "crashed" — intentional stop)
					if serverManager.ShouldReportState(event) {
						stateQueue.Enqueue(event)
					}
				}
			}
		}()
	}

	// Create HTTP server with full API
	handlers := api.NewHandlers(serverManager, dockerClient, cfg.StopTimeoutSec)
	credStore := &auth.StaticCredentialStore{
		SecretID: creds.SecretID,
		Secret:   creds.Secret,
	}
	router := api.NewRouter(handlers, credStore)

	httpServer := &http.Server{
		Addr:    cfg.ListenAddress,
		Handler: router,
	}

	go func() {
		slog.Info("daemon HTTP server listening", "address", cfg.ListenAddress)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("HTTP server error", "error", err)
		}
	}()

	// Wait for shutdown signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
	sig := <-sigCh
	slog.Info("received shutdown signal, shutting down gracefully", "signal", sig)

	// Stop heartbeat loop
	heartbeatLoop.Stop()

	// Stop state change queue
	stateQueue.Stop()

	// Stop HTTP server
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		slog.Error("HTTP server shutdown error", "error", err)
	}

	slog.Info("daemon shutdown complete")
}

func getOutboundIP() string {
	// Try to determine the outbound IP by connecting to a public address
	// This doesn't actually send data — just determines the route
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "127.0.0.1"
	}
	defer conn.Close()

	addr := conn.LocalAddr()
	if addr == nil {
		return "127.0.0.1"
	}
	udpAddr, ok := addr.(*net.UDPAddr)
	if !ok {
		return "127.0.0.1"
	}
	return udpAddr.IP.String()
}
