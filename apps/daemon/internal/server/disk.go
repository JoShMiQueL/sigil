package server

import "syscall"

func getDiskUsage(path string) float64 {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0
	}

	total := stat.Blocks * uint64(stat.Bsize)
	avail := stat.Bavail * uint64(stat.Bsize)
	if total <= 0 {
		return 0
	}

	used := total - avail
	usage := float64(used) / float64(total) * 100
	if usage > 100 {
		usage = 100
	}
	if usage < 0 {
		usage = 0
	}
	return usage
}
