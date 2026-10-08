package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/article"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/auth"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/config"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"gorm.io/gorm"
)

func main() {
	articles := flag.Int("articles", 1, "number of development fixture articles (1..5000)")
	flag.Parse()
	if *articles < 1 || *articles > 5000 {
		log.Fatal("-articles must be 1..5000")
	}
	c, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	name, password := os.Getenv("SEED_USERNAME"), os.Getenv("SEED_PASSWORD")
	if len(name) < 3 || len(password) < 8 {
		log.Fatal("SEED_USERNAME (at least 3 characters) and SEED_PASSWORD (at least 8 characters) required")
	}
	db, err := database.Open(c.Driver, c.DSN)
	if err != nil {
		log.Fatal("database unavailable")
	}
	raw, _ := db.DB()
	defer raw.Close()
	hash, err := auth.Hash(password)
	if err != nil {
		log.Fatal(err)
	}
	now := time.Now().UnixMilli()
	user := model.User{
		Username:              name,
		PasswordHash:          hash,
		CredentialsConfigured: true,
		Role:                  "admin",
		Status:                "active",
		Level:                 1,
		CreatedAt:             now,
		UpdatedAt:             now,
	}
	err = db.Transaction(func(tx *gorm.DB) error {
		return seedTx(tx, &user, *articles)
	})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("created development administrator %s (id=%d) and %d fixture article(s)\n", name, user.ID, *articles)
}

// seedTx 在一个事务里创建账号和演示文章，失败时不留下半套数据。
func seedTx(tx *gorm.DB, user *model.User, total int) error {
	now := user.CreatedAt

	var count int64
	if err := tx.Model(&model.User{}).Where("username = ?", user.Username).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return fmt.Errorf("seed account already exists; refusing changes")
	}
	if err := tx.Create(user).Error; err != nil {
		return err
	}
	_, err := article.New(tx).Create(context.Background(), values.Actor{ID: user.ID, Role: "admin"}, values.Fields{
		"title":   "欢迎使用 Go 后端",
		"content": "# M6 Go 后端\n\n这是一篇本地演示文章。\n\n## 技术栈\n\n```go\nfmt.Println(\"Hello, full stack!\")\n```",
		"summary": "同一套契约，独立的 Go + GORM 实现。",
		"slug":    "go-backend-welcome",
		"status":  "published",
	})
	if err != nil {
		return err
	}
	rows := make([]model.Article, 0, total-1)
	for i := 2; i <= total; i++ {
		slug := fmt.Sprintf("go-bench-%d", i)
		rows = append(rows, model.Article{
			Title:       fmt.Sprintf("Go 工程样例 %d", i),
			Slug:        &slug,
			Summary:     values.Text("同一套契约，独立的 Go + GORM 实现。"),
			Content:     "# Go 工程\n\n## 技术栈\n\n```go\nfmt.Println(\"Hello, full stack!\")\n```",
			AuthorID:    user.ID,
			AuthorName:  &user.Username,
			Status:      "published",
			PublishedAt: &now,
			CreatedAt:   now,
			UpdatedAt:   now,
		})
	}
	if len(rows) > 0 {
		return tx.CreateInBatches(rows, 100).Error
	}
	return nil
}
