// Package comment owns moderation and reply relationships.
package comment

import (
	"context"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/article"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/notification"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"gorm.io/gorm"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf16"
)

type Service struct {
	RejectRatio float64
	DB          *gorm.DB
	Now         func() time.Time
}

func New(db *gorm.DB) *Service             { return &Service{DB: db, Now: time.Now, RejectRatio: 0.1} }
func Moderate(raw string) (string, string) { return moderate(raw, 0.1) }
func moderate(raw string, threshold float64) (string, string) {
	content := raw
	hits := 0
	for _, word := range []string{"广告", "spam", "fuck", "shit", "垃圾", "代开发票"} {
		re := regexp.MustCompile("(?i)" + regexp.QuoteMeta(word))
		for _, m := range re.FindAllString(raw, -1) {
			hits += len(utf16.Encode([]rune(m)))
		}
		content = re.ReplaceAllStringFunc(content, func(m string) string { return strings.Repeat("*", len(utf16.Encode([]rune(m)))) })
	}
	status := "approved"
	length := len(utf16.Encode([]rune(raw)))
	if length > 0 && float64(hits)/float64(length) > threshold {
		status = "rejected"
	}
	return content, status
}
func View(c model.Comment) map[string]any {
	return map[string]any{"id": c.ID, "articleId": c.ArticleID, "userId": c.UserID, "userName": c.UserName, "parentId": c.ParentID, "content": display(c.Content, 2000), "status": c.Status, "rejectedReason": reasonView(c.RejectedReason), "createdAt": values.ISO(c.CreatedAt)}
}
func (s *Service) Create(ctx context.Context, key string, actor values.Actor, in values.Fields) (any, error) {
	db := s.DB.WithContext(ctx)
	a, e := article.Get(db, key)
	if e != nil {
		return nil, e
	}
	if a.Status != "published" {
		return nil, fault.New(fault.NotFound)
	}
	parent := in.Number("parentId")
	if parent != nil {
		var p model.Comment
		if e = db.Where("id = ? AND article_id = ?", *parent, a.ID).First(&p).Error; e != nil {
			return nil, e
		}
	}
	var u model.User
	if e = db.First(&u, actor.ID).Error; e != nil {
		return nil, e
	}
	content, status := moderate(in.String("content"), s.RejectRatio)
	c := model.Comment{ArticleID: a.ID, UserID: u.ID, UserName: values.Name(u.DisplayName, u.Username), ParentID: parent, Content: content, Status: status, CreatedAt: s.Now().UnixMilli()}
	e = db.Create(&c).Error
	return View(c), e
}
func (s *Service) Page(ctx context.Context, key string, actor values.Actor, q url.Values, admin bool) (any, error) {
	p := values.Paging(q)
	db := s.DB.WithContext(ctx).Model(&model.Comment{})
	order := "created_at ASC, id ASC"
	if !admin {
		a, e := article.Get(s.DB.WithContext(ctx), key)
		if e != nil {
			return nil, e
		}
		if a.Status != "published" && actor.ID != a.AuthorID && actor.Role != "admin" {
			return nil, fault.New(fault.NotFound)
		}
		db = db.Where("article_id = ? AND status = ?", a.ID, "approved")
	} else {
		order = "created_at DESC, id DESC"
		if status := q.Get("status"); status != "" {
			db = db.Where("status = ?", status)
		}
		if id := q.Get("articleId"); id != "" {
			db = db.Where("article_id = ?", id)
		}
	}
	var total int64
	if e := db.Session(&gorm.Session{}).Count(&total).Error; e != nil {
		return nil, e
	}
	var rows []model.Comment
	if e := db.Order(order).Limit(p.Size).Offset(p.Offset()).Find(&rows).Error; e != nil {
		return nil, e
	}
	out := []map[string]any{}
	for _, c := range rows {
		out = append(out, View(c))
	}
	return p.Result(out, total), nil
}
func (s *Service) Delete(ctx context.Context, id int64, actor values.Actor) error {
	return s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var c model.Comment
		if e := database.Lock(tx).First(&c, id).Error; e != nil {
			return e
		}
		if !actor.Allows("editor", c.UserID) {
			return fault.New(fault.Forbidden)
		}
		var rows []model.Comment
		if e := tx.Where("article_id = ?", c.ArticleID).Find(&rows).Error; e != nil {
			return e
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
		} // Delete leaves first to respect the self foreign key.
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
					if e := tx.Delete(&model.Comment{}, child).Error; e != nil {
						return e
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
	})
}
func (s *Service) Review(ctx context.Context, id int64, in values.Fields) (any, error) {
	var c model.Comment
	e := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if e := database.Lock(tx).First(&c, id).Error; e != nil {
			return e
		}
		previous := c.Status
		c.Status = in.String("status")
		if c.Status == "approved" {
			c.RejectedReason = nil
		} else if in.Has("reason") {
			c.RejectedReason = in.Text("reason")
		}
		if e := tx.Model(&c).Updates(map[string]any{"status": c.Status, "rejected_reason": c.RejectedReason}).Error; e != nil {
			return e
		}
		if previous != "approved" && c.Status == "approved" {
			return notification.Approved(tx, c, s.Now().UnixMilli())
		}
		return nil
	})
	return View(c), e
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
