package config

import (
	"errors"
	"fmt"
	"math"
	"net/netip"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

// Config 集中描述启动配置，不负责建立数据库连接或执行迁移。
type Config struct {
	Address               string
	Driver                string
	DSN                   string
	JWTSecret             string
	Storage               string
	UploadDir             string
	Origins               string
	WechatAppID           string
	WechatSecret          string
	R2Endpoint            string
	R2Bucket              string
	R2AccessKey           string
	R2SecretKey           string
	DatabaseMetricsOutput string
	CommentRejectRatio    *float64
	Production            bool
	TrustedProxies        []string
}

// Load 读取本地环境文件和环境变量，并拒绝不安全或不完整的启动配置。
func Load() (Config, error) {
	if err := godotenv.Load(".env"); err != nil && !errors.Is(err, os.ErrNotExist) {
		return Config{}, fmt.Errorf("invalid local .env configuration")
	}
	c := Config{
		Address:               env("HTTP_ADDR", "127.0.0.1:8080"),
		Driver:                env("DB_DRIVER", "postgres"),
		DSN:                   os.Getenv("DATABASE_URL"),
		JWTSecret:             os.Getenv("JWT_SECRET"),
		Storage:               env("STORAGE_DRIVER", "local"),
		UploadDir:             env("UPLOAD_DIR", "./uploads"),
		Origins:               env("CORS_ORIGINS", "http://localhost:13001,http://127.0.0.1:13001"),
		WechatAppID:           env("WECHAT_MINI_APP_ID", os.Getenv("WECHAT_APP_ID")),
		WechatSecret:          env("WECHAT_MINI_APP_SECRET", os.Getenv("WECHAT_APP_SECRET")),
		R2Endpoint:            os.Getenv("R2_ENDPOINT"),
		R2Bucket:              os.Getenv("R2_BUCKET"),
		R2AccessKey:           os.Getenv("R2_ACCESS_KEY_ID"),
		R2SecretKey:           os.Getenv("R2_SECRET_ACCESS_KEY"),
		DatabaseMetricsOutput: os.Getenv("DB_METRICS_FILE"),
		Production:            os.Getenv("APP_ENV") == "production",
	}
	if v := os.Getenv("TRUSTED_PROXIES"); v != "" {
		c.TrustedProxies = strings.Split(v, ",")
	}
	if c.DSN == "" {
		return c, fmt.Errorf("DATABASE_URL is required")
	}
	if len(c.JWTSecret) < 32 {
		return c, fmt.Errorf("JWT_SECRET must have at least 32 bytes")
	}
	if c.Production && strings.Contains(c.Origins, "*") {
		return c, fmt.Errorf("production CORS requires explicit origins")
	}
	if c.Storage != "local" && c.Storage != "r2" {
		return c, fmt.Errorf("unsupported storage driver")
	}
	ratio, err := strconv.ParseFloat(env("COMMENT_REJECT_RATIO", "0.1"), 64)
	if err != nil || math.IsNaN(ratio) || math.IsInf(ratio, 0) || ratio < 0 || ratio > 1 {
		return c, fmt.Errorf("COMMENT_REJECT_RATIO must be between 0 and 1")
	}
	c.CommentRejectRatio = &ratio
	for _, raw := range c.TrustedProxies {
		if _, err := netip.ParsePrefix(strings.TrimSpace(raw)); err != nil {
			return c, fmt.Errorf("TRUSTED_PROXIES must contain CIDR prefixes")
		}
	}
	return c, nil
}
func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
