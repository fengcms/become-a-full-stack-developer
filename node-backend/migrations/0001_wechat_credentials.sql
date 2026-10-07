-- 增量迁移；必须先备份并确认该列不存在。不要重放已有 0000 全量迁移。
ALTER TABLE users ADD COLUMN credentials_configured INTEGER NOT NULL DEFAULT 1;
CREATE TABLE wechat_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id TEXT NOT NULL,
  open_id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX uniq_wechat_identity ON wechat_identities(app_id, open_id);
CREATE UNIQUE INDEX uniq_wechat_user ON wechat_identities(user_id);
