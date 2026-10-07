package article

import (
	"encoding/json"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
)

const SummaryColumns = "articles.id, articles.title, articles.slug, articles.summary, articles.cover_image, articles.author_id, articles.author_name, articles.category_id, articles.category_name, articles.tags, articles.status, articles.view_count, articles.like_count, articles.published_at, articles.created_at, articles.updated_at"

func Tags(raw *string) []string {
	list := []string{}
	if raw != nil {
		_ = json.Unmarshal([]byte(*raw), &list)
	}
	if list == nil {
		list = []string{}
	}
	return list
}
func Summary(a model.Article) map[string]any {
	return map[string]any{"id": a.ID, "title": a.Title, "slug": a.Slug, "summary": a.Summary, "coverImage": a.CoverImage, "authorId": a.AuthorID, "authorName": a.AuthorName, "categoryId": a.CategoryID, "categoryName": a.CategoryName, "tags": Tags(a.Tags), "status": a.Status, "viewCount": a.ViewCount, "likeCount": a.LikeCount, "publishedAt": values.Date(a.PublishedAt), "createdAt": values.ISO(a.CreatedAt), "updatedAt": values.ISO(a.UpdatedAt)}
}
func Detail(a model.Article) map[string]any { r := Summary(a); r["content"] = a.Content; return r }
func List(rows []model.Article) []map[string]any {
	r := []map[string]any{}
	for _, a := range rows {
		r = append(r, Summary(a))
	}
	return r
}
