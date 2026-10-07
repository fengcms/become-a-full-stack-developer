package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	Address, Driver, DSN, JWTSecret, Storage, UploadDir, Origins, WechatAppID, WechatSecret, R2Endpoint, R2Bucket, R2AccessKey, R2SecretKey string
	Production                                                                                                                              bool
	TrustedProxies                                                                                                                          []string
}

func Load() (Config, error) {
	c := Config{Address: env("HTTP_ADDR", "127.0.0.1:8080"), Driver: env("DB_DRIVER", "postgres"), DSN: os.Getenv("DATABASE_URL"), JWTSecret: os.Getenv("JWT_SECRET"), Storage: env("STORAGE_DRIVER", "local"), UploadDir: env("UPLOAD_DIR", "./uploads"), Origins: env("CORS_ORIGINS", "http://localhost:13001,http://127.0.0.1:13001"), WechatAppID: env("WECHAT_MINI_APP_ID", os.Getenv("WECHAT_APP_ID")), WechatSecret: env("WECHAT_MINI_APP_SECRET", os.Getenv("WECHAT_APP_SECRET")), R2Endpoint: os.Getenv("R2_ENDPOINT"), R2Bucket: os.Getenv("R2_BUCKET"), R2AccessKey: os.Getenv("R2_ACCESS_KEY_ID"), R2SecretKey: os.Getenv("R2_SECRET_ACCESS_KEY"), Production: os.Getenv("APP_ENV") == "production"}
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
	return c, nil
}
func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
