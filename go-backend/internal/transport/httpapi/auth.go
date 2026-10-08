package httpapi

import (
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/auth"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
)

// BindAuth 注册账号认证、资料和首次设置凭据接口。
func (a *App) BindAuth(s *auth.Service) {
	a.Identity = s
	finish := func(r Request, result map[string]any, err error) (any, error) {
		if err == nil {
			Cookie(r.Writer, result["refreshToken"].(string))
		}
		return result, err
	}
	a.Register("registerUser", func(r Request) (any, error) {
		v, err := s.Register(r.Context(), r.Input)
		return finish(r, v, err)
	})
	a.Register("login", func(r Request) (any, error) { v, err := s.Login(r.Context(), r.Input); return finish(r, v, err) })
	a.Register("refreshToken", func(r Request) (any, error) {
		token := r.Input.String("refreshToken")
		if c, err := r.HTTP.Cookie("refreshToken"); err == nil {
			token = c.Value
		}
		if token == "" {
			return nil, fault.New(fault.Missing)
		}
		v, err := s.Rotate(r.Context(), token)
		return finish(r, v, err)
	})
	a.Register("logout", func(r Request) (any, error) {
		err := s.Logout(r.Context(), r.Actor.ID)
		if err == nil {
			Cookie(r.Writer, "")
		}
		return map[string]bool{"success": true}, err
	})
	a.Register("getCurrentUser", func(r Request) (any, error) {
		u, err := s.User(r.Context(), r.Actor.ID)
		return auth.Public(u), err
	})
	a.Register("getMyProfile", func(r Request) (any, error) {
		u, err := s.User(r.Context(), r.Actor.ID)
		return auth.Public(u), err
	})
	a.Register("updateMyProfile", func(r Request) (any, error) { return s.Profile(r.Context(), r.Actor.ID, r.Input) })
	a.Register("changePassword", func(r Request) (any, error) {
		err := s.ChangePassword(r.Context(), r.Actor.ID, r.Input.String("oldPassword"), r.Input.String("newPassword"), false)
		return map[string]any{}, err
	})
	a.registerID("adminResetPassword", "id", func(r Request, id int64) (any, error) {
		return map[string]any{}, s.ChangePassword(r.Context(), id, "", r.Input.String("newPassword"), true)
	})
	a.Register("setupAccount", func(r Request) (any, error) {
		v, err := s.Setup(r.Context(), r.Actor.ID, r.Input)
		return finish(r, v, err)
	})
	a.Register("oauthCallback", func(r Request) (any, error) {
		p := r.HTTP.PathValue("provider")
		if p != "wechat" && p != "weibo" && p != "github" {
			return nil, fault.Field("provider", "登录类型不合法")
		}
		if p != "wechat" {
			return nil, fault.New(fault.Internal)
		}
		v, err := s.WechatLogin(r.Context(), r.Input.String("code"))
		return finish(r, v, err)
	})
}
