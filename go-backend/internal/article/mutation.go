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

// ValidSlug 检查 slug 格式和保留路径，避免与固定路由冲突。
func ValidSlug(slug string) bool {
	return slugPattern.MatchString(slug) && !strings.Contains(reserved, " "+slug+" ")
}
func categoryFields(tx *gorm.DB, id *int64) (*string, *string, error) {
	if id == nil {
		return nil, nil, nil
	}
	var c model.Category
	if err := tx.First(&c, *id).Error; err != nil {
		return nil, nil, err
	}
	return &c.Name, &c.Slug, nil
}
func syncTags(tx *gorm.DB, id int64, names []string, now int64) error {
	if err := tx.Where("article_id = ?", id).Delete(&model.ArticleTag{}).Error; err != nil {
		return err
	}
	if len(names) == 0 {
		return nil
	}
	var tags []model.Tag
	if err := tx.Where("name IN ? OR slug IN ?", names, names).Find(&tags).Error; err != nil {
		return err
	}
	for _, t := range tags {
		r := model.ArticleTag{
			ArticleID: id,
			TagID:     t.ID,
			CreatedAt: now,
		}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&r).Error; err != nil {
			return err
		}
	}
	return nil
}

// Create 创建文章并同步标签关系，普通会员请求发布时转为待审核。
func (s *Service) Create(ctx context.Context, actor values.Actor, in values.Fields) (map[string]any, error) {
	now := s.Now().UnixMilli()
	status := in.String("status")
	if status == "" {
		status = "draft"
	}
	// 会员只能投稿，不能通过创建请求跳过审核。
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
	txErr := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var u model.User
		if err := tx.First(&u, actor.ID).Error; err != nil {
			return err
		}
		catName, catSlug, err := categoryFields(tx, in.Number("categoryId"))
		if err != nil {
			return err
		}
		tagBytes, _ := json.Marshal(in.Strings("tags"))
		tagJSON := string(tagBytes)
		cover := in.Text("coverImage")
		if cover != nil && *cover == "" {
			cover = nil
		}
		a = model.Article{
			Title:        in.String("title"),
			Content:      in.String("content"),
			Summary:      in.Text("summary"),
			CoverImage:   cover,
			Slug:         slug,
			AuthorID:     actor.ID,
			AuthorName:   values.Text(values.Name(u.DisplayName, u.Username)),
			CategoryID:   in.Number("categoryId"),
			CategoryName: catName,
			CategorySlug: catSlug,
			Status:       status,
			Tags:         &tagJSON,
			CreatedAt:    now,
			UpdatedAt:    now,
		}
		if status == "published" {
			a.PublishedAt = &now
		}
		if err = tx.Create(&a).Error; err != nil {
			return err
		}
		return syncTags(tx, a.ID, in.Strings("tags"), now)
	})
	return Detail(a), txErr
}

// Update 将字段更新、标签关系和发布通知纳入同一事务。
func (s *Service) Update(ctx context.Context, id int64, actor values.Actor, in values.Fields) (map[string]any, error) {
	var article model.Article
	txErr := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return s.updateTx(tx, id, actor, in, &article)
	})
	return Detail(article), txErr
}

// updateTx 只使用调用者传入的事务，避免关系更新意外逃逸到主连接。
func (s *Service) updateTx(tx *gorm.DB, id int64, actor values.Actor, in values.Fields, a *model.Article) error {
	current, err := Get(database.Lock(tx), strconv.FormatInt(id, 10))
	if err != nil {
		return err
	}
	*a = current
	if !actor.Allows("editor", a.AuthorID) {
		return fault.New(fault.Forbidden)
	}
	previousStatus := a.Status
	patch, err := s.updatePatch(tx, *a, actor, in)
	if err != nil {
		return err
	}

	if in.Has("tags") {
		b, _ := json.Marshal(in.Strings("tags"))
		patch["tags"] = string(b)
		if err := syncTags(tx, id, in.Strings("tags"), s.Now().UnixMilli()); err != nil {
			return err
		}
	}
	if err := tx.Model(&model.Article{}).Where("id = ?", id).Updates(patch).Error; err != nil {
		return err
	}
	if err := tx.First(a, id).Error; err != nil {
		return err
	}
	if previousStatus != "published" && a.Status == "published" {
		return notification.Published(tx, *a, s.Now().UnixMilli())
	}
	return nil
}

