CREATE TABLE IF NOT EXISTS comments (
	id TEXT PRIMARY KEY NOT NULL,
	path TEXT NOT NULL,
	display_name TEXT NOT NULL,
	content TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'deleted')),
	content_hash TEXT NOT NULL,
	ip_hash TEXT,
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_public
	ON comments(path, status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_comments_ip
	ON comments(ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_content
	ON comments(content_hash, created_at DESC);
