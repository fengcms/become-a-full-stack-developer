package httpapi

import (
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/administration"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/member"
)

// BindMember 注册会员互动、通知、用户管理和站点接口。
func (a *App) BindMember(s *member.Service, admin *administration.Service) {
	a.Register("listMyFavorites", func(r Request) (any, error) {
		return s.Articles(r.Context(), r.Actor.ID, r.HTTP.URL.Query(), false)
	})
	a.Register("addFavorite", func(r Request) (any, error) {
		return map[string]any{}, s.Favorite(r.Context(), r.Actor.ID, r.Input.Int("articleId"), true)
	})
	a.registerID("removeFavorite", "articleId", func(r Request, id int64) (any, error) {
		return map[string]any{}, s.Favorite(r.Context(), r.Actor.ID, id, false)
	})
	a.Register("listMyLikes", func(r Request) (any, error) {
		return s.Articles(r.Context(), r.Actor.ID, r.HTTP.URL.Query(), true)
	})
	a.registerID("likeArticle", "id", func(r Request, id int64) (any, error) {
		return s.Like(r.Context(), r.Actor.ID, id, true)
	})
	a.registerID("unlikeArticle", "id", func(r Request, id int64) (any, error) {
		return s.Like(r.Context(), r.Actor.ID, id, false)
	})
	a.registerID("getArticleLikeStatus", "id", func(r Request, id int64) (any, error) {
		return s.LikeStatus(r.Context(), r.Actor.ID, id)
	})
	a.Register("listMyHistory", func(r Request) (any, error) {
		return s.History(r.Context(), r.Actor.ID, r.HTTP.URL.Query())
	})
	a.Register("reportReadingProgress", func(r Request) (any, error) { return s.Report(r.Context(), r.Actor.ID, r.Input) })
	a.Register("clearMyHistory", func(r Request) (any, error) {
		return map[string]any{}, s.DeleteHistory(r.Context(), r.Actor.ID, 0)
	})
	a.registerID("removeHistoryItem", "articleId", func(r Request, id int64) (any, error) {
		return map[string]any{}, s.DeleteHistory(r.Context(), r.Actor.ID, id)
	})
	a.Register("listMyNotifications", func(r Request) (any, error) {
		return s.Notifications(r.Context(), r.Actor.ID, r.HTTP.URL.Query())
	})
	a.Register("getUnreadNotificationCount", func(r Request) (any, error) { return s.Unread(r.Context(), r.Actor.ID) })
	a.Register("readAllNotifications", func(r Request) (any, error) {
		return map[string]any{}, s.ReadAll(r.Context(), r.Actor.ID)
	})
	a.registerID("updateNotification", "id", func(r Request, id int64) (any, error) {
		return s.Read(r.Context(), r.Actor.ID, id, r.Input.Bool("isRead"))
	})
	a.Register("listUsers", func(r Request) (any, error) { return admin.Users(r.Context(), r.HTTP.URL.Query()) })
	a.registerID("getUser", "id", func(r Request, id int64) (any, error) {
		return admin.User(r.Context(), id)
	})
	a.registerID("updateUser", "id", func(r Request, id int64) (any, error) {
		return admin.UpdateUser(r.Context(), id, r.Actor.ID, r.Input)
	})
	a.registerID("getMemberProfile", "id", func(r Request, id int64) (any, error) {
		return admin.Member(r.Context(), id, r.HTTP.URL.Query())
	})
	a.Register("getSiteStats", func(r Request) (any, error) { return admin.Stats(r.Context()) })
	// 公开读取和后台读取不传更新字段；PATCH 才把输入交给服务。
	a.Register("getSiteSettings", func(r Request) (any, error) {
		return admin.Site(r.Context(), nil)
	})
	a.Register("adminGetSiteSettings", func(r Request) (any, error) {
		return admin.Site(r.Context(), nil)
	})
	a.Register("adminUpdateSiteSettings", func(r Request) (any, error) {
		return admin.Site(r.Context(), r.Input)
	})
}
