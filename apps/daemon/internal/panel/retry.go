package panel

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"time"
)

type RetryConfig struct {
	Max     int
	Initial time.Duration
	MaxWait time.Duration
}

func DefaultRetryConfig() RetryConfig {
	return RetryConfig{
		Max:     5,
		Initial: 2 * time.Second,
		MaxWait: 30 * time.Second,
	}
}

func (r RetryConfig) Backoff(attempt int) time.Duration {
	wait := r.Initial * time.Duration(math.Pow(2, float64(attempt)))
	if wait > r.MaxWait {
		wait = r.MaxWait
	}
	return wait
}

func RetryWithBackoff(ctx context.Context, cfg RetryConfig, fn func() error) error {
	var lastErr error

	for attempt := 0; attempt < cfg.Max; attempt++ {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		err := fn()
		if err == nil {
			return nil
		}

		if err == ErrCredentialsRevoked {
			return err
		}

		lastErr = err
		slog.Warn("retryable error, backing off", "attempt", attempt+1, "error", err)

		wait := cfg.Backoff(attempt)
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(wait):
		}
	}

	return fmt.Errorf("max retries (%d) exceeded: %w", cfg.Max, lastErr)
}
