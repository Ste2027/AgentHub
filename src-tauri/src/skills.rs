use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Serialize)]
pub struct Skill {
    pub name: String,
    pub agent: String,
    pub path: String,
    pub description: String,
    pub scope: String,
    pub readable: bool,
    pub modified_at: String,
    pub files: Vec<String>,
}

fn frontmatter(text: &str) -> String {
    text.lines()
        .skip_while(|l| l.trim() != "---")
        .skip(1)
        .take_while(|l| l.trim() != "---")
        .find_map(|l| {
            l.strip_prefix("description:")
                .map(|v| v.trim().trim_matches(['"', '\'']))
        })
        .unwrap_or("")
        .chars()
        .take(500)
        .collect()
}
fn scan(root: &Path, agent: &str, scope: &str, out: &mut Vec<Skill>) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for e in entries.flatten() {
        let p = e.path();
        if !p.is_dir() {
            continue;
        }
        let file = p.join("SKILL.md");
        if file.is_file() {
            let text = fs::read_to_string(&file);
            let files = fs::read_dir(&p)
                .map(|entries| {
                    entries
                        .flatten()
                        .filter_map(|e| e.file_name().to_str().map(str::to_owned))
                        .filter(|n| n != "SKILL.md")
                        .take(100)
                        .collect()
                })
                .unwrap_or_default();
            let modified_at = fs::metadata(&file)
                .and_then(|m| m.modified())
                .ok()
                .map(|t| format!("{:?}", t))
                .unwrap_or_default();
            out.push(Skill {
                name: p
                    .file_name()
                    .and_then(|v| v.to_str())
                    .unwrap_or("unknown")
                    .to_owned(),
                agent: agent.to_owned(),
                path: file.to_string_lossy().into_owned(),
                description: text.as_deref().map(frontmatter).unwrap_or_default(),
                scope: scope.to_owned(),
                readable: text.is_ok(),
                modified_at,
                files,
            });
        }
    }
}
pub fn discover(projects: &[String]) -> Vec<Skill> {
    let mut out = Vec::new();
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    scan(&home.join(".agents/skills"), "codex", "user", &mut out);
    scan(&home.join(".claude/skills"), "claude", "user", &mut out);
    for project in projects {
        let p = Path::new(project);
        scan(&p.join(".agents/skills"), "codex", "project", &mut out);
        scan(&p.join(".claude/skills"), "claude", "project", &mut out);
    }
    out.sort_by(|a, b| {
        a.agent
            .cmp(&b.agent)
            .then(a.name.cmp(&b.name))
            .then(a.path.cmp(&b.path))
    });
    out
}
