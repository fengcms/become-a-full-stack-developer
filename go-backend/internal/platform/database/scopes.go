package database

import "gorm.io/gorm"

// ActiveArticles 限定未软删除文章，供普通查询和关联查询共同使用。
// 固定 articles 表名避免 JOIN 时列名歧义；使用别名的离线审计需显式表达自己的谓词。
// 这是文章的查询规则，不会自动过滤其他表，也不替代 published 可见性判断。
func ActiveArticles(db *gorm.DB) *gorm.DB {
	return db.Where("articles.deleted_at IS NULL")
}