// updatePatch 按字段存在性组装补丁，保留未提交、NULL 和零值的区别。
func (s *Service) updatePatch(tx *gorm.DB, a model.Article, actor values.Actor, in values.Fields) (map[string]any, error) {
	patch := map[string]any{"updated_at": s.Now().UnixMilli()}
	for key, col := range map[string]string{
		"title":      "title",
		"content":    "content",
		"summary":    "summary",
		"coverImage": "cover_image",
	} {
		if in.Has(key) {
			patch[col] = in[key]
		}
	}
	if patch["cover_image"] == "" {
		patch["cover_image"] = nil
	}
	// 分类名称和 slug 是响应投影，和外键必须一起更新。
	if in.Has("categoryId") {
		name, slug, err := categoryFields(tx, in.Number("categoryId"))
		if err != nil {
			return nil, err
		}
		patch["category_id"] = in.Number("categoryId")
		patch["category_name"] = name
		patch["category_slug"] = slug
	}
	if actor.Rank() >= 2 && in.Has("slug") {
		slug := in.Text("slug")
		if slug != nil && !ValidSlug(*slug) {
			return nil, fault.Field("slug", "slug非法或为预留路径")
		}
		patch["slug"] = slug
	}
	status := a.Status
	if in.Has("status") {
		status = in.String("status")
	}
	// 已发布文章被会员改写后重新审核，避免审核结果覆盖新正文。
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
	return patch, nil
}

// Delete 软删除文章、释放 slug 并清除标签关联，保留历史业务记录。
func (s *Service) Delete(ctx context.Context, id int64, actor values.Actor) error {
	return s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		a, err := Get(database.Lock(tx), strconv.FormatInt(id, 10))
		if err != nil {
			return err
		}
		if !actor.Allows("editor", a.AuthorID) {
			return fault.New(fault.Forbidden)
		}
		if err := tx.Where("article_id = ?", id).Delete(&model.ArticleTag{}).Error; err != nil {
			return err
		}
		return tx.Model(&model.Article{}).Where("id = ?", id).Updates(map[string]any{
			"deleted_at": s.Now().UnixMilli(),
			"updated_at": s.Now().UnixMilli(),
			"slug":       nil,
		}).Error
	})
}

// Transition 执行投稿、审核和后台置位，重复成功状态不重复产生通知。
func (s *Service) Transition(ctx context.Context, id int64, actor values.Actor, action, status string) (map[string]any, error) {
	var a model.Article
	txErr := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return s.transitionTx(tx, id, actor, action, status, &a)
	})
	return Detail(a), txErr
}

// transitionTx 锁定文章并执行前态检查，发布通知与状态同事务提交。
func (s *Service) transitionTx(tx *gorm.DB, id int64, actor values.Actor, action, status string, a *model.Article) error {
	current, err := Get(database.Lock(tx), strconv.FormatInt(id, 10))
	if err != nil {
		return err
	}
	*a = current
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
	// 幂等置位直接返回，避免重复发布通知。
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
	if err = tx.Model(&model.Article{}).Where("id = ?", id).Updates(map[string]any{
		"status":       status,
		"published_at": published,
		"updated_at":   now,
	}).Error; err != nil {
		return err
	}
	if err := tx.First(a, id).Error; err != nil {
		return err
	}
	if status == "published" {
		return notification.Published(tx, *a, now)
	}
	return nil
}
