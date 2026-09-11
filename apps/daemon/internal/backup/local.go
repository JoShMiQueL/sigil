package backup

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// LocalStorage stores backup files on the local filesystem.
type LocalStorage struct {
	basePath string
}

// NewLocalStorage creates a new local storage backend at the given base path.
func NewLocalStorage(basePath string) (*LocalStorage, error) {
	if err := os.MkdirAll(basePath, 0o755); err != nil {
		return nil, fmt.Errorf("create backup base path: %w", err)
	}
	return &LocalStorage{basePath: basePath}, nil
}

// Store writes the backup data from the reader to a file with the given key.
func (s *LocalStorage) Store(reader io.Reader, key string) (int64, error) {
	path := s.Path(key)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return 0, fmt.Errorf("create backup dir: %w", err)
	}
	f, err := os.Create(path)
	if err != nil {
		return 0, fmt.Errorf("create backup file: %w", err)
	}
	defer f.Close()
	return io.Copy(f, reader)
}

// Retrieve opens the backup file for reading.
func (s *LocalStorage) Retrieve(key string) (io.ReadCloser, error) {
	path := s.Path(key)
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open backup file: %w", err)
	}
	return f, nil
}

// Delete removes the backup file.
func (s *LocalStorage) Delete(key string) error {
	path := s.Path(key)
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("delete backup file: %w", err)
	}
	return nil
}

// Path returns the full filesystem path for a backup key.
func (s *LocalStorage) Path(key string) string {
	return filepath.Join(s.basePath, key+".tar.gz")
}
