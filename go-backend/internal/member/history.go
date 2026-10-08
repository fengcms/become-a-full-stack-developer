package member

import (
	"context"
	"net/url"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/article"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func historyView(a model.Article, h model.History) map[string]any {
	r := map[string]any{"article": article.Summary(a), "lastReadAt": values.ISO(h.LastReadAt)}
	if h.Progress != nil {
		r["progress"] = *h.Progress
	}
	return r
}

// History 读取当前会员的未删除文章历史，不输出其他用户的记录。
func (s *Service) History(ctx context.Context, user int64, q url.Values) (any, error) {
	p := values.Paging(q)
	db := s.DB.WithContext(ctx)
	filter := db.Model(&model.History{}).
		Joins("JOIN articles ON articles.id=view_history.article_id").
		Scopes(database.ActiveArticles).
		Where("view_history.user_id = ?", user)
	var n int64
	if err := filter.Session(&gorm.Session{}).Count(&n).Error; err != nil {
		return nil, err
	}
	var rows []model.History
	if err := filter.Select("view_history.*").
		Order("view_history.last_read_at DESC, view_history.id DESC").
		Limit(p.Size).
		Offset(p.Offset()).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	ids := []int64{}
	for _, h := range rows {
		ids = append(ids, h.ArticleID)
	}
	articles := []model.Article{}
	if len(ids) > 0 {
		if err := db.Select(article.SummaryColumns).Where("id IN ?", ids).Find(&articles).Error; err != nil {
			return nil, err
		}
	}
	by := map[int64]model.Article{}
	for _, a := range articles {
		by[a.ID] = a
	}
	list := []map[string]any{}
	for _, h := range rows {
		list = append(list, historyView(by[h.ArticleID], h))
	}
	return p.Result(list, n), nil
}

// Report 上报阅读位置，未提交进度保留原值，显式零与 NULL 分别处理。
func (s *Service) Report(ctx context.Context, user int64, in values.Fields) (any, error) {
	id := in.Int("articleId")
	db := s.DB.WithContext(ctx)
	a, err := article.Published(db, id)
	if err != nil {
		return nil, err
	}
	h := model.History{
		UserID:     user,
		ArticleID:  id,
		LastReadAt: s.Now().UnixMilli(),
		Progress:   in.Number("progress"),
	}
	patch := map[string]any{"last_read_at": h.LastReadAt}
	if in.Has("progress") {
		patch["progress"] = h.Progress
	}
	err = db.Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{
				Name: "user_id",
			},
			{
				Name: "article_id",
			},
		},
		DoUpdates: clause.Assignments(patch),
	}).
		Create(&h).Error
	if err != nil {
		return nil, err
	}
	if err = db.Where("user_id = ? AND article_id = ?", user, id).First(&h).Error; err != nil {
		return nil, err
	}
	return historyView(a, h), nil
}

// DeleteHistory 删除本人单条历史；文章 ID 为零时清空本人历史。
func (s *Service) DeleteHistory(ctx context.Context, user, id int64) error {
	q := s.DB.WithContext(ctx).Where("user_id = ?", user)
	if id > 0 {
		q = q.Where("article_id = ?", id)
	}
	return q.Delete(&model.History{}).Error
}
