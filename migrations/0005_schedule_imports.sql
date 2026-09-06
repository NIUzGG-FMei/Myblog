CREATE TABLE IF NOT EXISTS schedule_imports (
	id TEXT PRIMARY KEY NOT NULL,
	name TEXT NOT NULL,
	start_date TEXT NOT NULL,
	courses TEXT NOT NULL,
	created_at INTEGER NOT NULL
);
