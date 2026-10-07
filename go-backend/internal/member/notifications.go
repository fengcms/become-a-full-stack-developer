package member

import (
	"context"
	"net/url"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"gorm.io/gorm"
)

func Notification(n model.Notification) map[string]any {
	return map[string]any{"id": n.ID, "userId": n.UserID, "type": n.Type, "title": n.Title, "body": n.Body, "link": n.Link, "isRead": n.IsRead, "createdAt": values.ISO(n.CreatedAt)}
}
func (s *Service) Notifications(ctx context.Context, user int64, q url.Values) (any, error) {
	p := values.PagingWith(q, 10, 50)
	db := s.DB.WithContext(ctx).Model(&model.Notification{}).Where("user_id = ?", user)
	if v := q.Get("isRead"); v == "true" || v == "false" {
		db = db.Where("is_read = ?", v == "true")
	}
	var n int64
	if e := db.Session(&gorm.Session{}).Count(&n).Error; e != nil {
		return nil, e
	}
	var rows []model.Notification
	if e := db.Order("created_at DESC, id DESC").Limit(p.Size).Offset(p.Offset()).Find(&rows).Error; e != nil {
		return nil, e
	}
	out := []map[string]any{}
	for _, r := range rows {
		out = append(out, Notification(r))
	}
	return p.Result(out, n), nil
}
func (s *Service) Unread(ctx context.Context, user int64) (any, error) {
	var n int64
	e := s.DB.WithContext(ctx).Model(&model.Notification{}).Where("user_id = ? AND is_read = ?", user, false).Count(&n).Error
	return map[string]any{"count": n}, e
}
func (s *Service) ReadAll(ctx context.Context, user int64) error {
	return s.DB.WithContext(ctx).Model(&model.Notification{}).Where("user_id = ?", user).Update("is_read", true).Error
}
func (s *Service) Read(ctx context.Context, user, id int64, value bool) (any, error) {
	db := s.DB.WithContext(ctx)
	var n model.Notification
	if e := db.Where("id = ? AND user_id = ?", id, user).First(&n).Error; e != nil {
		return nil, e
	}
	e := db.Model(&n).Update("is_read", value).Error
	n.IsRead = value
	return Notification(n), e
}
