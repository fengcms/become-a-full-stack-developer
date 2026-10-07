package article

import (
	"context"
	"encoding/json"
	"regexp"
	"strconv"
	"strings"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/notification"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var slugPattern = regexp.MustCompile(`^[a-z0-9-]{1,64}$`)
var reserved = " me admin categories tags comments view submit adjacent related toc like unlike history favorites notifications search site upload users members tree "

func ValidSlug(slug string) bool {
	return slugPattern.MatchString(slug) && !strings.Contains(reserved, " "+slug+" ")
}
func categoryFields(tx *gorm.DB, id *int64) (*string, *string, error) {
	if id == nil {
		return nil, nil, nil
	}
	var c model.Category
	if e := tx.First(&c, *id).Error; e != nil {
		return nil, nil, e
	}
	return &c.Name, &c.Slug, nil
}
func syncTags(tx *gorm.DB, id int64, names []string, now int64) error {
	if e := tx.Where("article_id = ?", id).Delete(&model.ArticleTag{}).Error; e != nil {
		return e
	}
	if len(names) == 0 {
		return nil
	}
	var tags []model.Tag
	if e := tx.Where("name IN ? OR slug IN ?", names, names).Find(&tags).Error; e != nil {
		return e
	}
	for _, t := range tags {
		r := model.ArticleTag{ArticleID: id, TagID: t.ID, CreatedAt: now}
		if e := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&r).Error; e != nil {
			return e
		}
	}
	return nil
}
func (s *Service) Create(ctx context.Context, actor values.Actor, in values.Fields) (map[string]any, error) {
	now := s.Now().UnixMilli()
	status := in.String("status")
	if status == "" {
		status = "draft"
	}
	if actor.Rank() < 2 && status == "published" {
		status = "pending"
	}
	slug := in.Text("slug")
	if actor.Rank() < 2 {
		slug = nil
	}
	if slug != nil && (!ValidSlug(*slug)) {
		return nil, fault.Field("slug", "slug非法或为预留路径")
	}
	var a model.Article
	e := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var u model.User
		if e := tx.First(&u, actor.ID).Error; e != nil {
			return e
		}
		catName, catSlug, e := categoryFields(tx, in.Number("categoryId"))
		if e != nil {
			return e
		}
		tagBytes, _ := json.Marshal(in.Strings("tags"))
		tagJSON := string(tagBytes)
		cover := in.Text("coverImage")
		if cover != nil && *cover == "" {
			cover = nil
		}
		a = model.Article{Title: in.String("title"), Content: in.String("content"), Summary: in.Text("summary"), CoverImage: cover, Slug: slug, AuthorID: actor.ID, AuthorName: values.Text(values.Name(u.DisplayName, u.Username)), CategoryID: in.Number("categoryId"), CategoryName: catName, CategorySlug: catSlug, Status: status, Tags: &tagJSON, CreatedAt: now, UpdatedAt: now}
		if status == "published" {
			a.PublishedAt = &now
		}
		if e = tx.Create(&a).Error; e != nil {
			return e
		}
		return syncTags(tx, a.ID, in.Strings("tags"), now)
	})
	return Detail(a), e
}
func (s *Service) Update(ctx context.Context, id int64, actor values.Actor, in values.Fields) (map[string]any, error) {
	var a model.Article
	e := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var e error
		a, e = Get(database.Lock(tx), strconv.FormatInt(id, 10))
		if e != nil {
			return e
		}
		if !actor.Allows("editor", a.AuthorID) {
			return fault.New(fault.Forbidden)
		}
		previousStatus := a.Status
		patch := map[string]any{"updated_at": s.Now().UnixMilli()}
		for key, col := range map[string]string{"title": "title", "content": "content", "summary": "summary", "coverImage": "cover_image"} {
			if in.Has(key) {
				patch[col] = in[key]
			}
		}
		if patch["cover_image"] == "" {
			patch["cover_image"] = nil
		}
		if in.Has("categoryId") {
			name, slug, e := categoryFields(tx, in.Number("categoryId"))
			if e != nil {
				return e
			}
			patch["category_id"] = in.Number("categoryId")
			patch["category_name"] = name
			patch["category_slug"] = slug
		}
		if actor.Rank() >= 2 && in.Has("slug") {
			slug := in.Text("slug")
			if slug != nil && !ValidSlug(*slug) {
				return fault.Field("slug", "slug非法或为预留路径")
			}
			patch["slug"] = slug
		}
		status := a.Status
		if in.Has("status") {
			status = in.String("status")
		}
		if actor.Rank() < 2 && (status == "published" || a.Status == "published") {
			status = "pending"
		}
		patch["status"] = status
		var published *int64
		if status == "published" {
			published = a.PublishedAt
			if published == nil {
				n := s.Now().UnixMilli()
				published = &n
			}
		}
		patch["published_at"] = published
		if in.Has("tags") {
			b, _ := json.Marshal(in.Strings("tags"))
			patch["tags"] = string(b)
			if e := syncTags(tx, id, in.Strings("tags"), s.Now().UnixMilli()); e != nil {
				return e
			}
		}
		if e := tx.Model(&model.Article{}).Where("id = ?", id).Updates(patch).Error; e != nil {
			return e
		}
		if e := tx.First(&a, id).Error; e != nil {
			return e
		}
		if previousStatus != "published" && a.Status == "published" {
			return notification.Published(tx, a, s.Now().UnixMilli())
		}
		return nil
	})
	return Detail(a), e
}
func (s *Service) Delete(ctx context.Context, id int64, actor values.Actor) error {
	return s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		a, e := Get(database.Lock(tx), strconv.FormatInt(id, 10))
		if e != nil {
			return e
		}
		if !actor.Allows("editor", a.AuthorID) {
			return fault.New(fault.Forbidden)
		}
		if e := tx.Where("article_id = ?", id).Delete(&model.ArticleTag{}).Error; e != nil {
			return e
		}
		return tx.Model(&model.Article{}).Where("id = ?", id).Updates(map[string]any{"deleted_at": s.Now().UnixMilli(), "updated_at": s.Now().UnixMilli(), "slug": nil}).Error
	})
}
func (s *Service) Transition(ctx context.Context, id int64, actor values.Actor, action, status string) (map[string]any, error) {
	var a model.Article
	e := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var e error
		a, e = Get(database.Lock(tx), strconv.FormatInt(id, 10))
		if e != nil {
			return e
		}
		if action == "submit" {
			if !actor.Allows("admin", a.AuthorID) {
				return fault.New(fault.Forbidden)
			}
			if a.Status != "draft" {
				return fault.New(fault.State)
			}
			status = "pending"
		}
		if action == "approve" {
			if a.Status != "pending" {
				return fault.New(fault.State)
			}
			status = "published"
		}
		if status == a.Status {
			return nil
		}
		now := s.Now().UnixMilli()
		var published *int64
		if status == "published" {
			published = a.PublishedAt
			if published == nil {
				published = &now
			}
		}
		if e = tx.Model(&model.Article{}).Where("id = ?", id).Updates(map[string]any{"status": status, "published_at": published, "updated_at": now}).Error; e != nil {
			return e
		}
		if e := tx.First(&a, id).Error; e != nil {
			return e
		}
		if status == "published" {
			return notification.Published(tx, a, now)
		}
		return nil
	})
	return Detail(a), e
}
