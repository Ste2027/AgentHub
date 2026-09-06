use contextmeld_core::mcp::discover;
use contextmeld_core::skills::discover as discover_skills;
use std::{fs, path::PathBuf};

#[test]
fn discovery_is_empty_for_missing_paths_and_does_not_probe_network() {
    let missing = PathBuf::from("C:/contextmeld-test-project-that-does-not-exist");
    let servers = discover(&[missing.to_string_lossy().into_owned()]);
    assert!(servers
        .iter()
        .all(|s| !s.config_path.contains("contextmeld-test-project")));
    let skills = discover_skills(&[missing.to_string_lossy().into_owned()]);
    assert!(skills
        .iter()
        .all(|s| !s.path.contains("contextmeld-test-project")));
}

#[test]
fn project_claude_mcp_json_is_read_without_exposing_secret_values() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join(".mcp.json"), r#"{"mcpServers":{"local":{"command":"node","args":["server.js"],"env":{"TOKEN":"secret"}}}}"#).unwrap();
    let servers: Vec<_> = discover(&[dir.path().to_string_lossy().into_owned()])
        .into_iter()
        .filter(|s| s.scope == "project")
        .collect();
    assert_eq!(servers.len(), 1);
    assert_eq!(servers[0].name, "local");
    assert_eq!(servers[0].command.as_deref(), Some("node"));
    assert_eq!(servers[0].env_keys, vec!["TOKEN"]);
}
