package test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/article"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/comment"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/testutil"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"gorm.io/gorm"
)

func TestNotificationFailureRollsBackDomainState(t *testing.T) {
	db := testutil.DB(t)
	ctx := context.Background()
	u := model.User{Username: "event-" + time.Now().Format("150405.000000"), PasswordHash: "!", CredentialsConfigured: true, Role: "member", Status: "active", CreatedAt: 1, UpdatedAt: 1}
	if e := db.Create(&u).Error; e != nil {
		t.Fatal(e)
	}
	as := article.New(db)
	actor := values.Actor{ID: u.ID, Role: "admin"}
	a, e := as.Create(ctx, actor, values.Fields{"title": "通知事务", "content": "内容", "status": "pending"})
	if e != nil {
		t.Fatal(e)
	}
	aid := a["id"].(int64)
	fail := func() {
		if e := db.Callback().Create().Before("gorm:create").Register("test:fail_notification", func(tx *gorm.DB) {
			if tx.Statement.Table == "notifications" {
				tx.AddError(errors.New("injected notification write failure"))
			}
		}); e != nil {
			t.Fatal(e)
		}
	}
	restore := func() { _ = db.Callback().Create().Remove("test:fail_notification") }
	defer restore()
	fail()
	if _, e = as.Transition(ctx, aid, actor, "approve", ""); e == nil {
		t.Fatal("publication succeeded despite failed notification")
	}
	if _, e = as.Update(ctx, aid, actor, values.Fields{"status": "published"}); e == nil {
		t.Fatal("PUT publication succeeded despite failed notification")
	}
	var row model.Article
	db.First(&row, aid)
	if row.Status != "pending" || row.PublishedAt != nil {
		t.Fatal("publication was partially committed")
	}
	restore()
	if _, e = as.Transition(ctx, aid, actor, "approve", ""); e != nil {
		t.Fatal(e)
	}
	if _, e = as.Transition(ctx, aid, actor, "set", "published"); e != nil {
		t.Fatal(e)
	}
	var count int64
	db.Model(&model.Notification{}).Where("user_id = ? AND type = ?", u.ID, "article_published").Count(&count)
	if count != 1 {
		t.Fatal("publication notification count", count)
	}
	cs := comment.New(db)
	c, e := cs.Create(ctx, fmt.Sprint(aid), actor, values.Fields{"content": "广告"})
	if e != nil {
		t.Fatal(e)
	}
	cid := c.(map[string]any)["id"].(int64)
	fail()
	if _, e = cs.Review(ctx, cid, values.Fields{"status": "approved"}); e == nil {
		t.Fatal("review succeeded despite failed notification")
	}
	var cr model.Comment
	db.First(&cr, cid)
	if cr.Status != "rejected" {
		t.Fatal("review partially committed")
	}
	restore()
	for range 2 {
		if _, e = cs.Review(ctx, cid, values.Fields{"status": "approved"}); e != nil {
			t.Fatal(e)
		}
	}
	db.Model(&model.Notification{}).Where("user_id = ? AND type = ?", u.ID, "comment_approved").Count(&count)
	if count != 1 {
		t.Fatal("review notification count", count)
	}
}
