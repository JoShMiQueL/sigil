package jail

import (
	"os"
	"path/filepath"
	"testing"
)

func setupJail(t *testing.T) (*Jail, string) {
	t.Helper()
	root := t.TempDir()
	// Create some test files
	if err := os.WriteFile(filepath.Join(root, "test.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "subdir"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "subdir", "nested.txt"), []byte("nested"), 0o644); err != nil {
		t.Fatal(err)
	}

	j, err := New(root)
	if err != nil {
		t.Fatalf("failed to create jail: %v", err)
	}
	return j, root
}

func TestValidPathWithinJail(t *testing.T) {
	j, _ := setupJail(t)

	data, err := j.SafeRead("test.txt")
	if err != nil {
		t.Fatalf("expected to read test.txt, got: %v", err)
	}
	if string(data) != "hello" {
		t.Errorf("expected 'hello', got %s", string(data))
	}
}

func TestValidNestedPath(t *testing.T) {
	j, _ := setupJail(t)

	data, err := j.SafeRead("subdir/nested.txt")
	if err != nil {
		t.Fatalf("expected to read nested.txt, got: %v", err)
	}
	if string(data) != "nested" {
		t.Errorf("expected 'nested', got %s", string(data))
	}
}

func TestTraversalRejected(t *testing.T) {
	j, _ := setupJail(t)

	_, err := j.SafeRead("../../../etc/passwd")
	if err == nil {
		t.Fatal("expected error for path traversal, got nil")
	}
}

func TestTraversalWithDotDot(t *testing.T) {
	j, _ := setupJail(t)

	tests := []string{
		"../etc/passwd",
		"../../etc/passwd",
		"subdir/../../../etc/passwd",
		"./../etc/passwd",
		"subdir/../../etc/passwd",
	}

	for _, path := range tests {
		_, err := j.SafeRead(path)
		if err == nil {
			t.Errorf("expected error for traversal path %q, got nil", path)
		}
	}
}

func TestSymlinkEscapeRejected(t *testing.T) {
	j, root := setupJail(t)

	// Create a symlink inside jail pointing to /etc/passwd
	linkPath := filepath.Join(root, "evil")
	if err := os.Symlink("/etc/passwd", linkPath); err != nil {
		t.Skipf("cannot create symlink: %v", err)
	}

	_, err := j.SafeRead("evil")
	if err == nil {
		t.Fatal("expected error for symlink to /etc/passwd, got nil")
	}
}

func TestSymlinkWithinJailAllowed(t *testing.T) {
	j, root := setupJail(t)

	// Create a symlink inside jail pointing to another file inside jail
	linkPath := filepath.Join(root, "link.txt")
	if err := os.Symlink(filepath.Join(root, "test.txt"), linkPath); err != nil {
		t.Skipf("cannot create symlink: %v", err)
	}

	data, err := j.SafeRead("link.txt")
	if err != nil {
		t.Fatalf("expected to read symlink within jail, got: %v", err)
	}
	if string(data) != "hello" {
		t.Errorf("expected 'hello', got %s", string(data))
	}
}

func TestCrossServerIsolation(t *testing.T) {
	root := t.TempDir()
	serverA := filepath.Join(root, "server-a")
	serverB := filepath.Join(root, "server-b")

	if err := os.MkdirAll(serverA, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(serverB, 0o755); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(serverA, "secret.txt"), []byte("server-a-secret"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(serverB, "secret.txt"), []byte("server-b-secret"), 0o644); err != nil {
		t.Fatal(err)
	}

	jailA, err := New(serverA)
	if err != nil {
		t.Fatal(err)
	}

	// Read from server A — should work
	data, err := jailA.SafeRead("secret.txt")
	if err != nil {
		t.Fatalf("expected to read server-a/secret.txt, got: %v", err)
	}
	if string(data) != "server-a-secret" {
		t.Errorf("expected 'server-a-secret', got %s", string(data))
	}

	// Try to access server B from jail A — should fail
	_, err = jailA.SafeRead("../server-b/secret.txt")
	if err == nil {
		t.Fatal("expected error accessing server-b from server-a jail, got nil")
	}
}

func TestSafeWrite(t *testing.T) {
	j, _ := setupJail(t)

	err := j.SafeWrite("new.txt", []byte("new content"))
	if err != nil {
		t.Fatalf("expected to write new.txt, got: %v", err)
	}

	data, err := j.SafeRead("new.txt")
	if err != nil {
		t.Fatalf("expected to read new.txt, got: %v", err)
	}
	if string(data) != "new content" {
		t.Errorf("expected 'new content', got %s", string(data))
	}
}

func TestSafeWriteTraversalRejected(t *testing.T) {
	j, _ := setupJail(t)

	err := j.SafeWrite("../escape.txt", []byte("escaped"))
	if err == nil {
		t.Fatal("expected error for write traversal, got nil")
	}
}

func TestSafeList(t *testing.T) {
	j, _ := setupJail(t)

	entries, err := j.SafeList(".")
	if err != nil {
		t.Fatalf("expected to list jail root, got: %v", err)
	}

	found := false
	for _, e := range entries {
		if e == "test.txt" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected to find test.txt in listing")
	}
}

func TestSafeDelete(t *testing.T) {
	j, _ := setupJail(t)

	err := j.SafeDelete("test.txt")
	if err != nil {
		t.Fatalf("expected to delete test.txt, got: %v", err)
	}

	_, err = j.SafeRead("test.txt")
	if err == nil {
		t.Error("expected error reading deleted file")
	}
}

func TestSafeDeleteTraversalRejected(t *testing.T) {
	j, _ := setupJail(t)

	err := j.SafeDelete("../something")
	if err == nil {
		t.Fatal("expected error for delete traversal, got nil")
	}
}

func TestRootPathResolvesToJailRoot(t *testing.T) {
	j, _ := setupJail(t)

	entries, err := j.SafeList(".")
	if err != nil {
		t.Fatalf("expected to list root, got: %v", err)
	}
	if len(entries) == 0 {
		t.Error("expected non-empty listing at jail root")
	}
}

func TestAbsolutePathRejected(t *testing.T) {
	j, _ := setupJail(t)

	_, err := j.SafeRead("/etc/passwd")
	if err == nil {
		t.Fatal("expected error for absolute path, got nil")
	}
}

func TestSafeRename(t *testing.T) {
	j, _ := setupJail(t)

	if err := j.SafeWrite("old.txt", []byte("content")); err != nil {
		t.Fatalf("setup write: %v", err)
	}

	if err := j.SafeRename("old.txt", "new.txt"); err != nil {
		t.Fatalf("rename: %v", err)
	}

	data, err := j.SafeRead("new.txt")
	if err != nil {
		t.Fatalf("read renamed: %v", err)
	}
	if string(data) != "content" {
		t.Fatalf("content mismatch: %q", data)
	}

	if _, err := j.SafeRead("old.txt"); err == nil {
		t.Error("expected error reading old name")
	}
}

func TestSafeRenameTraversalRejected(t *testing.T) {
	j, _ := setupJail(t)

	if err := j.SafeWrite("test.txt", []byte("x")); err != nil {
		t.Fatalf("setup: %v", err)
	}

	if err := j.SafeRename("test.txt", "../escape.txt"); err == nil {
		t.Fatal("expected error for rename escaping jail")
	}

	if err := j.SafeRename("../escape.txt", "test.txt"); err == nil {
		t.Fatal("expected error for rename from outside jail")
	}
}

func TestSafeRenameNonExistentSource(t *testing.T) {
	j, _ := setupJail(t)

	if err := j.SafeRename("nonexistent.txt", "other.txt"); err == nil {
		t.Fatal("expected error for renaming non-existent source")
	}
}
