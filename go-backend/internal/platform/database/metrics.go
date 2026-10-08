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

// Metrics 汇总数据库调用耗时，不记录 SQL 或参数。
// 它是可选进程诊断，不是公开 HTTP 监控接口。
// 耗时包括 GORM 开销，不能当作 PostgreSQL 服务端执行耗时。
type Metrics struct{ queries, failures, nanos, max atomic.Int64 }

// Observe 安装只记录聚合耗时的 GORM 日志器，避免采集 SQL 和参数。
func Observe(db *gorm.DB) *Metrics { m := &Metrics{}; db.Logger = m; return m }

// LogMode 满足 GORM 日志接口，仍保持仅聚合记录的策略。
func (m *Metrics) LogMode(logger.LogLevel) logger.Interface { return m }

// Info 忽略文本日志，避免潜在 SQL 参数进入诊断文件。
func (*Metrics) Info(context.Context, string, ...any) {}

// Warn 忽略文本警告，数据库诊断只保留计数和耗时。
func (*Metrics) Warn(context.Context, string, ...any) {}

// Error 忽略文本错误，业务错误通过服务的返回值传播。
func (*Metrics) Error(context.Context, string, ...any) {}

// Trace 累计调用耗时和错误数，不调用包含 SQL 文本的回调。
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

// Write 把脱敏的聚合统计保存到指定文件。
func (m *Metrics) Write(path string) error {
	out := map[string]any{
		"queries": m.queries.Load(),
		"errors":  m.failures.Load(),
		"totalMs": float64(m.nanos.Load()) / 1e6,
		"maxMs":   float64(m.max.Load()) / 1e6,
	}
	b, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0600)
}
