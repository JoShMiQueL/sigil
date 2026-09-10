package docker

import (
	"sync"
)

// UIDAllocator allocates unique UID/GID pairs from a configurable range.
type UIDAllocator struct {
	mu        sync.Mutex
	min       int
	max       int
	allocated map[int]string // uid -> serverID
}

func NewUIDAllocator(min, max int) *UIDAllocator {
	return &UIDAllocator{
		min:       min,
		max:       max,
		allocated: make(map[int]string),
	}
}

// Allocate assigns a unique UID/GID pair for the given server ID.
func (a *UIDAllocator) Allocate(serverID string) (int, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	// Check if server already has a UID
	for uid, sid := range a.allocated {
		if sid == serverID {
			return uid, nil
		}
	}

	// Find a free UID
	for uid := a.min; uid <= a.max; uid++ {
		if _, taken := a.allocated[uid]; !taken {
			a.allocated[uid] = serverID
			return uid, nil
		}
	}

	return 0, ErrUIDRangeExhausted
}

// Release frees the UID assigned to the given server ID.
func (a *UIDAllocator) Release(serverID string) {
	a.mu.Lock()
	defer a.mu.Unlock()

	for uid, sid := range a.allocated {
		if sid == serverID {
			delete(a.allocated, uid)
			return
		}
	}
}

// Get returns the UID assigned to the given server ID, if any.
func (a *UIDAllocator) Get(serverID string) (int, bool) {
	a.mu.Lock()
	defer a.mu.Unlock()

	for uid, sid := range a.allocated {
		if sid == serverID {
			return uid, true
		}
	}
	return 0, false
}

// AllocatedCount returns the number of allocated UIDs.
func (a *UIDAllocator) AllocatedCount() int {
	a.mu.Lock()
	defer a.mu.Unlock()
	return len(a.allocated)
}

var ErrUIDRangeExhausted = errUIDRangeExhausted

type errUIDRangeExhaustedType struct{}

func (errUIDRangeExhaustedType) Error() string {
	return "UID range exhausted"
}

var errUIDRangeExhausted = errUIDRangeExhaustedType{}
