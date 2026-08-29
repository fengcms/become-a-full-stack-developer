-- 站点配置种子数据 (site_settings, 单条记录, id 恒为 1)
-- 对应 src/db/migrate.ts 中应用层 migrate 的默认值
-- 幂等: 已存在 id=1 则跳过 (ON CONFLICT(id) DO NOTHING)
-- 执行 (D1 线上):
--   wrangler d1 execute node-backend --remote --file=./scripts/seed-site-settings.sql
-- 注意: GET /site/settings 在 site_settings 表无 id=1 行时会 500,
--       必须先有这一行 (仅 site_name / site_description / updated_at 三个 NOT NULL 字段必填)。
INSERT INTO site_settings (id, site_name, site_description, updated_at)
VALUES (
  1,
  '成为全栈开发工程师',
  '全栈开发工程师的成长笔记与实战专栏',
  cast(strftime('%s', 'now') as integer) * 1000
)
ON CONFLICT(id) DO NOTHING;
