package httpapi

import (
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"sync"
	"time"
)

type window struct {
	Start time.Time
	Count int
}
type Limiter struct {
	mu      sync.Mutex
	windows map[string]window
}

func NewLimiter() *Limiter { return &Limiter{windows: map[string]window{}} }
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
	ip, _, e := net.SplitHostPort(r.RemoteAddr)
	if e != nil {
		return r.RemoteAddr
	}
	return ip
}

func (a *App) clientIP(r *http.Request) string {
	ip := clientIP(r)
	addr, e := netip.ParseAddr(ip)
	if e != nil {
		return ip
	}
	trusted := false
	for _, raw := range a.TrustedProxies {
		p, e := netip.ParsePrefix(strings.TrimSpace(raw))
		if e == nil && p.Contains(addr) {
			trusted = true
			break
		}
	}
	if !trusted {
		return ip
	} // Walk from the trusted edge; don't trust a spoofed leftmost entry.
	chain := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
	for i := len(chain) - 1; i >= 0; i-- {
		candidate, e := netip.ParseAddr(strings.TrimSpace(chain[i]))
		if e != nil {
			continue
		}
		ip = candidate.String()
		isTrusted := false
		for _, raw := range a.TrustedProxies {
			p, e := netip.ParsePrefix(strings.TrimSpace(raw))
			if e == nil && p.Contains(candidate) {
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
