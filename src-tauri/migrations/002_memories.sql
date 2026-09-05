CREATE TABLE memories (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
 scope TEXT NOT NULL CHECK(scope IN ('global','project','agent')),
 project TEXT NOT NULL DEFAULT '', agents TEXT NOT NULL DEFAULT '[]', tags TEXT NOT NULL DEFAULT '[]',
 revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), deleted_at TEXT
);
CREATE INDEX memories_modified ON memories(updated_at DESC);
CREATE VIRTUAL TABLE library_search USING fts5(id UNINDEXED, kind UNINDEXED, title, body, labels, tokenize='unicode61');
CREATE TRIGGER memory_insert AFTER INSERT ON memories WHEN NEW.deleted_at IS NULL BEGIN
 INSERT INTO library_search VALUES (NEW.id,'memory',NEW.title,NEW.body,NEW.tags || ' ' || NEW.project || ' ' || NEW.agents);
END;
CREATE TRIGGER memory_update AFTER UPDATE ON memories BEGIN
 DELETE FROM library_search WHERE id=OLD.id AND kind='memory';
 INSERT INTO library_search SELECT NEW.id,'memory',NEW.title,NEW.body,NEW.tags || ' ' || NEW.project || ' ' || NEW.agents WHERE NEW.deleted_at IS NULL;
END;
CREATE TRIGGER memory_delete AFTER DELETE ON memories BEGIN
 DELETE FROM library_search WHERE id=OLD.id AND kind='memory';
END;
PRAGMA user_version = 2;
