package database

import (
	"context"
	"encoding/json"
	"os"
	"sync/atomic"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Metrics records aggregate driver-call elapsed time without SQL or arguments.
// It is optional diagnostic instrumentation, not an HTTP/public metrics API.
// Time includes GORM overhead; it is not PostgreSQL server execution time.
type Metrics struct{ queries, failures, nanos, max atomic.Int64 }

func Observe(db *gorm.DB) *Metrics                          { m := &Metrics{}; db.Logger = m; return m }
func (m *Metrics) LogMode(logger.LogLevel) logger.Interface { return m }
func (*Metrics) Info(context.Context, string, ...any)       {}
func (*Metrics) Warn(context.Context, string, ...any)       {}
func (*Metrics) Error(context.Context, string, ...any)      {}
func (m *Metrics) Trace(_ context.Context, begin time.Time, _ func() (string, int64), err error) {
	duration := time.Since(begin).Nanoseconds()
	m.queries.Add(1)
	m.nanos.Add(duration)
	if err != nil {
		m.failures.Add(1)
	}
	for current := m.max.Load(); duration > current; current = m.max.Load() {
		if m.max.CompareAndSwap(current, duration) {
			break
		}
	}
}
func (m *Metrics) Write(path string) error {
	out := map[string]any{"queries": m.queries.Load(), "errors": m.failures.Load(), "totalMs": float64(m.nanos.Load()) / 1e6, "maxMs": float64(m.max.Load()) / 1e6}
	b, e := json.MarshalIndent(out, "", "  ")
	if e != nil {
		return e
	}
	return os.WriteFile(path, b, 0600)
}
