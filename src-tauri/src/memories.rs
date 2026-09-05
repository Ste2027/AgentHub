use crate::database::Database;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

type Result<T> = std::result::Result<T, String>;
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct MemoryDraft {
    pub id: Option<String>,
    pub revision: Option<i64>,
    pub title: String,
    pub body: String,
    pub scope: String,
    #[serde(default)]
    pub project: String,
    #[serde(default)]
    pub agents: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Memory {
    pub id: String,
    pub revision: i64,
    pub title: String,
    pub body: String,
    pub scope: String,
    pub project: String,
    pub agents: Vec<String>,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}
#[derive(Serialize)]
pub struct MemoryPage {
    pub items: Vec<Memory>,
    pub total: usize,
}
#[derive(Serialize, Deserialize)]
struct MemoryArchive {
    format: String,
    version: u32,
    memories: Vec<MemoryDraft>,
}
#[derive(Serialize, Debug)]
pub struct ImportResult {
    pub imported: usize,
    pub skipped: usize,
}

impl MemoryDraft {
    fn validate(mut self) -> Result<Self> {
        self.title = self.title.trim().to_owned();
        if self.title.is_empty() || self.title.chars().count() > 240 {
            return Err("A title of 1–240 characters is required".into());
        }
        if self.body.len() > 1024 * 1024 {
            return Err("Memory content exceeds 1 MiB".into());
        }
        if !["global", "project", "agent"].contains(&self.scope.as_str()) {
            return Err("Unknown memory scope".into());
        }
        self.project = self.project.trim().to_owned();
        if self.scope == "project" && self.project.is_empty() {
            return Err("Select a project for a project memory".into());
        }
        if self.scope != "project" {
            self.project.clear();
        }
        if self.project.len() > 4096 {
            return Err("Project path is too long".into());
        }
        if self.agents.iter().any(|s| {
            !["claude", "codex", "cursor", "gemini", "opencode", "copilot"].contains(&s.as_str())
        }) {
            return Err("Unknown agent association".into());
        }
        self.agents.sort();
        self.agents.dedup();
        if self.scope == "agent" && self.agents.is_empty() {
            return Err("Select at least one agent".into());
        }
        self.tags = self
            .tags
            .into_iter()
            .map(|s| s.trim().to_owned())
            .filter(|s| !s.is_empty())
            .collect();
        if self.tags.len() > 64 || self.tags.iter().any(|s| s.chars().count() > 80) {
            return Err("Use at most 64 tags of 80 characters".into());
        }
        self.tags.sort();
        self.tags.dedup();
        Ok(self)
    }
}
const COLUMNS: &str =
    "id,revision,title,body,scope,project,agents,tags,created_at,updated_at,deleted_at";
fn row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Memory> {
    let agents: String = r.get(6)?;
    let tags: String = r.get(7)?;
    let decode = |value: &str, index| {
        serde_json::from_str(value).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(
                index,
                rusqlite::types::Type::Text,
                Box::new(e),
            )
        })
    };
    Ok(Memory {
        id: r.get(0)?,
        revision: r.get(1)?,
        title: r.get(2)?,
        body: r.get(3)?,
        scope: r.get(4)?,
        project: r.get(5)?,
        agents: decode(&agents, 6)?,
        tags: decode(&tags, 7)?,
        created_at: r.get(8)?,
        updated_at: r.get(9)?,
        deleted_at: r.get(10)?,
    })
}
fn insert(conn: &Connection, draft: &MemoryDraft) -> Result<String> {
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute("INSERT INTO memories (id,title,body,scope,project,agents,tags) VALUES (?1,?2,?3,?4,?5,?6,?7)",params![id,draft.title,draft.body,draft.scope,draft.project,serde_json::to_string(&draft.agents).map_err(|e|e.to_string())?,serde_json::to_string(&draft.tags).map_err(|e|e.to_string())?]).map_err(|e|e.to_string())?;
    Ok(id)
}
impl Database {
    pub fn search_memories(&self, fts_query: &str) -> Result<Vec<crate::models::SearchHit>> {
        let mut stmt=self.conn.prepare("SELECT m.id,m.title,m.project,substr(m.body,1,400),m.updated_at FROM library_search f JOIN memories m ON m.id=f.id WHERE library_search MATCH ?1 AND f.kind='memory' AND m.deleted_at IS NULL ORDER BY rank LIMIT 40").map_err(|e|e.to_string())?;
        let rows = stmt
            .query_map([fts_query], |r| {
                Ok(crate::models::SearchHit {
                    entity_type: "memory".into(),
                    entity_id: r.get(0)?,
                    session_id: String::new(),
                    title: r.get(1)?,
                    agent: String::new(),
                    project: r.get(2)?,
                    text: r.get(3)?,
                    kind: "memory".into(),
                    ordinal: 0,
                    updated_at: r.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<_>>()
            .map_err(|e| e.to_string())
    }
    pub fn memory(&self, id: &str) -> Result<Option<Memory>> {
        self.conn
            .query_row(
                &format!("SELECT {COLUMNS} FROM memories WHERE id=?1"),
                [id],
                row,
            )
            .optional()
            .map_err(|e| e.to_string())
    }
    pub fn memories(
        &self,
        query: &str,
        scope: &str,
        trash: bool,
        offset: usize,
    ) -> Result<MemoryPage> {
        if query.len() > 2000 {
            return Err("Search query is too long".into());
        }
        let filter="WHERE (deleted_at IS NOT NULL)=?1 AND (?2='' OR scope=?2) AND instr(lower(title || ' ' || body || ' ' || tags || ' ' || project),lower(?3))>0";
        let total = self
            .conn
            .query_row(
                &format!("SELECT count(*) FROM memories {filter}"),
                params![trash, scope, query],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        let mut statement=self.conn.prepare(&format!("SELECT {COLUMNS} FROM memories {filter} ORDER BY updated_at DESC,id LIMIT 100 OFFSET ?4")).map_err(|e|e.to_string())?;
        let items = statement
            .query_map(params![trash, scope, query, offset], row)
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| e.to_string())?;
        Ok(MemoryPage { items, total })
    }
    pub fn save_memory(&self, draft: MemoryDraft) -> Result<Memory> {
        let draft = draft.validate()?;
        let id = if let Some(id) = &draft.id {
            let revision = draft
                .revision
                .ok_or("Missing memory revision; reload before saving")?;
            let changed=self.conn.execute("UPDATE memories SET title=?1,body=?2,scope=?3,project=?4,agents=?5,tags=?6,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?7 AND revision=?8 AND deleted_at IS NULL",params![draft.title,draft.body,draft.scope,draft.project,serde_json::to_string(&draft.agents).map_err(|e|e.to_string())?,serde_json::to_string(&draft.tags).map_err(|e|e.to_string())?,id,revision]).map_err(|e|e.to_string())?;
            if changed != 1 {
                return Err("This memory changed or was deleted. Reload it before saving.".into());
            }
            id.clone()
        } else {
            insert(&self.conn, &draft)?
        };
        self.memory(&id)?
            .ok_or_else(|| "Saved memory not found".into())
    }
    pub fn trash_memory(&self, id: &str, revision: i64, restore: bool) -> Result<()> {
        let changed=self.conn.execute("UPDATE memories SET deleted_at=CASE WHEN ?1 THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ','now') END,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2 AND revision=?3 AND (deleted_at IS NOT NULL)=?1",params![restore,id,revision]).map_err(|e|e.to_string())?;
        if changed != 1 {
            return Err("This memory changed. Reload before trying again.".into());
        }
        Ok(())
    }
    pub fn export_memories(&self, ids: &[String]) -> Result<String> {
        let mut stmt = self
            .conn
            .prepare(&format!(
                "SELECT {COLUMNS} FROM memories WHERE deleted_at IS NULL ORDER BY id"
            ))
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], row).map_err(|e| e.to_string())?;
        let mut memories = Vec::new();
        let mut size = 0;
        for value in rows {
            let m = value.map_err(|e| e.to_string())?;
            if !ids.is_empty() && !ids.contains(&m.id) {
                continue;
            }
            size += m.body.len() + m.title.len();
            if size > 3 * 1024 * 1024 || memories.len() >= 500 {
                return Err("Export is too large; export individual memories instead".into());
            }
            memories.push(MemoryDraft {
                id: Some(m.id),
                revision: Some(m.revision),
                title: m.title,
                body: m.body,
                scope: m.scope,
                project: m.project,
                agents: m.agents,
                tags: m.tags,
            });
        }
        let json = serde_json::to_string_pretty(&MemoryArchive {
            format: "agenthub.memories".into(),
            version: 1,
            memories,
        })
        .map_err(|e| e.to_string())?;
        if json.len() > 4 * 1024 * 1024 {
            return Err("Export is too large; export individual memories instead".into());
        }
        Ok(json)
    }
    pub fn import_memories(&mut self, json: &str) -> Result<ImportResult> {
        if json.len() > 4 * 1024 * 1024 {
            return Err("Import exceeds 4 MiB".into());
        }
        let archive: MemoryArchive =
            serde_json::from_str(json).map_err(|e| format!("Invalid memory archive: {e}"))?;
        if archive.format != "agenthub.memories" || archive.version != 1 {
            return Err("Unsupported memory archive format/version".into());
        }
        if archive.memories.len() > 500 {
            return Err("Import at most 500 memories at a time".into());
        }
        let drafts = archive
            .memories
            .into_iter()
            .map(MemoryDraft::validate)
            .collect::<Result<Vec<_>>>()?;
        let tx = self.conn.transaction().map_err(|e| e.to_string())?;
        let mut result = ImportResult {
            imported: 0,
            skipped: 0,
        };
        for draft in drafts {
            let exists:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM memories WHERE deleted_at IS NULL AND title=?1 AND body=?2 AND scope=?3 AND project=?4 AND agents=?5 AND tags=?6)",params![draft.title,draft.body,draft.scope,draft.project,serde_json::to_string(&draft.agents).map_err(|e|e.to_string())?,serde_json::to_string(&draft.tags).map_err(|e|e.to_string())?],|r|r.get(0)).map_err(|e|e.to_string())?;
            if exists {
                result.skipped += 1;
            } else {
                insert(&tx, &draft)?;
                result.imported += 1;
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(result)
    }
}
