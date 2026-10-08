package httpapi

import (
	"strconv"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/article"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/comment"
)

// BindDiscovery 注册评论、搜索、目录及阅读量接口。
func (a *App) BindDiscovery(s *article.Service, c *comment.Service) {
	a.Register("listArticleComments", func(r Request) (any, error) {
		return c.Page(r.Context(), r.HTTP.PathValue("idOrSlug"), r.Actor, r.HTTP.URL.Query(), false)
	})
	a.Register("listAdminComments", func(r Request) (any, error) {
		return c.Page(r.Context(), "", r.Actor, r.HTTP.URL.Query(), true)
	})
	a.Register("createComment", func(r Request) (any, error) {
		return c.Create(r.Context(), r.HTTP.PathValue("idOrSlug"), r.Actor, r.Input)
	})
	a.registerID("deleteComment", "id", func(r Request, id int64) (any, error) {
		return map[string]any{}, c.Delete(r.Context(), id, r.Actor)
	})
	a.registerID("moderateComment", "id", func(r Request, id int64) (any, error) {
		return c.Review(r.Context(), id, r.Input)
	})
	a.registerID("getArticleAdjacent", "id", func(r Request, id int64) (any, error) {
		return s.Adjacent(r.Context(), id)
	})
	a.registerID("getArticleRelated", "id", func(r Request, id int64) (any, error) {
		limit, _ := strconv.Atoi(r.HTTP.URL.Query().Get("limit"))
		return s.Related(r.Context(), id, limit)
	})
	a.registerID("getArticleToc", "id", func(r Request, id int64) (any, error) {
		return s.Toc(r.Context(), id)
	})
	a.Register("search", func(r Request) (any, error) { return s.Search(r.Context(), r.HTTP.URL.Query()) })
	a.registerID("viewArticle", "id", func(r Request, id int64) (any, error) {
		return s.Views(r.Context(), id, r.Actor, a.clientIP(r.HTTP), r.HTTP.UserAgent())
	})
}
