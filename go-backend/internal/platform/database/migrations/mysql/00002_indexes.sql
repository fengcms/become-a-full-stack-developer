-- +goose Up
CREATE INDEX idx_articles_status ON articles (status, deleted_at, published_at, id);
CREATE INDEX idx_articles_author_id ON articles (author_id, deleted_at, id);
CREATE INDEX idx_article_tags_tag_id ON article_tags (tag_id, article_id);
CREATE INDEX idx_comments_article_id ON comments (article_id, status, created_at);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens (user_id, revoked_at);
CREATE INDEX idx_notifications_user_id ON notifications (user_id, is_read, created_at);
CREATE INDEX idx_attachments_storage_key ON attachments (storage_key);
CREATE INDEX idx_favorites_user_id ON favorites (user_id, created_at);
CREATE INDEX idx_likes_user_id ON likes (user_id, created_at);
CREATE INDEX idx_view_history_user_id ON view_history (user_id, last_read_at);
-- +goose Down
DROP INDEX idx_view_history_user_id ON view_history;
DROP INDEX idx_likes_user_id ON likes;
DROP INDEX idx_favorites_user_id ON favorites;
DROP INDEX idx_attachments_storage_key ON attachments;
DROP INDEX idx_notifications_user_id ON notifications;
DROP INDEX idx_refresh_tokens_user_id ON refresh_tokens;
DROP INDEX idx_comments_article_id ON comments;
DROP INDEX idx_article_tags_tag_id ON article_tags;
DROP INDEX idx_articles_author_id ON articles;
DROP INDEX idx_articles_status ON articles;
