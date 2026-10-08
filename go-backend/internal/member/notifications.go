package member

import (
	"context"
	"net/url"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"gorm.io/gorm"
)

// Notification 转换通知行，保留已读布尔和可空内容字段。
func Notification(n model.Notification) map[string]any {
	return map[string]any{
		"id":        n.ID,
		"userId":    n.UserID,
		"type":      n.Type,
		"title":     n.Title,
		"body":      n.Body,
		"link":      n.Link,
		"isRead":    n.IsRead,
		"createdAt": values.ISO(n.CreatedAt),
	}
}

// Notifications 分页读取本人通知，支持已读筛选。
func (s *Service) Notifications(ctx context.Context, user int64, q url.Values) (any, error) {
	p := values.PagingWith(q, 10, 50)
	db := s.DB.WithContext(ctx).Model(&model.Notification{}).Where("user_id = ?", user)
	if v := q.Get("isRead"); v == "true" || v == "false" {
		db = db.Where("is_read = ?", v == "true")
	}
	var n int64
	if err := db.Session(&gorm.Session{}).Count(&n).Error; err != nil {
		return nil, err
	}
	var rows []model.Notification
	if err := db.Order("created_at DESC, id DESC").Limit(p.Size).Offset(p.Offset()).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := []map[string]any{}
	for _, r := range rows {
		out = append(out, Notification(r))
	}
	return p.Result(out, n), nil
}

// Unread 统计本人未读通知，账号隔离条件始终参与查询。
func (s *Service) Unread(ctx context.Context, user int64) (any, error) {
	var n int64
	err := s.DB.WithContext(ctx).
		Model(&model.Notification{}).
		Where("user_id = ? AND is_read = ?", user, false).
		Count(&n).Error
	return map[string]any{"count": n}, err
}

// ReadAll 把本人未读通知批量标为已读。
func (s *Service) ReadAll(ctx context.Context, user int64) error {
	return s.DB.WithContext(ctx).Model(&model.Notification{}).Where("user_id = ?", user).Update("is_read", true).Error
}

// Read 只修改本人通知的已读状态，其他人的 ID 返回不存在。
func (s *Service) Read(ctx context.Context, user, id int64, value bool) (any, error) {
	db := s.DB.WithContext(ctx)
	var n model.Notification
	if err := db.Where("id = ? AND user_id = ?", id, user).First(&n).Error; err != nil {
		return nil, err
	}
	err := db.Model(&n).Update("is_read", value).Error
	n.IsRead = value
	return Notification(n), err
}
