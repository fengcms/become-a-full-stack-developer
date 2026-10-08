// Package comment 管理评论审核和回复关系。
package comment

import (
	"context"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/article"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/notification"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"gorm.io/gorm"
)

// Service 处理评论可见性、敏感词状态、父子关系和审核事务。
type Service struct {
	RejectRatio float64
	DB          *gorm.DB
	Now         func() time.Time
}

// New 创建评论服务，默认采用冻结的 10% 敏感词拒绝阈值。
func New(db *gorm.DB) *Service {
	return &Service{
		DB:          db,
		Now:         time.Now,
		RejectRatio: 0.1,
	}
}

// Moderate 以默认阈值判断敏感词，长度按 JavaScript UTF-16 规则计算。
func Moderate(raw string) (string, string) { return moderate(raw, 0.1) }
func moderate(raw string, threshold float64) (string, string) {
	content := raw
	hits := 0
	for _, word := range []string{
		"广告",
		"spam",
		"fuck",
		"shit",
		"垃圾",
		"代开发票",
	} {
		re := regexp.MustCompile("(?i)" + regexp.QuoteMeta(word))
		for _, m := range re.FindAllString(raw, -1) {
			hits += len(utf16.Encode([]rune(m)))
		}
		content = re.ReplaceAllStringFunc(content, func(m string) string {
			return strings.Repeat("*", len(utf16.Encode([]rune(m))))
		})
	}
	status := "approved"
	length := len(utf16.Encode([]rune(raw)))
	if length > 0 && float64(hits)/float64(length) > threshold {
		status = "rejected"
	}
	return content, status
}

// View 转换评论字段，展示文本有界但数据库保留完整输入。
func View(c model.Comment) map[string]any {
	return map[string]any{
		"id":             c.ID,
		"articleId":      c.ArticleID,
		"userId":         c.UserID,
		"userName":       c.UserName,
		"parentId":       c.ParentID,
		"content":        display(c.Content, 2000),
		"status":         c.Status,
		"rejectedReason": reasonView(c.RejectedReason),
		"createdAt":      values.ISO(c.CreatedAt),
	}
}

// Create 只允许对公开文章评论，并校验回复属于同一篇文章。
func (s *Service) Create(ctx context.Context, key string, actor values.Actor, in values.Fields) (any, error) {
	db := s.DB.WithContext(ctx)
	a, err := article.Get(db, key)
	if err != nil {
		return nil, err
	}
	if a.Status != "published" {
		return nil, fault.New(fault.NotFound)
	}
	parent := in.Number("parentId")
	if parent != nil {
		var p model.Comment
		if err = db.Where("id = ? AND article_id = ?", *parent, a.ID).First(&p).Error; err != nil {
			return nil, err
		}
	}
	var u model.User
	if err = db.First(&u, actor.ID).Error; err != nil {
		return nil, err
	}
	content, status := moderate(in.String("content"), s.RejectRatio)
	c := model.Comment{
		ArticleID: a.ID,
		UserID:    u.ID,
		UserName:  values.Name(u.DisplayName, u.Username),
		ParentID:  parent,
		Content:   content,
		Status:    status,
		CreatedAt: s.Now().UnixMilli(),
	}
	err = db.Create(&c).Error
	return View(c), err
}

// Page 按公开或后台范围读取平面评论，parentId 留给客户端组装楼层。
func (s *Service) Page(ctx context.Context, key string, actor values.Actor, q url.Values, admin bool) (any, error) {
	p := values.Paging(q)
	db := s.DB.WithContext(ctx).Model(&model.Comment{})
	order := "created_at ASC, id ASC"
	if !admin {
		a, err := article.Get(s.DB.WithContext(ctx), key)
		if err != nil {
			return nil, err
		}
		if a.Status != "published" && actor.ID != a.AuthorID && actor.Role != "admin" {
			return nil, fault.New(fault.NotFound)
		}
		db = db.Where("article_id = ? AND status = ?", a.ID, "approved")
	} else {
		order = "created_at DESC, id ASC"
		if status := q.Get("status"); status != "" {
			db = db.Where("status = ?", status)
		}
		if id := q.Get("articleId"); id != "" {
			db = db.Where("article_id = ?", id)
		}
	}
	var total int64
	if err := db.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return nil, err
	}
	var rows []model.Comment
	if err := db.Order(order).Limit(p.Size).Offset(p.Offset()).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := []map[string]any{}
	for _, c := range rows {
		out = append(out, View(c))
	}
	return p.Result(out, total), nil
}

// Delete 检查删除权限并从叶子向上删除整支回复，避免外键冲突。
func (s *Service) Delete(ctx context.Context, id int64, actor values.Actor) error {
	return s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return deleteBranchTx(tx, id, actor)
	})
}

// Review 更新审核状态；首次转为 approved 时在同一事务写通知。
func (s *Service) Review(ctx context.Context, id int64, in values.Fields) (any, error) {
	var c model.Comment
	txErr := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := database.Lock(tx).First(&c, id).Error; err != nil {
			return err
		}
		previous := c.Status
		c.Status = in.String("status")
		if c.Status == "approved" {
			c.RejectedReason = nil
		} else if in.Has("reason") {
			c.RejectedReason = in.Text("reason")
		}
		if err := tx.Model(&c).
			Updates(map[string]any{
				"status":          c.Status,
				"rejected_reason": c.RejectedReason,
			}).Error; err != nil {
			return err
		}
		if previous != "approved" && c.Status == "approved" {
			return notification.Approved(tx, c, s.Now().UnixMilli())
		}
		return nil
	})
	return View(c), txErr
}

func display(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n-1]) + "…"
	}
	return s
}
func reasonView(s *string) *string {
	if s == nil {
		return nil
	}
	v := display(*s, 200)
	return &v
}

// deleteBranchTx 收集整支回复，再从叶子删除，尊重评论的自引用外键。
func deleteBranchTx(tx *gorm.DB, id int64, actor values.Actor) error {
	var c model.Comment
	if err := database.Lock(tx).First(&c, id).Error; err != nil {
		return err
	}
	if !actor.Allows("editor", c.UserID) {
		return fault.New(fault.Forbidden)
	}
	var rows []model.Comment
	if err := tx.Where("article_id = ?", c.ArticleID).Find(&rows).Error; err != nil {
		return err
	}
	ids := map[int64]bool{id: true}
	for changed := true; changed; {
		changed = false
		for _, r := range rows {
			if r.ParentID != nil && ids[*r.ParentID] && !ids[r.ID] {
				ids[r.ID] = true
				changed = true
			}
		}
	}
	// 子评论先删除，再删除父评论；不能靠关闭外键换取成功。
	for len(ids) > 0 {
		progress := false
		for child := range ids {
			hasChild := false
			for _, r := range rows {
				if r.ParentID != nil && *r.ParentID == child && ids[r.ID] {
					hasChild = true
					break
				}
			}
			if !hasChild {
				if err := tx.Delete(&model.Comment{}, child).Error; err != nil {
					return err
				}
				delete(ids, child)
				progress = true
			}
		}
		if !progress {
			return fault.New(fault.Conflict)
		}
	}
	return nil
}
