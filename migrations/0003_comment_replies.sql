ALTER TABLE comments ADD COLUMN parent_id TEXT;
ALTER TABLE comments ADD COLUMN is_author INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_comments_parent
	ON comments(parent_id, created_at);
