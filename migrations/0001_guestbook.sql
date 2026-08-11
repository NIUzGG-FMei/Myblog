CREATE TABLE IF NOT EXISTS guestbook_notes (
	id TEXT PRIMARY KEY NOT NULL,
	content TEXT NOT NULL,
	display_name TEXT NOT NULL,
	is_anonymous INTEGER NOT NULL DEFAULT 1 CHECK (is_anonymous IN (0, 1)),
	note_type TEXT NOT NULL CHECK (note_type IN ('visit', 'feedback', 'request')),
	color TEXT NOT NULL CHECK (color IN ('lemon', 'mint', 'sky', 'blush')),
	status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('published', 'pending', 'rejected', 'deleted')),
	moderation_reason TEXT,
	content_hash TEXT NOT NULL,
	ip_hash TEXT,
	created_at INTEGER NOT NULL,
	published_at INTEGER,
	reviewed_at INTEGER
);

CREATE TABLE IF NOT EXISTS guestbook_contacts (
	note_id TEXT PRIMARY KEY NOT NULL REFERENCES guestbook_notes(id) ON DELETE CASCADE,
	ciphertext TEXT NOT NULL,
	iv TEXT NOT NULL,
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS guestbook_submission_events (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	ip_hash TEXT NOT NULL,
	content_hash TEXT,
	result TEXT NOT NULL,
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_guestbook_notes_public
	ON guestbook_notes(status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_guestbook_notes_ip
	ON guestbook_notes(ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guestbook_events_ip
	ON guestbook_submission_events(ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guestbook_events_content
	ON guestbook_submission_events(content_hash, created_at DESC);
