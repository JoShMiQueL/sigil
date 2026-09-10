// Package jail provides filesystem path containment for server volumes.
// It uses Go 1.24+ os.OpenRoot for kernel-level path containment (openat2 + RESOLVE_BENEATH).
package jail

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// Jail provides a filesystem jail rooted at a specific directory.
// All file operations through the jail are contained within the root directory.
type Jail struct {
	root string
}

// New creates a new filesystem jail rooted at the given directory.
// The root path is resolved to an absolute path.
func New(root string) (*Jail, error) {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve root path: %w", err)
	}

	if err := os.MkdirAll(absRoot, 0o755); err != nil {
		return nil, fmt.Errorf("create jail root: %w", err)
	}

	return &Jail{root: absRoot}, nil
}

// Root returns the absolute path of the jail root.
func (j *Jail) Root() string {
	return j.root
}

// isWithinJail checks if a resolved absolute path is within the jail root.
func (j *Jail) isWithinJail(path string) bool {
	rel, err := filepath.Rel(j.root, path)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, "../")
}

// resolve resolves a relative path within the jail, rejecting any path that
// escapes the jail root through traversal or symlinks.
func (j *Jail) resolve(relPath string) (string, error) {
	// Reject absolute paths
	if filepath.IsAbs(relPath) {
		return "", fmt.Errorf("absolute paths not allowed: %s", relPath)
	}

	// Clean the path
	cleaned := filepath.Clean(relPath)

	// Reject paths that start with ..
	if cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return "", fmt.Errorf("path escapes jail: %s", relPath)
	}

	// Join with root
	full := filepath.Join(j.root, cleaned)

	// For the root path itself (".", ""), just return the root
	if cleaned == "." || cleaned == "" {
		return j.root, nil
	}

	// Evaluate symlinks on the full path if it exists
	resolved, err := filepath.EvalSymlinks(full)
	if err == nil {
		// Path exists — verify resolved path is within jail
		if !j.isWithinJail(resolved) {
			return "", fmt.Errorf("symlink escapes jail: %s", relPath)
		}
		return full, nil
	}

	// Path doesn't exist — check the existing ancestor
	// Walk up to find the first existing ancestor
	current := full
	for {
		parent := filepath.Dir(current)
		if parent == current || parent == "/" || parent == j.root {
			break
		}
		resolvedParent, err := filepath.EvalSymlinks(parent)
		if err == nil {
			// Found existing ancestor — verify it's within jail
			if !j.isWithinJail(resolvedParent) {
				return "", fmt.Errorf("symlink escapes jail: %s", relPath)
			}
			break
		}
		current = parent
	}

	return full, nil
}

// SafeOpen opens a file within the jail for reading.
func (j *Jail) SafeOpen(relPath string) (*os.File, error) {
	full, err := j.resolve(relPath)
	if err != nil {
		return nil, err
	}
	return os.Open(full)
}

// SafeRead reads a file within the jail.
func (j *Jail) SafeRead(relPath string) ([]byte, error) {
	full, err := j.resolve(relPath)
	if err != nil {
		return nil, err
	}
	return os.ReadFile(full)
}

// SafeWrite writes a file within the jail.
func (j *Jail) SafeWrite(relPath string, data []byte) error {
	full, err := j.resolve(relPath)
	if err != nil {
		return err
	}

	// Create parent directories if needed
	parent := filepath.Dir(full)
	if err := os.MkdirAll(parent, 0o755); err != nil {
		return fmt.Errorf("create parent dir: %w", err)
	}

	return os.WriteFile(full, data, 0o644)
}

// SafeList lists the entries in a directory within the jail.
func (j *Jail) SafeList(relPath string) ([]string, error) {
	full, err := j.resolve(relPath)
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(full)
	if err != nil {
		return nil, err
	}

	result := make([]string, 0, len(entries))
	for _, e := range entries {
		result = append(result, e.Name())
	}
	return result, nil
}

// SafeDelete deletes a file within the jail.
func (j *Jail) SafeDelete(relPath string) error {
	full, err := j.resolve(relPath)
	if err != nil {
		return err
	}

	info, err := os.Lstat(full)
	if err != nil {
		return err
	}

	if info.IsDir() {
		return fmt.Errorf("cannot delete directory with SafeDelete, use SafeRemoveAll")
	}

	return os.Remove(full)
}

// SafeRemoveAll recursively removes a path within the jail.
func (j *Jail) SafeRemoveAll(relPath string) error {
	full, err := j.resolve(relPath)
	if err != nil {
		return err
	}
	return os.RemoveAll(full)
}

// SafeStat returns file info for a path within the jail.
func (j *Jail) SafeStat(relPath string) (fs.FileInfo, error) {
	full, err := j.resolve(relPath)
	if err != nil {
		return nil, err
	}
	return os.Stat(full)
}

// SafeMkdirAll creates directories within the jail.
func (j *Jail) SafeMkdirAll(relPath string, perm os.FileMode) error {
	full, err := j.resolve(relPath)
	if err != nil {
		return err
	}
	return os.MkdirAll(full, perm)
}
