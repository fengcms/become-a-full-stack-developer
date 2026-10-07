package httpapi

import (
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/administration"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/member"
)

func (a *App) BindMember(s *member.Service, admin *administration.Service) {
	a.Register("listMyFavorites", func(r Request) (any, error) { return s.Articles(r.Context(), r.Actor.ID, r.HTTP.URL.Query(), false) })
	a.Register("addFavorite", func(r Request) (any, error) {
		return map[string]any{}, s.Favorite(r.Context(), r.Actor.ID, r.Input.Int("articleId"), true)
	})
	a.Register("removeFavorite", func(r Request) (any, error) {
		id, e := pathID(r, "articleId")
		if e != nil {
			return nil, e
		}
		return map[string]any{}, s.Favorite(r.Context(), r.Actor.ID, id, false)
	})
	a.Register("listMyLikes", func(r Request) (any, error) { return s.Articles(r.Context(), r.Actor.ID, r.HTTP.URL.Query(), true) })
	a.Register("likeArticle", func(r Request) (any, error) {
		id, e := pathID(r, "id")
		if e != nil {
			return nil, e
		}
		return s.Like(r.Context(), r.Actor.ID, id, true)
	})
	a.Register("unlikeArticle", func(r Request) (any, error) {
		id, e := pathID(r, "id")
		if e != nil {
			return nil, e
		}
		return s.Like(r.Context(), r.Actor.ID, id, false)
	})
	a.Register("getArticleLikeStatus", func(r Request) (any, error) {
		id, e := pathID(r, "id")
		if e != nil {
			return nil, e
		}
		return s.LikeStatus(r.Context(), r.Actor.ID, id)
	})
	a.Register("listMyHistory", func(r Request) (any, error) { return s.History(r.Context(), r.Actor.ID, r.HTTP.URL.Query()) })
	a.Register("reportReadingProgress", func(r Request) (any, error) { return s.Report(r.Context(), r.Actor.ID, r.Input) })
	a.Register("clearMyHistory", func(r Request) (any, error) { return map[string]any{}, s.DeleteHistory(r.Context(), r.Actor.ID, 0) })
	a.Register("removeHistoryItem", func(r Request) (any, error) {
		id, e := pathID(r, "articleId")
		if e != nil {
			return nil, e
		}
		return map[string]any{}, s.DeleteHistory(r.Context(), r.Actor.ID, id)
	})
	a.Register("listMyNotifications", func(r Request) (any, error) { return s.Notifications(r.Context(), r.Actor.ID, r.HTTP.URL.Query()) })
	a.Register("getUnreadNotificationCount", func(r Request) (any, error) { return s.Unread(r.Context(), r.Actor.ID) })
	a.Register("readAllNotifications", func(r Request) (any, error) { return map[string]any{}, s.ReadAll(r.Context(), r.Actor.ID) })
	a.Register("updateNotification", func(r Request) (any, error) {
		id, e := pathID(r, "id")
		if e != nil {
			return nil, e
		}
		return s.Read(r.Context(), r.Actor.ID, id, r.Input.Bool("isRead"))
	})
	a.Register("listUsers", func(r Request) (any, error) { return admin.Users(r.Context(), r.HTTP.URL.Query()) })
	a.Register("getUser", func(r Request) (any, error) {
		id, e := pathID(r, "id")
		if e != nil {
			return nil, e
		}
		return admin.User(r.Context(), id)
	})
	a.Register("updateUser", func(r Request) (any, error) {
		id, e := pathID(r, "id")
		if e != nil {
			return nil, e
		}
		return admin.UpdateUser(r.Context(), id, r.Actor.ID, r.Input)
	})
	a.Register("getMemberProfile", func(r Request) (any, error) {
		id, e := pathID(r, "id")
		if e != nil {
			return nil, e
		}
		return admin.Member(r.Context(), id, r.HTTP.URL.Query())
	})
	a.Register("getSiteStats", func(r Request) (any, error) { return admin.Stats(r.Context()) })
	for _, id := range []string{"getSiteSettings", "adminGetSiteSettings", "adminUpdateSiteSettings"} {
		a.Register(id, func(r Request) (any, error) { return admin.Site(r.Context(), r.Input) })
	}
}
