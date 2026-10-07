-- +goose Up

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  credentials_configured BOOLEAN NOT NULL,
  role TEXT NOT NULL,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  level BIGINT NOT NULL,
  status TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE (username),
  UNIQUE (email)
);

CREATE TABLE refresh_tokens (
  id BIGSERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL,
  user_id BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  revoked_at BIGINT,
  created_at BIGINT NOT NULL,
  UNIQUE (token_hash),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE wechat_identities (
  id BIGSERIAL PRIMARY KEY,
  app_id TEXT NOT NULL,
  open_id TEXT NOT NULL,
  user_id BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE (app_id, open_id),
  UNIQUE (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  parent_id BIGINT,
  sort_order BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE (slug),
  FOREIGN KEY (parent_id) REFERENCES categories(id)
);

CREATE TABLE tags (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE (slug)
);

CREATE TABLE articles (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT,
  summary TEXT,
  content TEXT NOT NULL,
  cover_image TEXT,
  author_id BIGINT NOT NULL,
  author_name TEXT,
  category_id BIGINT,
  category_name TEXT,
  category_slug TEXT,
  status TEXT NOT NULL,
  tags TEXT,
  view_count BIGINT NOT NULL,
  like_count BIGINT NOT NULL,
  published_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  deleted_at BIGINT,
  UNIQUE (slug),
  FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE TABLE article_tags (
  id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL,
  tag_id BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE (article_id, tag_id),
  FOREIGN KEY (article_id) REFERENCES articles(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);

CREATE TABLE article_view_dedup (
  id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL,
  dedup_key TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE (article_id, dedup_key),
  FOREIGN KEY (article_id) REFERENCES articles(id)
);

CREATE TABLE comments (
  id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  user_name TEXT NOT NULL,
  parent_id BIGINT,
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  rejected_reason TEXT,
  created_at BIGINT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (article_id) REFERENCES articles(id),
  FOREIGN KEY (parent_id) REFERENCES comments(id)
);

CREATE TABLE attachments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  article_id BIGINT,
  storage_key TEXT NOT NULL,
  url TEXT NOT NULL,
  storage TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE favorites (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  article_id BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE (user_id, article_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (article_id) REFERENCES articles(id)
);

CREATE TABLE view_history (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  article_id BIGINT NOT NULL,
  last_read_at BIGINT NOT NULL,
  progress BIGINT,
  UNIQUE (user_id, article_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (article_id) REFERENCES articles(id)
);

CREATE TABLE likes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  article_id BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE (user_id, article_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (article_id) REFERENCES articles(id)
);

CREATE TABLE notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL,
  created_at BIGINT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE site_settings (
  id BIGSERIAL PRIMARY KEY,
  site_name TEXT NOT NULL,
  site_title TEXT,
  site_description TEXT NOT NULL,
  site_keywords TEXT,
  logo_url TEXT,
  copyright TEXT,
  updated_at BIGINT NOT NULL
);

INSERT INTO site_settings (id,site_name,site_description,updated_at) VALUES (1,'成为全栈开发工程师','全栈开发工程师的成长笔记与实战专栏',0);

-- +goose Down

DROP TABLE site_settings;

DROP TABLE notifications;

DROP TABLE likes;

DROP TABLE view_history;

DROP TABLE favorites;

DROP TABLE attachments;

DROP TABLE comments;

DROP TABLE article_view_dedup;

DROP TABLE article_tags;

DROP TABLE articles;

DROP TABLE tags;

DROP TABLE categories;

DROP TABLE wechat_identities;

DROP TABLE refresh_tokens;

DROP TABLE users;
