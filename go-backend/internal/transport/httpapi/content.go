package httpapi

import (
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/article"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/taxonomy"
)

func (a *App) BindContent(s *article.Service, t *taxonomy.Service) {
	a.Register("listArticles", func(r Request) (any, error) { return s.Page(r.Context(), r.HTTP.URL.Query(), "published", 0) })
	a.Register("listMyArticles", func(r Request) (any, error) {
		return s.Page(r.Context(), r.HTTP.URL.Query(), r.HTTP.URL.Query().Get("status"), r.Actor.ID)
	})
	a.Register("listAdminArticles", func(r Request) (any, error) {
		return s.Page(r.Context(), r.HTTP.URL.Query(), r.HTTP.URL.Query().Get("status"), 0)
	})
	a.Register("getArticle", func(r Request) (any, error) { return s.Get(r.Context(), r.HTTP.PathValue("idOrSlug"), r.Actor) })
	a.Register("createArticle", func(r Request) (any, error) { return s.Create(r.Context(), r.Actor, r.Input) })
	a.Register("updateArticle", func(r Request) (any, error) {
		id, e := pathID(r, "id")
		if e != nil {
			return nil, e
		}
		return s.Update(r.Context(), id, r.Actor, r.Input)
	})
	a.Register("deleteArticle", func(r Request) (any, error) {
		id, e := pathID(r, "id")
		if e != nil {
			return nil, e
		}
		return map[string]bool{"success": true}, s.Delete(r.Context(), id, r.Actor)
	})
	for _, binding := range []struct{ id, action string }{{"submitArticle", "submit"}, {"approveArticle", "approve"}, {"setArticleStatus", "status"}} {
		a.Register(binding.id, func(r Request) (any, error) {
			id, e := pathID(r, "id")
			if e != nil {
				return nil, e
			}
			return s.Transition(r.Context(), id, r.Actor, binding.action, r.Input.String("status"))
		})
	}
	a.Register("listCategories", func(r Request) (any, error) { return t.List(r.Context()) })
	a.Register("getCategoryTree", func(r Request) (any, error) { return t.Tree(r.Context()) })
	a.Register("getCategoryStats", func(r Request) (any, error) { return t.Stats(r.Context()) })
	a.Register("getCategoryBreadcrumb", func(r Request) (any, error) {
		id, e := pathID(r, "id")
		if e != nil {
			return nil, e
		}
		return t.Breadcrumb(r.Context(), id)
	})
	a.Register("createCategory", func(r Request) (any, error) { return t.Save(r.Context(), 0, r.Input) })
	a.Register("updateCategory", func(r Request) (any, error) {
		id, e := pathID(r, "id")
		if e != nil {
			return nil, e
		}
		return t.Save(r.Context(), id, r.Input)
	})
	a.Register("deleteCategory", func(r Request) (any, error) {
		id, e := pathID(r, "id")
		if e != nil {
			return nil, e
		}
		return map[string]bool{"success": true}, t.Delete(r.Context(), id)
	})
	a.Register("listTags", func(r Request) (any, error) { return t.Tags(r.Context()) })
	a.Register("createTag", func(r Request) (any, error) { return t.SaveTag(r.Context(), 0, r.Input) })
	a.Register("updateTag", func(r Request) (any, error) {
		id, e := pathID(r, "id")
		if e != nil {
			return nil, e
		}
		return t.SaveTag(r.Context(), id, r.Input)
	})
	a.Register("deleteTag", func(r Request) (any, error) {
		id, e := pathID(r, "id")
		if e != nil {
			return nil, e
		}
		return map[string]bool{"success": true}, t.DeleteTag(r.Context(), id)
	})
}
