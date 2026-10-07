// Package notification writes explicit domain events using the caller's transaction.
package notification

import (
	"fmt"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"gorm.io/gorm"
)

func Published(tx *gorm.DB, a model.Article, now int64) error {
	n := model.Notification{UserID: a.AuthorID, Type: "article_published", Title: "文章已发布", Body: values.Text(a.Title), Link: values.Text(fmt.Sprintf("/articles/%d", a.ID)), CreatedAt: now}
	return tx.Create(&n).Error
}
func Approved(tx *gorm.DB, c model.Comment, now int64) error {
	n := model.Notification{UserID: c.UserID, Type: "comment_approved", Title: "评论审核通过", Link: values.Text(fmt.Sprintf("/articles/%d", c.ArticleID)), CreatedAt: now}
	return tx.Create(&n).Error
}
