package httpapi

import (
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/article"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/comment"
	"strconv"
)

func (a *App) BindDiscovery(s *article.Service, c *comment.Service) {
	a.Register("listArticleComments", func(r Request) (any, error) {
		return c.Page(r.Context(), r.HTTP.PathValue("idOrSlug"), r.Actor, r.HTTP.URL.Query(), false)
	})
	a.Register("listAdminComments", func(r Request) (any, error) { return c.Page(r.Context(), "", r.Actor, r.HTTP.URL.Query(), true) })
	a.Register("createComment", func(r Request) (any, error) {
		return c.Create(r.Context(), r.HTTP.PathValue("idOrSlug"), r.Actor, r.Input)
	})
	a.Register("deleteComment", func(r Request) (any, error) {
		id, e := pathID(r, "id")
		if e != nil {
			return nil, e
		}
		return map[string]any{}, c.Delete(r.Context(), id, r.Actor)
	})
	a.Register("moderateComment", func(r Request) (any, error) {
		id, e := pathID(r, "id")
		if e != nil {
			return nil, e
		}
		return c.Review(r.Context(), id, r.Input)
	})
	a.Register("getArticleAdjacent", func(r Request) (any, error) {
		id, e := pathID(r, "id")
		if e != nil {
			return nil, e
		}
		return s.Adjacent(r.Context(), id)
	})
	a.Register("getArticleRelated", func(r Request) (any, error) {
		id, e := pathID(r, "id")
		if e != nil {
			return nil, e
		}
		limit, _ := strconv.Atoi(r.HTTP.URL.Query().Get("limit"))
		return s.Related(r.Context(), id, limit)
	})
	a.Register("getArticleToc", func(r Request) (any, error) {
		id, e := pathID(r, "id")
		if e != nil {
			return nil, e
		}
		return s.Toc(r.Context(), id)
	})
	a.Register("search", func(r Request) (any, error) { return s.Search(r.Context(), r.HTTP.URL.Query()) })
	a.Register("viewArticle", func(r Request) (any, error) {
		id, e := pathID(r, "id")
		if e != nil {
			return nil, e
		}
		return s.Views(r.Context(), id, r.Actor, a.clientIP(r.HTTP), r.HTTP.UserAgent())
	})
}
