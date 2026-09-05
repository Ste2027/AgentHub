CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT NOT NULL);
INSERT INTO agents VALUES ('claude','Claude Code'),('codex','OpenAI Codex');
CREATE TABLE projects (path TEXT PRIMARY KEY);
CREATE TABLE sessions (
 id TEXT PRIMARY KEY, agent TEXT NOT NULL REFERENCES agents(id), source_id TEXT NOT NULL,
 source TEXT NOT NULL UNIQUE, project TEXT NOT NULL REFERENCES projects(path), title TEXT NOT NULL,
 updated_at TEXT NOT NULL, model TEXT NOT NULL, event_count INTEGER NOT NULL, warnings INTEGER NOT NULL
);
CREATE INDEX sessions_recent ON sessions(updated_at DESC);
CREATE INDEX sessions_project ON sessions(project);
CREATE TABLE events (
 session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 ordinal INTEGER NOT NULL, kind TEXT NOT NULL, role TEXT NOT NULL, timestamp TEXT NOT NULL,
 text TEXT NOT NULL, name TEXT NOT NULL, call_id TEXT NOT NULL, PRIMARY KEY(session_id,ordinal)
);
CREATE TABLE indexed_files (path TEXT PRIMARY KEY, fingerprint TEXT NOT NULL);
CREATE VIRTUAL TABLE search_index USING fts5(session_id UNINDEXED, ordinal UNINDEXED, title, project, body, tokenize='unicode61');
PRAGMA user_version = 1;
