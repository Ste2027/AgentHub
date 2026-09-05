use agenthub_core::{adapters, database::Database, indexer, models::Settings};
use std::{io::Cursor, path::Path};
const CLAUDE: &str = r#"{"type":"user","uuid":"u1","sessionId":"c1","cwd":"/projects/alpha","timestamp":"2026-09-01T10:00:00Z","message":{"role":"user","content":"Fix authentication bug"}}
{"type":"assistant","uuid":"a1","sessionId":"c1","timestamp":"2026-09-01T10:01:00Z","message":{"model":"claude-test","content":[{"type":"text","text":"Checking login"},{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"npm test"}}]}}
{"type":"user","uuid":"u2","sessionId":"c1","timestamp":"2026-09-01T10:02:00Z","message":{"content":[{"type":"tool_result","tool_use_id":"t1","is_error":true,"content":"Login test failed"}]}}
"#;
const CODEX: &str = r#"{"type":"session_meta","timestamp":"2026-09-01T10:00:00Z","payload":{"id":"x1","cwd":"/projects/alpha"}}
{"type":"turn_context","payload":{"model":"codex-test"}}
{"type":"response_item","timestamp":"2026-09-01T10:01:00Z","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"Fix authentication bug"}]}}
{"type":"event_msg","payload":{"type":"user_message","message":"Fix authentication bug"}}
{"type":"response_item","payload":{"type":"function_call","name":"exec_command","call_id":"t1","arguments":"{\"cmd\":\"npm test\"}"}}
{"type":"response_item","payload":{"type":"function_call_output","call_id":"t1","output":"All tests passed"}}
"#;
fn parse(agent: &str, text: &str) -> agenthub_core::models::ParsedSession {
    adapters::adapter(agent)
        .unwrap()
        .parse(&mut Cursor::new(text), Path::new("/test/session.jsonl"))
        .unwrap()
}
fn db() -> Database {
    Database::open(Path::new(":memory:")).unwrap()
}
#[test]
fn git_discovery_accepts_local_projects_and_rejects_relative_paths() {
    let temp = tempfile::tempdir().unwrap();
    std::fs::create_dir(temp.path().join(".git")).unwrap();
    assert!(agenthub_core::paths::has_local_git_marker(temp.path()));
    assert!(!agenthub_core::paths::has_local_git_marker(Path::new(
        "relative"
    )));
}
#[cfg(windows)]
#[test]
fn windows_network_and_device_paths_are_not_probed() {
    use agenthub_core::paths::{has_local_git_marker, is_local_absolute};
    for path in [
        r"\\untrusted.invalid\share",
        r"\\?\UNC\untrusted.invalid\share",
        r"\\.\pipe\example",
    ] {
        assert!(!is_local_absolute(Path::new(path)));
        assert!(!has_local_git_marker(Path::new(path)));
        let d = db();
        assert!(d
            .save_settings(&Settings {
                claude_path: path.into(),
                ..Settings::default()
            })
            .is_err());
    }
    assert!(is_local_absolute(Path::new(r"C:\local")));
    assert!(is_local_absolute(Path::new(r"\\?\C:\local")));
}
#[test]
fn direct_session_lookup_handles_missing_and_existing_ids() {
    let mut d = db();
    let p = parse("claude", CLAUDE);
    assert!(d.session("missing").unwrap().is_none());
    d.import(&p, "1").unwrap();
    assert_eq!(
        d.session(&p.session.id).unwrap().unwrap().title,
        p.session.title
    );
}
#[test]
fn claude_parses_blocks_and_error_results() {
    let p = parse("claude", CLAUDE);
    assert_eq!(p.events.len(), 4);
    assert_eq!(p.session.title, "Fix authentication bug");
    assert_eq!(p.session.model, "claude-test");
    assert_eq!(p.events[2].name, "Bash");
    assert_eq!(p.events[3].kind, "error");
    assert_eq!(p.events[3].call_id, "t1");
}
#[test]
fn codex_avoids_mirrored_event_duplicates() {
    let p = parse("codex", CODEX);
    assert_eq!(p.events.len(), 3);
    assert_eq!(p.session.source_id, "x1");
    assert_eq!(p.events[1].kind, "tool_call");
    assert_eq!(p.events[2].call_id, "t1");
}
#[test]
fn malformed_lines_do_not_lose_valid_records() {
    let p = parse("claude", &format!("bad json\n{CLAUDE}{{partial"));
    assert_eq!(p.session.warnings, 2);
    assert_eq!(p.events.len(), 4);
}
#[test]
fn unknown_or_empty_files_are_rejected() {
    for text in ["", "{}\n", "{broken"] {
        assert!(adapters::adapter("codex")
            .unwrap()
            .parse(&mut Cursor::new(text), Path::new("x"))
            .is_err());
    }
}
#[test]
fn duplicate_claude_records_are_replaced() {
    let p = parse("claude", &format!("{CLAUDE}{CLAUDE}"));
    assert_eq!(p.events.len(), 4);
}
#[test]
fn database_import_is_idempotent_and_search_updates() {
    let mut d = db();
    let mut p = parse("claude", CLAUDE);
    d.import(&p, "1").unwrap();
    d.import(&p, "1").unwrap();
    assert_eq!(d.sessions("", "", 0).unwrap().len(), 1);
    assert_eq!(d.events(&p.session.id, 0).unwrap().len(), 4);
    assert!(!d.search("authentication").unwrap().is_empty());
    assert!(!d.search("npm test").unwrap().is_empty());
    assert!(!d.search("alpha").unwrap().is_empty());
    p.events[0].text = "Fix payments".into();
    p.session.title = "Fix payments".into();
    d.import(&p, "2").unwrap();
    assert!(d.search("authentication").unwrap().is_empty());
    assert!(!d.search("payments").unwrap().is_empty());
    assert!(d.unchanged(&p.session.source, "2").unwrap());
}
#[test]
fn search_treats_fts_syntax_as_literal_text() {
    let mut d = db();
    d.import(&parse("codex", CODEX), "1").unwrap();
    for query in ["", "\"", "OR", "*", "NEAR(foo)", "' OR 1=1; --"] {
        assert!(d.search(query).is_ok(), "{query}");
    }
    assert_eq!(d.sessions("", "", 0).unwrap().len(), 1);
}
#[test]
fn project_and_agent_filters_work() {
    let mut d = db();
    d.import(&parse("codex", CODEX), "1").unwrap();
    let mut c = parse("claude", CLAUDE);
    c.session.source = "/different/path".into();
    d.import(&c, "1").unwrap();
    assert_eq!(d.projects().unwrap()[0].sessions, 2);
    assert_eq!(d.sessions("codex", "", 0).unwrap().len(), 1);
    assert!(d.sessions("", "/absent", 0).unwrap().is_empty());
}
#[test]
fn failed_import_rolls_back_old_events_and_search() {
    let mut d = db();
    let p = parse("claude", CLAUDE);
    d.import(&p, "1").unwrap();
    let mut bad = p.clone();
    bad.session.agent = "unsupported".into();
    assert!(d.import(&bad, "2").is_err());
    assert_eq!(d.events(&p.session.id, 0).unwrap().len(), 4);
    assert!(!d.search("authentication").unwrap().is_empty());
    assert!(d.unchanged(&p.session.source, "1").unwrap());
}
#[test]
fn settings_persist_and_migrations_reopen() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("test.db");
    let d = Database::open(&path).unwrap();
    let s = Settings {
        claude_path: temp.path().to_string_lossy().into_owned(),
        codex_path: String::new(),
        light_mode: true,
    };
    d.save_settings(&s).unwrap();
    drop(d);
    let d = Database::open(&path).unwrap();
    assert!(d.settings().unwrap().light_mode);
    let mut s = s;
    s.claude_path = "relative".into();
    assert!(d.save_settings(&s).is_err());
}
#[test]
fn indexer_skips_unchanged_and_recovers_corrupt_files() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("claude");
    std::fs::create_dir(&source).unwrap();
    std::fs::write(source.join("good.jsonl"), CLAUDE).unwrap();
    std::fs::write(source.join("bad.jsonl"), "broken").unwrap();
    let mut d = db();
    d.save_settings(&Settings {
        claude_path: source.to_string_lossy().into_owned(),
        codex_path: temp.path().join("absent").to_string_lossy().into_owned(),
        light_mode: false,
    })
    .unwrap();
    let first = indexer::run(&mut d, false, |_| {}).unwrap();
    assert_eq!((first.indexed, first.failed), (1, 1));
    let next = indexer::run(&mut d, false, |_| {}).unwrap();
    assert_eq!((next.indexed, next.skipped), (0, 1));
    std::fs::write(source.join("bad.jsonl"), CLAUDE).unwrap();
    let next = indexer::run(&mut d, false, |_| {}).unwrap();
    assert_eq!((next.indexed, next.failed), (1, 0));
    assert_eq!(d.sessions("", "", 0).unwrap().len(), 2);
    let forced = indexer::run(&mut d, true, |_| {}).unwrap();
    assert_eq!(forced.indexed, 2);
}
#[test]
fn oversized_line_is_skipped_and_next_record_survives() {
    let mut text = "x".repeat(8 * 1024 * 1024 + 10);
    text.push('\n');
    text.push_str(CLAUDE);
    let p = parse("claude", &text);
    assert_eq!(p.session.warnings, 1);
    assert_eq!(p.events.len(), 4);
}
