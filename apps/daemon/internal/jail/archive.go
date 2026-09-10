package jail

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// ExtractZip extracts a zip archive into the jail at the given relative path.
// All entries are validated to ensure they don't escape the jail.
func (j *Jail) ExtractZip(data []byte, destRelPath string) error {
	dest, err := j.resolve(destRelPath)
	if err != nil {
		return err
	}

	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return fmt.Errorf("open zip: %w", err)
	}

	for _, f := range reader.File {
		if err := j.extractZipEntry(f, dest); err != nil {
			return fmt.Errorf("extract %s: %w", f.Name, err)
		}
	}

	return nil
}

func (j *Jail) extractZipEntry(f *zip.File, dest string) error {
	// Validate the entry name — reject traversal
	name := filepath.Clean(f.Name)
	if filepath.IsAbs(name) || name == ".." || strings.HasPrefix(name, "../") {
		return fmt.Errorf("entry escapes jail: %s", f.Name)
	}

	// Also check for backslash-based traversal (Windows-style)
	name = strings.ReplaceAll(name, "\\", "/")
	if strings.HasPrefix(filepath.Clean(name), "../") {
		return fmt.Errorf("entry escapes jail: %s", f.Name)
	}

	fullPath := filepath.Join(dest, name)

	// Verify the full path is within the jail
	if !j.isWithinJail(fullPath) {
		return fmt.Errorf("entry escapes jail: %s", f.Name)
	}

	if f.FileInfo().IsDir() {
		return os.MkdirAll(fullPath, 0o755)
	}

	// Create parent directory
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		return fmt.Errorf("create parent: %w", err)
	}

	rc, err := f.Open()
	if err != nil {
		return fmt.Errorf("open entry: %w", err)
	}
	defer rc.Close()

	out, err := os.OpenFile(fullPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
	if err != nil {
		return fmt.Errorf("create file: %w", err)
	}
	defer out.Close()

	if _, err := io.Copy(out, rc); err != nil {
		return fmt.Errorf("write file: %w", err)
	}

	return nil
}

// ExtractTar extracts a tar archive into the jail at the given relative path.
// All entries are validated to ensure they don't escape the jail.
func (j *Jail) ExtractTar(data []byte, destRelPath string) error {
	dest, err := j.resolve(destRelPath)
	if err != nil {
		return err
	}

	reader := tar.NewReader(bytes.NewReader(data))

	for {
		hdr, err := reader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("read tar: %w", err)
		}

		if err := j.extractTarEntry(hdr, reader, dest); err != nil {
			return fmt.Errorf("extract %s: %w", hdr.Name, err)
		}
	}

	return nil
}

func (j *Jail) extractTarEntry(hdr *tar.Header, reader *tar.Reader, dest string) error {
	// Validate the entry name — reject traversal
	name := filepath.Clean(hdr.Name)
	if filepath.IsAbs(name) || name == ".." || strings.HasPrefix(name, "../") {
		return fmt.Errorf("entry escapes jail: %s", hdr.Name)
	}

	name = strings.ReplaceAll(name, "\\", "/")
	if strings.HasPrefix(filepath.Clean(name), "../") {
		return fmt.Errorf("entry escapes jail: %s", hdr.Name)
	}

	fullPath := filepath.Join(dest, name)

	// Verify the full path is within the jail
	if !j.isWithinJail(fullPath) {
		return fmt.Errorf("entry escapes jail: %s", hdr.Name)
	}

	switch hdr.Typeflag {
	case tar.TypeDir:
		return os.MkdirAll(fullPath, os.FileMode(hdr.Mode))

	case tar.TypeReg:
		if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
			return fmt.Errorf("create parent: %w", err)
		}
		out, err := os.OpenFile(fullPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
		if err != nil {
			return fmt.Errorf("create file: %w", err)
		}
		defer out.Close()
		if _, err := io.Copy(out, reader); err != nil {
			return fmt.Errorf("write file: %w", err)
		}
		return nil

	case tar.TypeSymlink:
		// Reject symlinks that point outside the jail
		linkTarget := hdr.Linkname
		if filepath.IsAbs(linkTarget) {
			return fmt.Errorf("symlink to absolute path not allowed: %s -> %s", hdr.Name, linkTarget)
		}
		// Check if the resolved symlink target would escape the jail
		resolvedTarget := filepath.Join(filepath.Dir(fullPath), linkTarget)
		if !j.isWithinJail(resolvedTarget) {
			return fmt.Errorf("symlink escapes jail: %s -> %s", hdr.Name, linkTarget)
		}
		return os.Symlink(linkTarget, fullPath)

	case tar.TypeLink:
		// Hard links — resolve target within jail
		targetName := filepath.Clean(hdr.Linkname)
		if filepath.IsAbs(targetName) || strings.HasPrefix(targetName, "../") {
			return fmt.Errorf("hard link target escapes jail: %s", hdr.Linkname)
		}
		targetPath := filepath.Join(dest, targetName)
		if !j.isWithinJail(targetPath) {
			return fmt.Errorf("hard link target escapes jail: %s", hdr.Linkname)
		}
		return os.Link(targetPath, fullPath)

	default:
		return fmt.Errorf("unsupported tar entry type: %d", hdr.Typeflag)
	}
}
