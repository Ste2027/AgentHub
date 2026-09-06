use crate::{
    database::Database,
    memories::MemoryDraft,
    models::{Agent, IndexProgress, Settings},
};
use serde_json::json;
use std::path::{Path, PathBuf};

fn write_lines(path: &Path, values: &[serde_json::Value]) -> Result<(), String> {
    let parent = path.parent().ok_or("Demo source has no parent directory")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut text = values
        .iter()
        .map(serde_json::Value::to_string)
        .collect::<Vec<_>>()
        .join("\n");
    text.push('\n');
    crate::exports::replace_text(path, &text)
}

fn claude_session(
    source: &Path,
    id: &str,
    project: &Path,
    title: &str,
    date: &str,
    error: bool,
) -> Result<(), String> {
    let call_id = format!("tool-{id}");
    let project = project.to_string_lossy();
    let mut values = vec![
        json!({"type":"user","uuid":format!("user-{id}"),"sessionId":id,"cwd":project,"timestamp":format!("{date}T09:00:00Z"),"message":{"role":"user","content":title}}),
        json!({"type":"assistant","uuid":format!("assistant-{id}"),"sessionId":id,"timestamp":format!("{date}T09:01:00Z"),"message":{"model":"claude-sonnet-demo","content":[{"type":"text","text":"I reviewed the implementation.\nDecision: keep persistence local and transactional.\nTODO: run the desktop smoke test."},{"type":"tool_use","id":call_id,"name":"Bash","input":{"command":"npm test"}},{"type":"tool_use","id":format!("edit-{id}"),"name":"Edit","input":{"file_path":format!("{project}/src/session.ts")}}]}}),
        json!({"type":"user","uuid":format!("result-{id}"),"sessionId":id,"timestamp":format!("{date}T09:02:00Z"),"message":{"content":[{"type":"tool_result","tool_use_id":call_id,"is_error":error,"content":if error { "One synthetic assertion failed" } else { "All synthetic tests passed" }}]}}),
    ];
    if error {
        values.push(json!({"type":"assistant","uuid":format!("recovery-{id}"),"sessionId":id,"timestamp":format!("{date}T09:03:00Z"),"message":{"model":"claude-sonnet-demo","content":"The failure is isolated to the demo fixture; no real files were touched."}}));
    }
    write_lines(source, &values)
}

fn codex_session(
    source: &Path,
    id: &str,
    project: &Path,
    title: &str,
    date: &str,
    error: bool,
) -> Result<(), String> {
    let project = project.to_string_lossy();
    let call_id = format!("call-{id}");
    let mut values = vec![
        json!({"type":"session_meta","timestamp":format!("{date}T13:00:00Z"),"payload":{"id":id,"cwd":project}}),
        json!({"type":"turn_context","payload":{"model":"gpt-demo-codex","cwd":project}}),
        json!({"type":"response_item","timestamp":format!("{date}T13:01:00Z"),"payload":{"type":"message","role":"user","content":[{"type":"input_text","text":title}]}}),
        json!({"type":"response_item","timestamp":format!("{date}T13:02:00Z"),"payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Decision: preserve the existing schema during migration.\nTODO: verify the release artifact."}]}}),
        json!({"type":"response_item","timestamp":format!("{date}T13:03:00Z"),"payload":{"type":"function_call","name":"exec_command","call_id":call_id,"arguments":json!({"cmd":"cargo test --locked"}).to_string()}}),
        json!({"type":"response_item","timestamp":format!("{date}T13:04:00Z"),"payload":{"type":"function_call_output","call_id":call_id,"output":if error { "Synthetic compile error in demo module" } else { "All synthetic Rust tests passed" }}}),
    ];
    if error {
        values.push(json!({"type":"event_msg","timestamp":format!("{date}T13:05:00Z"),"payload":{"type":"error","message":"Synthetic compile error in demo module"}}));
    }
    write_lines(source, &values)
}

