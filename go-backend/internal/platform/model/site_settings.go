// Package model contains persistence rows, never HTTP responses.
package model

type SiteSetting struct {
	ID              int64   `gorm:"column:id;primaryKey;autoIncrement"`
	SiteName        string  `gorm:"column:site_name"`
	SiteTitle       *string `gorm:"column:site_title"`
	SiteDescription string  `gorm:"column:site_description"`
	SiteKeywords    *string `gorm:"column:site_keywords"`
	LogoURL         *string `gorm:"column:logo_url"`
	Copyright       *string `gorm:"column:copyright"`
	UpdatedAt       int64   `gorm:"column:updated_at"`
}

func (SiteSetting) TableName() string { return "site_settings" }
