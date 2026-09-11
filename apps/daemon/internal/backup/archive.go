package backup

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/sigil/sigil/apps/daemon/internal/jail"
)

// CreateArchive creates a tar.gz archive of the server's volume.
// It returns a reader for the compressed archive and the size in bytes.
// The archive is written to a temp file first, then opened for reading.
func CreateArchive(j *jail.Jail, serverID string) (*os.File, int64, error) {
	// Create a temp file to write the archive
	tmpFile, err := os.CreateTemp("", fmt.Sprintf("sigil-backup-%s-*.tar.gz", serverID))
	if err != nil {
		return nil, 0, fmt.Errorf("create temp file: %w", err)
	}

	gzWriter := gzip.NewWriter(tmpFile)
	tarWriter := tar.NewWriter(gzWriter)

	// Walk the jail root and add all files to the archive
	root := j.Root()
	err = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		// Skip the root itself
		if path == root {
			return nil
		}
		// Calculate relative path
		relPath, err := filepath.Rel(root, path)
		if err != nil {
			return fmt.Errorf("rel path: %w", err)
		}
		// Create tar header
		header, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return fmt.Errorf("create tar header for %s: %w", relPath, err)
		}
		header.Name = relPath
		if err := tarWriter.WriteHeader(header); err != nil {
			return fmt.Errorf("write tar header for %s: %w", relPath, err)
		}
		// If it's a file, copy the content
		if !info.IsDir() {
			f, err := os.Open(path)
			if err != nil {
				return fmt.Errorf("open file %s: %w", relPath, err)
			}
			defer f.Close()
			if _, err := io.Copy(tarWriter, f); err != nil {
				return fmt.Errorf("copy file %s: %w", relPath, err)
			}
		}
		return nil
	})
	if err != nil {
		tmpFile.Close()
		os.Remove(tmpFile.Name())
		return nil, 0, fmt.Errorf("walk volume: %w", err)
	}

	if err := tarWriter.Close(); err != nil {
		tmpFile.Close()
		os.Remove(tmpFile.Name())
		return nil, 0, fmt.Errorf("close tar writer: %w", err)
	}
	if err := gzWriter.Close(); err != nil {
		tmpFile.Close()
		os.Remove(tmpFile.Name())
		return nil, 0, fmt.Errorf("close gzip writer: %w", err)
	}

	// Get the file size
	stat, err := tmpFile.Stat()
	if err != nil {
		tmpFile.Close()
		os.Remove(tmpFile.Name())
		return nil, 0, fmt.Errorf("stat backup file: %w", err)
	}
	size := stat.Size()

	// Seek to beginning for reading
	if _, err := tmpFile.Seek(0, io.SeekStart); err != nil {
		tmpFile.Close()
		os.Remove(tmpFile.Name())
		return nil, 0, fmt.Errorf("seek backup file: %w", err)
	}

	return tmpFile, size, nil
}

// ExtractArchive extracts a tar.gz archive into the server's volume through the jail.
// It validates that no entries escape the jail (zip-slip protection).
func ExtractArchive(j *jail.Jail, serverID string, reader io.Reader) error {
	gzReader, err := gzip.NewReader(reader)
	if err != nil {
		return fmt.Errorf("open gzip reader: %w", err)
	}
	defer gzReader.Close()

	tarReader := tar.NewReader(gzReader)
	root := j.Root()

	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("read tar entry: %w", err)
		}
		// Validate the entry name — reject traversal
		name := filepath.Clean(header.Name)
		if filepath.IsAbs(name) || name == ".." || strings.HasPrefix(name, "../") {
			return fmt.Errorf("entry escapes jail: %s", header.Name)
		}
		target := filepath.Join(root, name)
		// Ensure target is within jail
		if !strings.HasPrefix(filepath.Clean(target), root) {
			return fmt.Errorf("entry escapes jail: %s", header.Name)
		}
		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, os.FileMode(header.Mode)); err != nil {
				return fmt.Errorf("create dir %s: %w", name, err)
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return fmt.Errorf("create parent dir for %s: %w", name, err)
			}
			f, err := os.Create(target)
			if err != nil {
				return fmt.Errorf("create file %s: %w", name, err)
			}
			if _, err := io.Copy(f, tarReader); err != nil {
				f.Close()
				return fmt.Errorf("write file %s: %w", name, err)
			}
			f.Close()
		case tar.TypeSymlink:
			// Skip symlinks for security — they could escape the jail
			continue
		default:
			// Skip unsupported types
			continue
		}
	}

	return nil
}
