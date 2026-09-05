use crate::models::*;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;

pub struct Database {
    pub conn: Connection,
}
type Result<T> = std::result::Result<T, String>;
impl Database {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        conn.busy_timeout(std::time::Duration::from_secs(5))
            .map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;")
            .map_err(|e| e.to_string())?;
        let mut db = Self { conn };
        db.migrate()?;
        Ok(db)
    }
    fn migrate(&mut self) -> Result<()> {
        let version: i64 = self
            .conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if version > 2 {
            return Err("Database is from a newer AgentHub version".into());
        }
        if version == 0 {
            let tx = self.conn.transaction().map_err(|e| e.to_string())?;
            tx.execute_batch(include_str!("../migrations/001_initial.sql"))
                .map_err(|e| e.to_string())?;
            tx.commit().map_err(|e| e.to_string())?;
        }
        if version < 2 {
            let tx = self.conn.transaction().map_err(|e| e.to_string())?;
            tx.execute_batch(include_str!("../migrations/002_memories.sql"))
                .map_err(|e| e.to_string())?;
            tx.commit().map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    pub fn settings(&self) -> Result<Settings> {
        let json: Option<String> = self
            .conn
            .query_row(
                "SELECT value FROM settings WHERE key='preferences'",
                [],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        json.map(|s| serde_json::from_str(&s).map_err(|e| e.to_string()))
            .unwrap_or_else(|| Ok(Settings::default()))
    }
    pub fn save_settings(&self, settings: &Settings) -> Result<()> {
        for path in [&settings.claude_path, &settings.codex_path] {
            if !path.is_empty() && !crate::paths::is_local_absolute(Path::new(path)) {
                return Err(
                    "Agent paths must be absolute local paths (or empty to use defaults)".into(),
                );
            }
        }
        self.conn.execute("INSERT INTO settings VALUES ('preferences',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [serde_json::to_string(settings).map_err(|e|e.to_string())?]).map_err(|e|e.to_string())?;
        Ok(())
    }
    pub fn unchanged(&self, path: &str, fingerprint: &str) -> Result<bool> {
        let value: Option<String> = self
            .conn
            .query_row(
                "SELECT fingerprint FROM indexed_files WHERE path=?1",
                [path],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        Ok(value.as_deref() == Some(fingerprint))
    }
    pub fn import(&mut self, parsed: &ParsedSession, fingerprint: &str) -> Result<()> {
        let tx = self.conn.transaction().map_err(|e| e.to_string())?;
        let s = &parsed.session;
        tx.execute("INSERT OR IGNORE INTO projects VALUES (?1)", [&s.project])
            .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM search_index WHERE session_id=?1", [&s.id])
            .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM sessions WHERE id=?1", [&s.id])
            .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO sessions VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![
                s.id,
                s.agent,
                s.source_id,
                s.source,
                s.project,
                s.title,
                s.updated_at,
                s.model,
                s.event_count,
                s.warnings
            ],
        )
        .map_err(|e| e.to_string())?;
        {
            let mut insert = tx
                .prepare("INSERT INTO events VALUES (?1,?2,?3,?4,?5,?6,?7,?8)")
                .map_err(|e| e.to_string())?;
            let mut search = tx
                .prepare("INSERT INTO search_index VALUES (?1,?2,?3,?4,?5)")
                .map_err(|e| e.to_string())?;
            search
                .execute(params![s.id, -1, s.title, s.project, ""])
                .map_err(|e| e.to_string())?;
            for e in &parsed.events {
                insert
                    .execute(params![
                        s.id,
                        e.ordinal,
                        e.kind,
                        e.role,
                        e.timestamp,
                        e.text,
                        e.name,
                        e.call_id
                    ])
                    .map_err(|e| e.to_string())?;
                search
                    .execute(params![
                        s.id,
                        e.ordinal,
                        "",
                        "",
                        format!("{} {}", e.name, e.text)
                    ])
                    .map_err(|e| e.to_string())?;
            }
        }
        tx.execute("INSERT INTO indexed_files VALUES (?1,?2) ON CONFLICT(path) DO UPDATE SET fingerprint=excluded.fingerprint",params![s.source,fingerprint]).map_err(|e|e.to_string())?;
        tx.execute("DELETE FROM projects WHERE NOT EXISTS (SELECT 1 FROM sessions WHERE sessions.project=projects.path)",[]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e| e.to_string())
    }
    pub fn sessions(
        &self,
        agent: &str,
        project: &str,
        date_from: &str,
        date_to: &str,
        model: &str,
        sort: &str,
        offset: usize,
    ) -> Result<Vec<Session>> {
        if !matches!(sort, "newest" | "oldest") {
            return Err("Unsupported session sort order".into());
        }
        let mut stmt = self.conn.prepare("SELECT id,agent,source_id,source,project,title,updated_at,model,event_count,warnings FROM sessions WHERE (?1='' OR agent=?1) AND (?2='' OR project=?2) AND (?3='' OR substr(updated_at,1,10)>=?3) AND (?4='' OR substr(updated_at,1,10)<=?4) AND (?5='' OR lower(model) LIKE '%'||lower(?5)||'%') ORDER BY CASE WHEN ?6='oldest' THEN updated_at END ASC,CASE WHEN ?6='newest' THEN updated_at END DESC,id LIMIT 100 OFFSET ?7").map_err(|e|e.to_string())?;
        let rows = stmt
            .query_map(
                params![agent, project, date_from, date_to, model, sort, offset],
                read_session,
            )
            .map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<_>>()
            .map_err(|e| e.to_string())
    }
    pub fn session(&self, id: &str) -> Result<Option<Session>> {
        self.conn.query_row("SELECT id,agent,source_id,source,project,title,updated_at,model,event_count,warnings FROM sessions WHERE id=?1", [id], read_session).optional().map_err(|e| e.to_string())
    }
    pub fn events(&self, session_id: &str, offset: usize) -> Result<Vec<Event>> {
        let mut stmt = self.conn.prepare("SELECT ordinal,kind,role,timestamp,text,name,call_id FROM events WHERE session_id=?1 ORDER BY ordinal LIMIT 100 OFFSET ?2").map_err(|e|e.to_string())?;
        let rows = stmt
            .query_map(params![session_id, offset], |r| {
                Ok(Event {
                    ordinal: r.get(0)?,
                    kind: r.get(1)?,
                    role: r.get(2)?,
                    timestamp: r.get(3)?,
                    text: r.get(4)?,
                    name: r.get(5)?,
                    call_id: r.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<_>>()
            .map_err(|e| e.to_string())
    }
    pub fn search(&self, query: &str) -> Result<Vec<SearchHit>> {
        // Quote each token: user input is always text, never executable FTS syntax.
        let terms: Vec<String> = query
            .split_whitespace()
            .take(20)
            .map(|s| format!("\"{}\"", s.replace('"', "\"\"")))
            .collect();
        if terms.is_empty() {
            return Ok(Vec::new());
        }
        let mut stmt = self.conn.prepare("SELECT s.id,s.title,s.agent,s.project,substr(COALESCE(e.text,s.title),1,400),COALESCE(e.kind,'session'),max(CAST(f.ordinal AS INTEGER),0),s.updated_at FROM search_index f JOIN sessions s ON s.id=f.session_id LEFT JOIN events e ON e.session_id=f.session_id AND e.ordinal=CAST(f.ordinal AS INTEGER) WHERE search_index MATCH ?1 ORDER BY rank LIMIT 80").map_err(|e|e.to_string())?;
        let rows = stmt
            .query_map([terms.join(" AND ")], |r| {
                Ok(SearchHit {
                    entity_type: "session".into(),
                    entity_id: r.get(0)?,
                    session_id: r.get(0)?,
                    title: r.get(1)?,
                    agent: r.get(2)?,
                    project: r.get(3)?,
                    text: r.get(4)?,
                    kind: r.get(5)?,
                    ordinal: r.get(6)?,
                    updated_at: r.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut results: Vec<SearchHit> = rows
            .collect::<rusqlite::Result<_>>()
            .map_err(|e| e.to_string())?;
        results.truncate(40);
        results.extend(self.search_memories(&terms.join(" AND "))?);
        Ok(results)
    }
    pub fn projects(&self) -> Result<Vec<Project>> {
        let mut stmt = self.conn.prepare("SELECT project,count(*),group_concat(DISTINCT agent),max(updated_at) FROM sessions WHERE project<>'' GROUP BY project ORDER BY max(updated_at) DESC").map_err(|e|e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                let path: String = r.get(0)?;
                let name = path
                    .rsplit(['/', '\\'])
                    .find(|s| !s.is_empty())
                    .unwrap_or(&path)
                    .to_owned();
                let git = crate::paths::has_local_git_marker(Path::new(&path));
                Ok(Project {
                    path,
                    name,
                    sessions: r.get(1)?,
                    agents: r.get(2)?,
                    updated_at: r.get(3)?,
                    git,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<_>>()
            .map_err(|e| e.to_string())
    }
    pub fn overview(&self, database_path: String) -> Result<Overview> {
        let counts = self.conn.query_row("SELECT (SELECT count(*) FROM sessions),(SELECT count(*) FROM projects WHERE path<>''),(SELECT count(*) FROM events)",[],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).map_err(|e|e.to_string())?;
        Ok(Overview {
            sessions: counts.0,
            projects: counts.1,
            events: counts.2,
            agents: crate::adapters::agents(&self.settings()?),
            database_path,
        })
    }
}
fn read_session(r: &rusqlite::Row<'_>) -> rusqlite::Result<Session> {
    Ok(Session {
        id: r.get(0)?,
        agent: r.get(1)?,
        source_id: r.get(2)?,
        source: r.get(3)?,
        project: r.get(4)?,
        title: r.get(5)?,
        updated_at: r.get(6)?,
        model: r.get(7)?,
        event_count: r.get(8)?,
        warnings: r.get(9)?,
    })
}
