// Package httpapi owns HTTP only: routing, validation, cookies and envelopes.
package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/contract"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
)

type Identity interface {
	Parse(string) (values.Actor, error)
}
type Request struct {
	HTTP   *http.Request
	Actor  values.Actor
	Input  values.Fields
	Writer http.ResponseWriter
}

func (r Request) Context() context.Context { return r.HTTP.Context() }

type Handler func(Request) (any, error)
type App struct {
	TrustedProxies []string
	Mux            *http.ServeMux
	Catalog        *contract.Catalog
	Identity       Identity
	Origins        string
	Log            *slog.Logger
	Limiter        *Limiter
	Registered     map[string]bool
	Now            func() time.Time
}

func New(c *contract.Catalog, id Identity, origins string) *App {
	a := &App{Mux: http.NewServeMux(), Catalog: c, Identity: id, Origins: origins, Log: slog.Default(), Limiter: NewLimiter(), Registered: map[string]bool{}, Now: time.Now}
	a.Mux.HandleFunc("GET /api/v1/health", func(w http.ResponseWriter, r *http.Request) { a.write(w, 200, 0, map[string]string{"status": "ok"}) })
	a.Mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { a.write(w, 404, fault.NotFound, nil) })
	return a
}
func (a *App) Register(id string, h Handler) {
	op, ok := a.Catalog.Operations[id]
	if !ok {
		panic("unknown operation " + id)
	}
	a.Registered[id] = true
	a.Mux.HandleFunc(strings.ToUpper(op.Method)+" "+op.Path, func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		defer func() {
			if v := recover(); v != nil {
				a.Log.Error("request panic", "operation", id)
				a.write(w, 500, fault.Internal, nil)
			}
			a.Log.Info("request", "operation", id, "duration_ms", time.Since(start).Milliseconds())
		}()
		actor := values.Actor{}
		header := r.Header.Get("Authorization")
		raw := ""
		if strings.HasPrefix(header, "Bearer ") {
			raw = strings.TrimSpace(header[7:])
		}
		var err error
		if raw != "" && a.Identity != nil {
			actor, err = a.Identity.Parse(raw)
		}
		if op.MinRole != "" {
			if raw == "" {
				err = fault.New(fault.Missing)
			}
			if err == nil && actor.Rank() == 0 {
				err = fault.New(fault.Token)
			}
			if err == nil && !op.Owner && !actor.Allows(op.MinRole, 0) {
				err = fault.New(fault.Forbidden)
			}
		} else {
			err = nil // Frozen Node optional authentication degrades invalid credentials to anonymous.
			if actor.Rank() == 0 {
				actor = values.Actor{}
			}
			if retry, ok := a.Limiter.Allow(id+":"+a.clientKey(r, actor), a.Now()); !ok {
				w.Header().Set("Retry-After", fmt.Sprint(retry))
				err = fault.New(fault.Limited)
			}
		}
		if err != nil {
			a.failure(w, err)
			return
		}
		in := values.Fields{}
		if op.Request != nil {
			e := decode(w, r, &in, !op.BodyRequired)
			if e != nil {
				a.failure(w, e)
				return
			}
			if e = op.Request.Validate(map[string]any(in)); e != nil {
				a.failure(w, &fault.Error{Code: fault.Validation, Data: map[string]any{"errors": contract.Errors(e)}})
				return
			}
		}
		result, e := h(Request{HTTP: r, Actor: actor, Input: in, Writer: w})
		if e != nil {
			a.failure(w, e)
			return
		}
		a.write(w, 200, 0, result)
	})
}
func decode(w http.ResponseWriter, r *http.Request, out *values.Fields, optional bool) error {
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2*1024*1024))
	if e := d.Decode(out); e != nil {
		if optional && e == io.EOF {
			return nil
		}
		return fault.Field("_", "请求体须为JSON对象")
	}
	if *out == nil {
		return fault.Field("_", "请求体须为JSON对象")
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		return fault.Field("_", "请求体包含多余数据")
	}
	return nil
}
func (a *App) failure(w http.ResponseWriter, e error) {
	f := fault.Resolve(e)
	if f.Code == fault.Internal {
		a.Log.Error("internal request failure", "error_type", fmt.Sprintf("%T", e))
	}
	a.write(w, fault.Status(f.Code), f.Code, f.Data)
}
func (a *App) write(w http.ResponseWriter, status, code int, data any) {
	id := make([]byte, 16)
	_, _ = rand.Read(id)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"code": code, "message": fault.Message(code), "data": data, "requestId": hex.EncodeToString(id), "timestamp": values.ISO(a.Now().UnixMilli())})
}
func (a *App) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin != "" {
		for _, allowed := range strings.Split(a.Origins, ",") {
			if strings.TrimSpace(allowed) == origin || strings.TrimSpace(allowed) == "*" {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Add("Vary", "Origin")
				break
			}
		}
	}
	if r.Method == "OPTIONS" {
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.WriteHeader(204)
		return
	}
	a.Mux.ServeHTTP(w, r)
}
func Cookie(w http.ResponseWriter, token string) {
	age := 604800
	if token == "" {
		age = -1
	}
	http.SetCookie(w, &http.Cookie{Name: "refreshToken", Value: token, Path: "/", MaxAge: age, Secure: true, HttpOnly: true, SameSite: http.SameSiteNoneMode})
}
