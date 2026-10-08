// Package member owns self-scoped interactions, reading and notifications.
package member

import (
	"context"
	"net/url"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/article"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Service 负责会员私有互动、历史和通知，不承担后台权限管理。
type Service struct {
	DB  *gorm.DB
	Now func() time.Time
}

// New 创建会员服务并注入默认时钟。
func New(db *gorm.DB) *Service { return &Service{DB: db, Now: time.Now} }

// Like 锁定文章后增删关系，以实际关系数维护点赞计数。
func (s *Service) Like(ctx context.Context, user, id int64, add bool) (any, error) {
	var a model.Article
	txErr := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var err error
		a, err = article.Published(database.Lock(tx), id)
		if err != nil {
			return err
		}
		if add {
			row := model.Like{
				UserID:    user,
				ArticleID: id,
				CreatedAt: s.Now().UnixMilli(),
			}
			r := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&row)
			if r.Error != nil {
				return r.Error
			}
			// MySQL 冲突更新的影响行数不代表新增点赞，计数以实际关系行为准。
			var count int64
			if err = tx.Model(&model.Like{}).Where("article_id = ?", id).Count(&count).Error; err != nil {
				return err
			}
			if err = tx.Model(&model.Article{}).
				Scopes(database.ActiveArticles).
				Where("id = ?", id).
				UpdateColumn("like_count", count).Error; err != nil {
				return err
			}
		} else {
			if err = tx.Where("user_id = ? AND article_id = ?", user, id).Delete(&model.Like{}).Error; err != nil {
				return err
			}
			var count int64
			if err = tx.Model(&model.Like{}).Where("article_id = ?", id).Count(&count).Error; err != nil {
				return err
			}
			if err = tx.Model(&model.Article{}).
				Scopes(database.ActiveArticles).
				Where("id = ?", id).
				UpdateColumn("like_count", count).Error; err != nil {
				return err
			}
		}
		return tx.First(&a, id).Error
	})
	return map[string]any{"liked": add, "likeCount": a.LikeCount}, txErr
}

// LikeStatus 返回公开文章点赞状态；匿名访问者的 liked 固定为 false。
func (s *Service) LikeStatus(ctx context.Context, user, id int64) (any, error) {
	db := s.DB.WithContext(ctx)
	a, err := article.Published(db, id)
	if err != nil {
		return nil, err
	}
	var n int64
	if user > 0 {
		if err = db.Model(&model.Like{}).Where("user_id = ? AND article_id = ?", user, id).Count(&n).Error; err != nil {
			return nil, err
		}
	}
	return map[string]any{"liked": n > 0, "likeCount": a.LikeCount}, nil
}

// Favorite 幂等增删收藏；新增只能引用公开文章。
func (s *Service) Favorite(ctx context.Context, user, id int64, add bool) error {
	db := s.DB.WithContext(ctx)
	if !add {
		return db.Where("user_id = ? AND article_id = ?", user, id).Delete(&model.Favorite{}).Error
	}
	if _, err := article.Published(db, id); err != nil {
		return err
	}
	f := model.Favorite{
		UserID:    user,
		ArticleID: id,
		CreatedAt: s.Now().UnixMilli(),
	}
	return db.Clauses(clause.OnConflict{DoNothing: true}).Create(&f).Error
}

// Articles 查询收藏或点赞文章，按对应契约选择分页和响应形状。
func (s *Service) Articles(ctx context.Context, user int64, q url.Values, likes bool) (any, error) {
	table := "favorites"
	if likes {
		table = "likes"
	}
	p := values.Paging(q)
	if likes {
		p = values.PagingWith(q, 10, 50)
	}
	db := s.DB.WithContext(ctx).
		Model(&model.Article{}).
		Joins("JOIN "+table+" ON "+table+".article_id=articles.id").
		Scopes(database.ActiveArticles).
		Where(table+".user_id = ?", user)
	if likes {
		db = db.Where("articles.status = ?", "published")
	}
	var count int64
	if err := db.Session(&gorm.Session{}).Count(&count).Error; err != nil {
		return nil, err
	}
	var rows []model.Article
	if err := db.Select(article.SummaryColumns).
		Order(table + ".created_at DESC, " + table + ".id DESC").
		Limit(p.Size).
		Offset(p.Offset()).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	list := article.List(rows)
	if likes {
		return list, nil
	}
	return p.Result(list, count), nil
}
