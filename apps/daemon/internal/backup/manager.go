package backup

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"os"
	"sync"

	"github.com/sigil/sigil/apps/daemon/internal/server"
)

// Storage is the interface that both local and S3 backends implement.
type Storage interface {
	Store(reader io.Reader, key string) (int64, error)
	Retrieve(key string) (io.ReadCloser, error)
	Delete(key string) error
}

// Manager manages backup operations on the daemon.
type Manager struct {
	mu          sync.Mutex
	inProgress  map[string]bool // serverID → backup in progress
	localStorage *LocalStorage
	serverMgr   *server.Manager
}

// NewManager creates a new backup manager.
func NewManager(localStorage *LocalStorage, serverMgr *server.Manager) *Manager {
	return &Manager{
		inProgress:   make(map[string]bool),
		localStorage: localStorage,
		serverMgr:    serverMgr,
	}
}

// CreateBackup creates a tar.gz archive of the server's volume and stores it.
// backupID is used as the storage key. storageLocation determines where to store.
// For S3, s3Cfg must be provided.
func (m *Manager) CreateBackup(serverID, backupID, name string, storageLocation string, s3Cfg *S3Config) (int64, string, error) {
	m.mu.Lock()
	if m.inProgress[serverID] {
		m.mu.Unlock()
		return 0, "", fmt.Errorf("BACKUP_IN_PROGRESS: a backup is already in progress for this server")
	}
	m.inProgress[serverID] = true
	m.mu.Unlock()
	defer func() {
		m.mu.Lock()
		delete(m.inProgress, serverID)
		m.mu.Unlock()
	}()

	// Get the server's jail
	j, err := m.serverMgr.GetJail(serverID)
	if err != nil {
		return 0, "", fmt.Errorf("get server jail: %w", err)
	}

	// Create the archive
	archiveFile, size, err := CreateArchive(j, serverID)
	if err != nil {
		return 0, "", fmt.Errorf("create archive: %w", err)
	}
	defer archiveFile.Close()
	defer os.Remove(archiveFile.Name())

	// Compute checksum
	if _, err := archiveFile.Seek(0, io.SeekStart); err != nil {
		return 0, "", fmt.Errorf("seek archive for checksum: %w", err)
	}
	hasher := sha256.New()
	if _, err := io.Copy(hasher, archiveFile); err != nil {
		return 0, "", fmt.Errorf("compute checksum: %w", err)
	}
	checksum := hex.EncodeToString(hasher.Sum(nil))

	// Seek back to start for storage
	if _, err := archiveFile.Seek(0, io.SeekStart); err != nil {
		return 0, "", fmt.Errorf("seek archive for storage: %w", err)
	}

	// Store the backup
	var storage Storage
	if storageLocation == "s3" && s3Cfg != nil {
		s3Storage, err := NewS3Storage(*s3Cfg)
		if err != nil {
			return 0, "", fmt.Errorf("create s3 storage: %w", err)
		}
		storage = s3Storage
	} else {
		storage = m.localStorage
	}

	if _, err := storage.Store(archiveFile, backupID); err != nil {
		return 0, "", fmt.Errorf("store backup: %w", err)
	}

	slog.Info("backup created", "serverId", serverID, "backupId", backupID, "name", name, "size", size, "storage", storageLocation)
	return size, checksum, nil
}

// RestoreBackup downloads and extracts a backup into the server's volume.
func (m *Manager) RestoreBackup(serverID, backupID string, storageLocation string, s3Cfg *S3Config) error {
	// Get the server's jail
	j, err := m.serverMgr.GetJail(serverID)
	if err != nil {
		return fmt.Errorf("get server jail: %w", err)
	}

	// Get the storage backend
	var storage Storage
	if storageLocation == "s3" && s3Cfg != nil {
		s3Storage, err := NewS3Storage(*s3Cfg)
		if err != nil {
			return fmt.Errorf("create s3 storage: %w", err)
		}
		storage = s3Storage
	} else {
		storage = m.localStorage
	}

	// Retrieve the backup
	reader, err := storage.Retrieve(backupID)
	if err != nil {
		return fmt.Errorf("retrieve backup: %w", err)
	}
	defer reader.Close()

	// Extract into the volume through the jail
	if err := ExtractArchive(j, serverID, reader); err != nil {
		return fmt.Errorf("extract archive: %w", err)
	}

	slog.Info("backup restored", "serverId", serverID, "backupId", backupID, "storage", storageLocation)
	return nil
}

// DeleteBackup removes a backup from storage.
func (m *Manager) DeleteBackup(serverID, backupID string, storageLocation string, s3Cfg *S3Config) error {
	var storage Storage
	if storageLocation == "s3" && s3Cfg != nil {
		s3Storage, err := NewS3Storage(*s3Cfg)
		if err != nil {
			return fmt.Errorf("create s3 storage: %w", err)
		}
		storage = s3Storage
	} else {
		storage = m.localStorage
	}

	if err := storage.Delete(backupID); err != nil {
		return fmt.Errorf("delete backup: %w", err)
	}

	slog.Info("backup deleted", "serverId", serverID, "backupId", backupID, "storage", storageLocation)
	return nil
}

// IsBackupInProgress returns true if a backup is currently being created for the server.
func (m *Manager) IsBackupInProgress(serverID string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.inProgress[serverID]
}
