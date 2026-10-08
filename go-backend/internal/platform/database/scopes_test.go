package database_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/testutil"
)

func TestActiveArticlesInDirectAndJoinedQueries(t *testing.T) {
	db := testutil.DB(t)
	user := model.User{Username: fmt.Sprintf("scope-%d", time.Now().UnixNano()), PasswordHash: "!", CredentialsConfigured: true, Role: "member", Status: "active", CreatedAt: 1, UpdatedAt: 1}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	deletedAt := int64(2)
	rows := []model.Article{
		{Title: "visible", AuthorName: &user.Username, PublishedAt: &deletedAt, Content: "body", AuthorID: user.ID, Status: "published", CreatedAt: 1, UpdatedAt: 1},
		{Title: "deleted", AuthorName: &user.Username, PublishedAt: &deletedAt, Content: "body", AuthorID: user.ID, Status: "published", DeletedAt: &deletedAt, CreatedAt: 1, UpdatedAt: 1},
	}
	if err := db.Create(&rows).Error; err != nil {
		t.Fatal(err)
	}
	for _, article := range rows {
		if err := db.Create(&model.Favorite{UserID: user.ID, ArticleID: article.ID, CreatedAt: 1}).Error; err != nil {
			t.Fatal(err)
		}
	}
	ids := []int64{rows[0].ID, rows[1].ID}
	t.Cleanup(func() {
		db.Where("user_id = ?", user.ID).Delete(&model.Favorite{})
		db.Where("id IN ?", ids).Delete(&model.Article{})
		db.Delete(&model.User{}, user.ID)
	})
	var direct []model.Article
	if err := db.Scopes(database.ActiveArticles).Where("articles.id IN ?", ids).Find(&direct).Error; err != nil {
		t.Fatal(err)
	}
	if len(direct) != 1 || direct[0].ID != rows[0].ID {
		t.Fatalf("direct: %+v", direct)
	}
	var joined []model.Article
	if err := db.Model(&model.Article{}).Joins("JOIN favorites ON favorites.article_id=articles.id").Scopes(database.ActiveArticles).Where("favorites.user_id = ?", user.ID).Find(&joined).Error; err != nil {
		t.Fatal(err)
	}
	if len(joined) != 1 || joined[0].ID != rows[0].ID {
		t.Fatalf("joined: %+v", joined)
	}
	var count int64
	if err := db.Model(&model.Article{}).Where("id IN ?", ids).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatal("scope changed persisted rows", count)
	}
}
