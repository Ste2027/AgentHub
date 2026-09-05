use agenthub_core::{database::Database, memories::MemoryDraft};
use std::path::Path;
fn db() -> Database {
    Database::open(Path::new(":memory:")).unwrap()
}
fn draft() -> MemoryDraft {
    MemoryDraft {
        title: " Architecture ".into(),
        body: "Use transactional writes".into(),
        scope: "global".into(),
        tags: vec!["db".into(), "db".into(), " ".into()],
        ..Default::default()
    }
}
#[test]
fn memory_roundtrip_filters_and_search() {
    let d = db();
    let m = d.save_memory(draft()).unwrap();
    assert_eq!(m.title, "Architecture");
    assert_eq!(m.tags, vec!["db"]);
    assert_eq!(d.memories("writes", "global", false, 0).unwrap().total, 1);
    let hits = d.search("transactional").unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].entity_type, "memory");
    assert_eq!(hits[0].entity_id, m.id);
    assert!(d.memories("", "agent", false, 0).unwrap().items.is_empty());
}
#[test]
fn editing_detects_conflicts_and_updates_full_text_index() {
    let d = db();
    let m = d.save_memory(draft()).unwrap();
    let mut update = draft();
    update.id = Some(m.id.clone());
    update.revision = Some(m.revision);
    update.body = "Prefer event sourcing".into();
    let next = d.save_memory(update.clone()).unwrap();
    assert_eq!(next.revision, 2);
    assert!(d.save_memory(update).is_err());
    assert!(d.search("transactional").unwrap().is_empty());
    assert_eq!(d.search("sourcing").unwrap().len(), 1);
}
#[test]
fn trash_is_recoverable_and_removes_search_results() {
    let d = db();
    let m = d.save_memory(draft()).unwrap();
    d.trash_memory(&m.id, m.revision, false).unwrap();
    assert_eq!(d.memories("", "", false, 0).unwrap().total, 0);
    assert!(d.search("transactional").unwrap().is_empty());
    let removed = d.memory(&m.id).unwrap().unwrap();
    assert_eq!(d.memories("", "", true, 0).unwrap().total, 1);
    d.trash_memory(&m.id, removed.revision, true).unwrap();
    assert_eq!(d.search("transactional").unwrap().len(), 1);
}
#[test]
fn archive_import_is_atomic_and_idempotent() {
    let source = db();
    source.save_memory(draft()).unwrap();
    let archive = source.export_memories(&[]).unwrap();
    let mut target = db();
    assert_eq!(target.import_memories(&archive).unwrap().imported, 1);
    assert_eq!(target.import_memories(&archive).unwrap().skipped, 1);
    let mut data: serde_json::Value = serde_json::from_str(&archive).unwrap();
    let mut invalid = data["memories"][0].clone();
    invalid["scope"] = "bad".into();
    data["memories"].as_array_mut().unwrap().push(invalid);
    let mut fresh = db();
    assert!(fresh.import_memories(&data.to_string()).is_err());
    assert_eq!(fresh.memories("", "", false, 0).unwrap().total, 0);
}
#[test]
fn validates_scope_and_agent_constraints() {
    let d = db();
    let mut x = draft();
    x.scope = "project".into();
    assert!(d.save_memory(x.clone()).is_err());
    x.project = "/project".into();
    assert!(d.save_memory(x).is_ok());
    let mut x = draft();
    x.scope = "agent".into();
    assert!(d.save_memory(x.clone()).is_err());
    x.agents = vec!["codex".into()];
    assert!(d.save_memory(x).is_ok());
    let mut x = draft();
    x.title = " ".into();
    assert!(d.save_memory(x).is_err());
}
#[test]
fn migration_preserves_existing_schema_one_data() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("index.db");
    let conn = rusqlite::Connection::open(&path).unwrap();
    conn.execute_batch(include_str!("../migrations/001_initial.sql"))
        .unwrap();
    conn.execute("INSERT INTO settings VALUES ('test','preserve')", [])
        .unwrap();
    drop(conn);
    let d = Database::open(&path).unwrap();
    let value: String = d
        .conn
        .query_row("SELECT value FROM settings WHERE key='test'", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(value, "preserve");
    assert!(d.save_memory(draft()).is_ok());
}
#[test]
fn text_exports_are_atomic_and_validate_destination() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("memory.json");
    agenthub_core::exports::write_text(&path, "first").unwrap();
    agenthub_core::exports::write_text(&path, "second").unwrap();
    assert_eq!(std::fs::read_to_string(path).unwrap(), "second");
    assert!(agenthub_core::exports::write_text(&dir.path().join("run.exe"), "data").is_err());
    assert!(agenthub_core::exports::write_text(Path::new("relative.json"), "data").is_err());
}
