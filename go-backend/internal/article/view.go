package article

import (
	"encoding/json"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
)

// SummaryColumns 集中保留列表列白名单，按行排版便于对照摘要字段。
const SummaryColumns = `
articles.id,
articles.title,
articles.slug,
articles.summary,
articles.cover_image,
articles.author_id,
articles.author_name,
articles.category_id,
articles.category_name,
articles.tags,
articles.status,
articles.view_count,
articles.like_count,
articles.published_at,
articles.created_at,
articles.updated_at`

// Tags 解码内部标签数组投影，并将 nil 结果规范为空数组。
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

// Summary 将数据库文章行转换为契约摘要，不包含正文和内部软删除字段。
func Summary(a model.Article) map[string]any {
	return map[string]any{
		"id":           a.ID,
		"title":        a.Title,
		"slug":         a.Slug,
		"summary":      a.Summary,
		"coverImage":   a.CoverImage,
		"authorId":     a.AuthorID,
		"authorName":   a.AuthorName,
		"categoryId":   a.CategoryID,
		"categoryName": a.CategoryName,
		"tags":         Tags(a.Tags),
		"status":       a.Status,
		"viewCount":    a.ViewCount,
		"likeCount":    a.LikeCount,
		"publishedAt":  values.Date(a.PublishedAt),
		"createdAt":    values.ISO(a.CreatedAt),
		"updatedAt":    values.ISO(a.UpdatedAt),
	}
}

// Detail 在摘要上加入正文，供详情和写入结果使用。
func Detail(a model.Article) map[string]any { r := Summary(a); r["content"] = a.Content; return r }

// List 转换文章行列表，空结果也保持 JSON 数组语义。
func List(rows []model.Article) []map[string]any {
	r := []map[string]any{}
	for _, a := range rows {
		r = append(r, Summary(a))
	}
	return r
}
