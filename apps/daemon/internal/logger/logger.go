package logger

import (
	"log/slog"
	"os"
	"strings"
)

var secretPatterns = []string{
	"sigilpair_",
	"sigilnode_",
	"secret",
	"password",
	"token",
	"credentials",
}

func Init(level string) {
	var sl slog.Level
	switch strings.ToLower(level) {
	case "debug":
		sl = slog.LevelDebug
	case "warn":
		sl = slog.LevelWarn
	case "error":
		sl = slog.LevelError
	default:
		sl = slog.LevelInfo
	}

	handler := slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: sl,
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			if a.Key == slog.MessageKey {
				a.Value = slog.StringValue(redact(a.Value.String()))
			}
			return a
		},
	})
	slog.SetDefault(slog.New(handler))
}

func redact(s string) string {
	out := s
	for _, p := range secretPatterns {
		if strings.Contains(strings.ToLower(out), p) {
			idx := strings.Index(strings.ToLower(out), p)
			end := idx + len(p)
			// Find the end of the value (space, comma, quote, or end of string)
			for end < len(out) && out[end] != ' ' && out[end] != ',' && out[end] != '"' && out[end] != '\'' && out[end] != '}' {
				end++
			}
			out = out[:idx+len(p)] + "[REDACTED]" + out[end:]
		}
	}
	return out
}
