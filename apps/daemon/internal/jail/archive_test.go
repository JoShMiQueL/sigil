package jail

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func createZipFile(t *testing.T, entries map[string]string) []byte {
	t.Helper()
	buf := new(bytes.Buffer)
	w := zip.NewWriter(buf)

	for name, content := range entries {
		f, err := w.Create(name)
		if err != nil {
			t.Fatalf("create zip entry %s: %v", name, err)
		}
		if _, err := f.Write([]byte(content)); err != nil {
			t.Fatalf("write zip entry %s: %v", name, err)
		}
	}

	if err := w.Close(); err != nil {
		t.Fatalf("close zip: %v", err)
	}

	return buf.Bytes()
}

func createTarFile(t *testing.T, entries map[string]string) []byte {
	t.Helper()
	buf := new(bytes.Buffer)
	w := tar.NewWriter(buf)

	for name, content := range entries {
		hdr := &tar.Header{
			Name: name,
			Mode: 0o644,
			Size: int64(len(content)),
		}
		if err := w.WriteHeader(hdr); err != nil {
			t.Fatalf("write tar header %s: %v", name, err)
		}
		if _, err := w.Write([]byte(content)); err != nil {
			t.Fatalf("write tar entry %s: %v", name, err)
		}
	}

	if err := w.Close(); err != nil {
		t.Fatalf("close tar: %v", err)
	}

	return buf.Bytes()
}

func TestZipSlipRejected(t *testing.T) {
	j, _ := setupJail(t)

	zipData := createZipFile(t, map[string]string{
		"../../../etc/passwd": "root:x:0:0:root:/root:/bin/bash\n",
		"safe.txt":           "safe content",
	})

	err := j.ExtractZip(zipData, ".")
	if err == nil {
		t.Fatal("expected error for zip-slip, got nil")
	}

	// Verify safe.txt was NOT extracted (or if it was, the slip was rejected)
	// Actually, we should verify the slip entry was rejected
	// The safe entry may or may not have been extracted before the slip was detected
	// depending on implementation. The key is that /etc/passwd was NOT written.
	if _, err := os.Stat("/etc/passwd"); err == nil {
		// /etc/passwd exists (it normally does on Linux), but we should verify
		// our zip didn't overwrite it. Read it and check it's not our content.
		data, _ := os.ReadFile("/etc/passwd")
		if bytes.Contains(data, []byte("root:x:0:0:root:/root:/bin/bash\n")) {
			// This could be the real /etc/passwd content, so this check isn't definitive
			// The real check is that the extraction returned an error
		}
	}
}

func TestZipValidExtracts(t *testing.T) {
	j, _ := setupJail(t)

	zipData := createZipFile(t, map[string]string{
		"file1.txt":      "content1",
		"subdir/file2.txt": "content2",
	})

	err := j.ExtractZip(zipData, ".")
	if err != nil {
		t.Fatalf("expected valid zip to extract, got: %v", err)
	}

	data, err := j.SafeRead("file1.txt")
	if err != nil {
		t.Fatalf("expected to read file1.txt, got: %v", err)
	}
	if string(data) != "content1" {
		t.Errorf("expected 'content1', got %s", string(data))
	}

	data, err = j.SafeRead("subdir/file2.txt")
	if err != nil {
		t.Fatalf("expected to read subdir/file2.txt, got: %v", err)
	}
	if string(data) != "content2" {
		t.Errorf("expected 'content2', got %s", string(data))
	}
}

func TestZipTraversalEntryRejected(t *testing.T) {
	j, _ := setupJail(t)

	tests := []string{
		"../escape.txt",
		"../../escape.txt",
		"subdir/../../../escape.txt",
	}

	for _, entry := range tests {
		zipData := createZipFile(t, map[string]string{
			entry: "escaped",
		})

		err := j.ExtractZip(zipData, ".")
		if err == nil {
			t.Errorf("expected error for zip entry %q, got nil", entry)
		}
	}
}

func TestTarSlipRejected(t *testing.T) {
	j, _ := setupJail(t)

	tarData := createTarFile(t, map[string]string{
		"../../../etc/evil": "evil content",
		"safe.txt":          "safe content",
	})

	err := j.ExtractTar(tarData, ".")
	if err == nil {
		t.Fatal("expected error for tar-slip, got nil")
	}
}

func TestTarValidExtracts(t *testing.T) {
	j, _ := setupJail(t)

	tarData := createTarFile(t, map[string]string{
		"file1.txt":        "content1",
		"subdir/file2.txt": "content2",
	})

	err := j.ExtractTar(tarData, ".")
	if err != nil {
		t.Fatalf("expected valid tar to extract, got: %v", err)
	}

	data, err := j.SafeRead("file1.txt")
	if err != nil {
		t.Fatalf("expected to read file1.txt, got: %v", err)
	}
	if string(data) != "content1" {
		t.Errorf("expected 'content1', got %s", string(data))
	}
}

func TestTarSymlinkEscapeRejected(t *testing.T) {
	j, root := setupJail(t)

	// Create a tar with a symlink pointing outside the jail
	buf := new(bytes.Buffer)
	w := tar.NewWriter(buf)
	hdr := &tar.Header{
		Name:     "evil-link",
		Typeflag: tar.TypeSymlink,
		Linkname: "/etc/passwd",
		Mode:     0o777,
	}
	if err := w.WriteHeader(hdr); err != nil {
		t.Fatalf("write header: %v", err)
	}
	w.Close()

	err := j.ExtractTar(buf.Bytes(), ".")
	if err == nil {
		t.Fatal("expected error for tar symlink escape, got nil")
	}

	// Verify the symlink was NOT created
	if _, err := os.Lstat(filepath.Join(root, "evil-link")); err == nil {
		t.Error("expected evil-link to NOT exist")
	}
}
