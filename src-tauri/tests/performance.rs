use contextmeld_core::{
    database::Database,
    models::{Event, Session},
};
use std::{path::Path, time::Instant};

/// A bounded synthetic scale check. It never ships with the application data.
#[test]
fn indexes_and_searches_ten_thousand_sessions() {
    let mut db = Database::open(Path::new(":memory:")).expect("database");
    let started = Instant::now();
    let tx = db.conn.transaction().expect("transaction");
    let mut project_insert = tx
        .prepare("INSERT INTO projects(path) VALUES (?1)")
        .expect("project insert");
    for project_number in 0..20usize {
        project_insert
            .execute([format!("/synthetic/project-{project_number}")])
            .expect("project");
    }
    drop(project_insert);
    let mut session_insert = tx
        .prepare("INSERT INTO sessions VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)")
        .expect("session insert");
    let mut event_insert = tx
        .prepare("INSERT INTO events VALUES (?1,?2,?3,?4,?5,?6,?7,?8)")
        .expect("event insert");
    let mut search_insert = tx
        .prepare("INSERT INTO search_index VALUES (?1,?2,?3,?4,?5)")
        .expect("search insert");
    for session_number in 0..10_000usize {
        let id = format!("scale-{session_number}");
        let events = (0..10usize)
            .map(|ordinal| Event {
                ordinal,
                kind: "message".into(),
                role: if ordinal % 2 == 0 {
                    "user"
                } else {
                    "assistant"
                }
                .into(),
                timestamp: format!("2026-01-01T00:{:02}:00Z", ordinal % 60),
                text: format!("Synthetic performance message {session_number} {ordinal}"),
                name: String::new(),
                call_id: String::new(),
            })
            .collect::<Vec<_>>();
        let session = Session {
            id: id.clone(),
            agent: if session_number % 2 == 0 {
                "claude".into()
            } else {
                "codex".into()
            },
            source_id: id.clone(),
            source: format!("/synthetic/{id}.jsonl"),
            project: format!("/synthetic/project-{}", session_number % 20),
            title: format!("Synthetic performance session {session_number}"),
            updated_at: "2026-01-01T00:00:00Z".into(),
            model: "synthetic".into(),
            event_count: events.len(),
            warnings: 0,
        };
        session_insert
            .execute(rusqlite::params![
                &session.id,
                &session.agent,
                &session.source_id,
                &session.source,
                &session.project,
                &session.title,
                &session.updated_at,
                &session.model,
                session.event_count,
                session.warnings
            ])
            .expect("session");
        search_insert
            .execute(rusqlite::params![
                &id,
                -1,
                &session.title,
                &session.project,
                ""
            ])
            .expect("session search");
        for event in events {
            event_insert
                .execute(rusqlite::params![
                    &id,
                    event.ordinal,
                    &event.kind,
                    &event.role,
                    &event.timestamp,
                    &event.text,
                    &event.name,
                    &event.call_id
                ])
                .expect("event");
            search_insert
                .execute(rusqlite::params![
                    &id,
                    event.ordinal,
                    "",
                    "",
                    format!("{} {}", event.name, event.text)
                ])
                .expect("event search");
        }
    }
    drop(search_insert);
    drop(event_insert);
    drop(session_insert);
    tx.commit().expect("commit");
    let index_elapsed = started.elapsed();
    let search_started = Instant::now();
    let hits = db.search("performance").expect("search");
    let search_elapsed = search_started.elapsed();
    assert!(
        hits.len() <= 80 && !hits.is_empty(),
        "search should return a bounded page"
    );
    let overview = db.overview("synthetic".into()).expect("overview");
    assert_eq!(overview.sessions, 10_000);
    assert_eq!(overview.events, 100_000);
    eprintln!("synthetic scale: import={index_elapsed:?}, search={search_elapsed:?}");
}
