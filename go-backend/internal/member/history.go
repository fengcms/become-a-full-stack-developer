package member

import (
	"context"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/article"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"net/url"
)

func historyView(a model.Article, h model.History) map[string]any {
	r := map[string]any{"article": article.Summary(a), "lastReadAt": values.ISO(h.LastReadAt)}
	if h.Progress != nil {
		r["progress"] = *h.Progress
	}
	return r
}
func (s *Service) History(ctx context.Context, user int64, q url.Values) (any, error) {
	p := values.Paging(q)
	db := s.DB.WithContext(ctx)
	filter := db.Model(&model.History{}).Joins("JOIN articles ON articles.id=view_history.article_id").Where("view_history.user_id = ? AND articles.deleted_at IS NULL", user)
	var n int64
	if e := filter.Session(&gorm.Session{}).Count(&n).Error; e != nil {
		return nil, e
	}
	var rows []model.History
	if e := filter.Select("view_history.*").Order("view_history.last_read_at DESC, view_history.id DESC").Limit(p.Size).Offset(p.Offset()).Find(&rows).Error; e != nil {
		return nil, e
	}
	ids := []int64{}
	for _, h := range rows {
		ids = append(ids, h.ArticleID)
	}
	articles := []model.Article{}
	if len(ids) > 0 {
		if e := db.Select(article.SummaryColumns).Where("id IN ?", ids).Find(&articles).Error; e != nil {
			return nil, e
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
func (s *Service) Report(ctx context.Context, user int64, in values.Fields) (any, error) {
	id := in.Int("articleId")
	db := s.DB.WithContext(ctx)
	a, e := article.Published(db, id)
	if e != nil {
		return nil, e
	}
	h := model.History{UserID: user, ArticleID: id, LastReadAt: s.Now().UnixMilli(), Progress: in.Number("progress")}
	patch := map[string]any{"last_read_at": h.LastReadAt}
	if in.Has("progress") {
		patch["progress"] = h.Progress
	}
	e = db.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "user_id"}, {Name: "article_id"}}, DoUpdates: clause.Assignments(patch)}).Create(&h).Error
	if e != nil {
		return nil, e
	}
	if e = db.Where("user_id = ? AND article_id = ?", user, id).First(&h).Error; e != nil {
		return nil, e
	}
	return historyView(a, h), nil
}
func (s *Service) DeleteHistory(ctx context.Context, user, id int64) error {
	q := s.DB.WithContext(ctx).Where("user_id = ?", user)
	if id > 0 {
		q = q.Where("article_id = ?", id)
	}
	return q.Delete(&model.History{}).Error
}
