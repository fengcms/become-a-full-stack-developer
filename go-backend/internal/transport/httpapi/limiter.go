package httpapi

import (
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
)

type window struct {
	Start time.Time
	Count int
}

// Limiter 按操作及访问者记录有界的进程内限流窗口。
type Limiter struct {
	mu      sync.Mutex
	windows map[string]window
}

// NewLimiter 创建空限流窗口集合，避免不同应用实例共用测试状态。
func NewLimiter() *Limiter { return &Limiter{windows: map[string]window{}} }

// Allow 判断当前窗口是否允许请求，拒绝时返回剩余等待秒数。
func (l *Limiter) Allow(key string, now time.Time) (int, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.windows) >= 10000 {
		for k, v := range l.windows {
			if now.Sub(v.Start) >= time.Minute {
				delete(l.windows, k)
			}
		}
		if len(l.windows) >= 10000 {
			if _, ok := l.windows[key]; !ok {
				return 60, false
			}
		}
	}
	w := l.windows[key]
	if now.Sub(w.Start) >= time.Minute {
		w = window{Start: now}
	}
	if w.Count >= 60 {
		return int(time.Minute.Seconds()-now.Sub(w.Start).Seconds()) + 1, false
	}
	w.Count++
	l.windows[key] = w
	return 0, true
}
func clientIP(r *http.Request) string {
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

func (a *App) clientIP(r *http.Request) string {
	ip := clientIP(r)
	addr, err := netip.ParseAddr(ip)
	if err != nil {
		return ip
	}
	trusted := false
	for _, raw := range a.TrustedProxies {
		p, err := netip.ParsePrefix(strings.TrimSpace(raw))
		if err == nil && p.Contains(addr) {
			trusted = true
			break
		}
	}
	if !trusted {
		return ip
	} // Walk from the trusted edge; don't trust a spoofed leftmost entry.
	chain := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
	for i := len(chain) - 1; i >= 0; i-- {
		candidate, err := netip.ParseAddr(strings.TrimSpace(chain[i]))
		if err != nil {
			continue
		}
		ip = candidate.String()
		isTrusted := false
		for _, raw := range a.TrustedProxies {
			p, err := netip.ParsePrefix(strings.TrimSpace(raw))
			if err == nil && p.Contains(candidate) {
				isTrusted = true
				break
			}
		}
		if !isTrusted {
			return ip
		}
	}
	return ip
}
func (a *App) clientKey(r *http.Request, actor values.Actor) string {
	if actor.ID > 0 {
		return "u:" + strconv.FormatInt(actor.ID, 10)
	}
	return a.clientIP(r)
}
