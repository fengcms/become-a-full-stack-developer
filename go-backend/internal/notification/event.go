// Package notification 使用调用者的事务写入明确的领域通知。
package notification

import (
	"fmt"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"gorm.io/gorm"
)

// Published 在调用者事务内创建文章发布通知，失败应使状态更新一起回滚。
func Published(tx *gorm.DB, a model.Article, now int64) error {
	n := model.Notification{
		UserID:    a.AuthorID,
		Type:      "article_published",
		Title:     "文章已发布",
		Body:      values.Text(a.Title),
		Link:      values.Text(fmt.Sprintf("/articles/%d", a.ID)),
		CreatedAt: now,
	}
	return tx.Create(&n).Error
}

// Approved 在调用者事务内创建评论审核通知，不自行开始新事务。
func Approved(tx *gorm.DB, c model.Comment, now int64) error {
	n := model.Notification{
		UserID:    c.UserID,
		Type:      "comment_approved",
		Title:     "评论审核通过",
		Link:      values.Text(fmt.Sprintf("/articles/%d", c.ArticleID)),
		CreatedAt: now,
	}
	return tx.Create(&n).Error
}
