use contextmeld_core::{adapters, database::Database, insights::tool_details};
use std::{io::Cursor, path::Path};
#[test]
fn recognizes_only_known_tool_fields() {
    assert_eq!(
        tool_details("functions.exec_command", r#"{"cmd":"npm test"}"#)
            .command
            .as_deref(),
        Some("npm test")
    );
    assert!(
        tool_details("unknown", r#"{"cmd":"npm test","file_path":"secret"}"#)
            .command
            .is_none()
    );
    assert!(tool_details("unknown", r#"{"file_path":"secret"}"#)
        .files
        .is_empty());
    assert_eq!(
        tool_details(
            "apply_patch",
            "*** Update File: a.rs\n*** Update File: a.rs\n*** Move to: b.rs"
        )
        .files,
        vec!["a.rs", "b.rs"]
    );
    assert!(tool_details("Bash", "broken JSON").command.is_none());
}
#[test]
fn context_and_counts_follow_source_without_join_inflation() {
    let raw = r#"{"type":"user","uuid":"u","sessionId":"c","cwd":"/p","timestamp":"2026-09-01T10:00:00Z","message":{"role":"user","content":"Fix login"}}
{"type":"assistant","uuid":"a","message":{"model":"test-model","content":[{"type":"text","text":"Decision: use transactions\nTODO: verify rollback"},{"type":"tool_use","id":"t","name":"Bash","input":{"command":"npm test"}},{"type":"tool_use","id":"e","name":"Edit","input":{"file_path":"src/login.ts"}}]}}
{"type":"user","uuid":"r","message":{"content":[{"type":"tool_result","tool_use_id":"t","is_error":true,"content":"Failed"}]}}
"#;
    let parsed = adapters::adapter("claude")
        .unwrap()
        .parse(&mut Cursor::new(raw), Path::new("/test/session.jsonl"))
        .unwrap();
    let mut db = Database::open(Path::new(":memory:")).unwrap();
    db.import(&parsed, "1").unwrap();
    let a = db.analytics().unwrap();
    assert_eq!(a.session_count, 1);
    assert_eq!(a.agents[0].sessions, 1);
    assert_eq!(a.agents[0].tool_calls, 2);
    assert_eq!(a.agents[0].errors, 1);
    assert_eq!(a.file_requests[0].label, "src/login.ts");
    assert_eq!(a.shell_requests[0].label, "npm test");
    let c = db.session_context(&parsed.session.id).unwrap();
    assert_eq!(c.task, "Fix login");
    assert_eq!(c.decisions, "Decision: use transactions");
    assert_eq!(c.remaining_work, "TODO: verify rollback");
    assert_eq!(c.commands, vec!["npm test"]);
    assert_eq!(c.errors, vec!["Failed"]);
    assert!(db.session_context("missing").is_err());
    db.import(&parsed, "2").unwrap();
    assert_eq!(db.analytics().unwrap().event_count, a.event_count);
}
#[test]
fn empty_index_has_no_fabricated_activity() {
    let db = Database::open(Path::new(":memory:")).unwrap();
    let a = db.analytics().unwrap();
    assert_eq!(a.session_count, 0);
    assert!(a.agents.is_empty());
    assert!(a.models.is_empty());
}
