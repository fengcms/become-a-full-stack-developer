package httpapi

import (
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/auth"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
)

func (a *App) BindAuth(s *auth.Service) {
	a.Identity = s
	finish := func(r Request, result map[string]any, e error) (any, error) {
		if e == nil {
			Cookie(r.Writer, result["refreshToken"].(string))
		}
		return result, e
	}
	a.Register("registerUser", func(r Request) (any, error) { v, e := s.Register(r.Context(), r.Input); return finish(r, v, e) })
	a.Register("login", func(r Request) (any, error) { v, e := s.Login(r.Context(), r.Input); return finish(r, v, e) })
	a.Register("refreshToken", func(r Request) (any, error) {
		token := r.Input.String("refreshToken")
		if c, e := r.HTTP.Cookie("refreshToken"); e == nil {
			token = c.Value
		}
		if token == "" {
			return nil, fault.New(fault.Missing)
		}
		v, e := s.Rotate(r.Context(), token)
		return finish(r, v, e)
	})
	a.Register("logout", func(r Request) (any, error) {
		e := s.Logout(r.Context(), r.Actor.ID)
		if e == nil {
			Cookie(r.Writer, "")
		}
		return map[string]bool{"success": true}, e
	})
	a.Register("getCurrentUser", func(r Request) (any, error) { u, e := s.User(r.Context(), r.Actor.ID); return auth.Public(u), e })
	a.Register("getMyProfile", func(r Request) (any, error) { u, e := s.User(r.Context(), r.Actor.ID); return auth.Public(u), e })
	a.Register("updateMyProfile", func(r Request) (any, error) { return s.Profile(r.Context(), r.Actor.ID, r.Input) })
	a.Register("changePassword", func(r Request) (any, error) {
		e := s.ChangePassword(r.Context(), r.Actor.ID, r.Input.String("oldPassword"), r.Input.String("newPassword"), false)
		return map[string]any{}, e
	})
	a.Register("adminResetPassword", func(r Request) (any, error) {
		id, e := pathID(r, "id")
		if e != nil {
			return nil, e
		}
		return map[string]any{}, s.ChangePassword(r.Context(), id, "", r.Input.String("newPassword"), true)
	})
	a.Register("setupAccount", func(r Request) (any, error) {
		v, e := s.Setup(r.Context(), r.Actor.ID, r.Input)
		return finish(r, v, e)
	})
	a.Register("oauthCallback", func(r Request) (any, error) {
		p := r.HTTP.PathValue("provider")
		if p != "wechat" && p != "weibo" && p != "github" {
			return nil, fault.Field("provider", "登录类型不合法")
		}
		if p != "wechat" {
			return nil, fault.New(fault.Internal)
		}
		v, e := s.WechatLogin(r.Context(), r.Input.String("code"))
		return finish(r, v, e)
	})
}