fn run_demo_git(root: &Path, args: &[&str]) -> bool {
    let Some(executable) = crate::paths::local_executable("git") else {
        return false;
    };
    std::process::Command::new(executable)
        .arg("-C")
        .arg(root)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn prepare_demo_repository(project: &Path) -> Result<(), String> {
    let source = project.join("src/session.ts");
    if !project.join(".git/objects").is_dir() {
        let _ = std::fs::remove_dir_all(project.join(".git"));
        if !run_demo_git(
            project,
            &["-c", "init.templateDir=", "init", "-q", "-b", "main"],
        ) {
            std::fs::create_dir_all(project.join(".git")).map_err(|e| e.to_string())?;
            return crate::exports::replace_text(
                &project.join(".git/HEAD"),
                "ref: refs/heads/main\n",
            );
        }
        crate::exports::replace_text(&source, "export const handoffState = 'ready for review';\n")?;
        if run_demo_git(project, &["add", "src/session.ts"]) {
            run_demo_git(
                project,
                &[
                    "-c",
                    "user.name=ContextMeld Demo",
                    "-c",
                    "user.email=demo@invalid",
                    "-c",
                    "core.hooksPath=",
                    "commit",
                    "-q",
                    "-m",
                    "Synthetic baseline",
                ],
            );
        }
    }
    crate::exports::replace_text(
        &source,
        "export const handoffState = 'validated locally';\n",
    )
}

pub fn agents(root: &Path) -> Vec<Agent> {
    let home = root.join("home");
    let sources = root.join("sources");
    [
        (
            "claude",
            "Claude Code",
            true,
            home.join(".claude"),
            sources.join("claude"),
        ),
        (
            "codex",
            "OpenAI Codex",
            true,
            home.join(".codex"),
            sources.join("codex"),
        ),
        (
            "cursor",
            "Cursor",
            false,
            home.join(".cursor"),
            PathBuf::new(),
        ),
        (
            "gemini",
            "Gemini CLI",
            false,
            home.join(".gemini"),
            PathBuf::new(),
        ),
        (
            "opencode",
            "OpenCode",
            false,
            home.join(".config/opencode"),
            PathBuf::new(),
        ),
        (
            "copilot",
            "GitHub Copilot",
            false,
            home.join(".copilot"),
            PathBuf::new(),
        ),
    ]
    .into_iter()
    .map(|(id, name, supported, config, sessions)| Agent {
        id: id.into(),
        name: name.into(),
        supported,
        detected: supported,
        installation_detected: supported,
        config_detected: true,
        sessions_detected: supported,
        adapter_status: if supported {
            "Supported"
        } else {
            "Detection only"
        }
        .into(),
        config_path: config.to_string_lossy().into_owned(),
        path: sessions.to_string_lossy().into_owned(),
    })
    .collect()
}

pub fn prepare(root: &Path, db: &mut Database) -> Result<IndexProgress, String> {
    let home = root.join("home");
    let sources = root.join("sources");
    for directory in [
        home.join(".claude"),
        home.join(".codex"),
        home.join(".cursor"),
        home.join(".gemini"),
        home.join(".config/opencode"),
        home.join(".copilot"),
    ] {
        std::fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    }
    let projects = [
        root.join("projects/atlas-desktop"),
        root.join("projects/orbit-api"),
        root.join("projects/lumen-web"),
    ];
    for project in &projects {
        std::fs::create_dir_all(project.join("src")).map_err(|e| e.to_string())?;
        prepare_demo_repository(project)?;
    }
    let claude = [
        (
            "claude-a",
            0,
            "Repair the session handoff flow",
            "2026-09-05",
            false,
        ),
        (
            "claude-b",
            1,
            "Trace an intermittent API timeout",
            "2026-09-04",
            true,
        ),
        (
            "claude-c",
            2,
            "Polish the local-first onboarding",
            "2026-09-03",
            false,
        ),
        (
            "claude-d",
            0,
            "Review SQLite migration safety",
            "2026-09-02",
            false,
        ),
    ];
    for (id, project, title, date, error) in claude {
        claude_session(
            &sources.join("claude").join(format!("{id}.jsonl")),
            id,
            &projects[project],
            title,
            date,
            error,
        )?;
    }
    let codex = [
        (
            "codex-a",
            0,
            "Complete the release validation",
            "2026-09-05",
            false,
        ),
        (
            "codex-b",
            1,
            "Add exact universal search routing",
            "2026-09-04",
            false,
        ),
        (
            "codex-c",
            2,
            "Investigate a synthetic build failure",
            "2026-09-03",
            true,
        ),
        (
            "codex-d",
            0,
            "Document the adapter boundary",
            "2026-09-01",
            false,
        ),
    ];
    for (id, project, title, date, error) in codex {
        codex_session(
            &sources.join("codex").join(format!("{id}.jsonl")),
            id,
            &projects[project],
            title,
            date,
            error,
        )?;
    }
    db.save_settings(&Settings {
        claude_path: sources.join("claude").to_string_lossy().into_owned(),
        codex_path: sources.join("codex").to_string_lossy().into_owned(),
        light_mode: false,
        auto_index: true,
    })?;
    let progress = crate::indexer::run_with_agents(db, true, agents(root), |_| {})?;
    if db.memories("", "", false, 0)?.total == 0 {
        for draft in [
            MemoryDraft {
                title: "Local-first release rule".into(),
                body: "Never upload transcripts, paths, memories or configuration automatically."
                    .into(),
                scope: "global".into(),
                tags: vec!["privacy".into(), "release".into()],
                ..MemoryDraft::default()
            },
            MemoryDraft {
                title: "Atlas database decision".into(),
                body: "Use transactions for imports and preserve v0.1 data through migrations."
                    .into(),
                scope: "project".into(),
                project: projects[0].to_string_lossy().into_owned(),
                tags: vec!["sqlite".into()],
                ..MemoryDraft::default()
            },
            MemoryDraft {
                title: "Codex handoff preference".into(),
                body: "Export only the selected memories and a concise task state.".into(),
                scope: "agent".into(),
                agents: vec!["codex".into()],
                tags: vec!["handoff".into()],
                ..MemoryDraft::default()
            },
        ] {
            db.save_memory(draft)?;
        }
    }
    let skills = [
        (
            home.join(".claude/skills/release-checklist"),
            "Release checklist",
            "Validate tests, artifacts and release visibility before announcing completion.",
        ),
        (
            home.join(".agents/skills/sqlite-safety"),
            "SQLite safety",
            "Use transactions, versioned migrations and rollback checks for local data.",
        ),
        (
            home.join(".agents/skills/ui-review"),
            "UI review",
            "Inspect every route at desktop and compact window sizes with keyboard navigation.",
        ),
        (
            projects[0].join(".agents/skills/context-handoff"),
            "Context handoff",
            "Prepare a concise cross-agent package with selected memories and unresolved work.",
        ),
    ];
    for (folder, title, description) in skills {
        std::fs::create_dir_all(folder.join("references")).map_err(|e| e.to_string())?;
        crate::exports::replace_text(
            &folder.join("SKILL.md"),
            &format!(
                "---\nname: {}\ndescription: {}\n---\n\n# {}\n\n{}\n",
                title.to_lowercase().replace(' ', "-"),
                description,
                title,
                description
            ),
        )?;
        crate::exports::replace_text(
            &folder.join("references/checks.md"),
            "- Review the diff\n- Run relevant tests\n- Record limitations\n",
        )?;
    }
    crate::exports::replace_text(
        &home.join(".claude.json"),
        "{\n  \"mcpServers\": {\n    \"local-files\": {\n      \"command\": \"node\",\n      \"args\": [\"demo-files-server.js\"],\n      \"env\": {\"DEMO_TOKEN\": \"${DEMO_TOKEN}\"}\n    },\n    \"issue-tracker\": {\n      \"url\": \"http://127.0.0.1:7331/mcp\",\n      \"disabled\": true\n    }\n  }\n}\n",
    )?;
    crate::exports::replace_text(
        &home.join(".codex/config.toml"),
        "[mcp_servers.docs]\ncommand = \"node\"\nargs = [\"demo-docs-server.js\"]\n\n[mcp_servers.preview]\nurl = \"http://127.0.0.1:7441/mcp\"\n",
    )?;
    Ok(progress)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn demo_is_populated_only_under_its_explicit_root() {
        let temp = tempfile::tempdir().unwrap();
        let mut db = Database::open(&temp.path().join("demo.db")).unwrap();
        let progress = prepare(temp.path(), &mut db).unwrap();
        assert_eq!(progress.indexed, 8);
        assert_eq!(
            db.overview_with_agents("demo".into(), agents(temp.path()), true)
                .unwrap()
                .sessions,
            8
        );
        assert_eq!(db.memories("", "", false, 0).unwrap().total, 3);
        let projects = db.projects().unwrap();
        let atlas = projects
            .iter()
            .find(|project| project.name == "atlas-desktop")
            .unwrap();
        assert_eq!(atlas.branch, "main");
        assert_eq!(atlas.memories, 1);
        assert_eq!(atlas.skills, 1);
        assert!(!atlas.recent_activity.is_empty());
        assert!(!atlas.modified_files.is_empty());
        assert!(projects.iter().map(|project| project.errors).sum::<usize>() >= 2);
        for skill in crate::skills::discover_at(&temp.path().join("home"), &[]) {
            assert!(Path::new(&skill.path).starts_with(temp.path()));
        }
        for server in crate::mcp::discover_at(&temp.path().join("home"), &[]) {
            assert!(Path::new(&server.config_path).starts_with(temp.path()));
        }
    }
}
