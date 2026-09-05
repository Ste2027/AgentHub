use crate::{adapters, database::Database, models::IndexProgress};
use std::{fs::File, io::BufReader, path::Path};
use walkdir::WalkDir;

fn fingerprint(path: &Path) -> Result<String, String> {
    let m = path.metadata().map_err(|e| e.to_string())?;
    let modified = m
        .modified()
        .map_err(|e| e.to_string())?
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    Ok(format!("v1:{}:{modified}", m.len()))
}
pub fn run(
    db: &mut Database,
    force: bool,
    emit: impl FnMut(&IndexProgress),
) -> Result<IndexProgress, String> {
    let agents = adapters::agents(&db.settings()?);
    run_with_agents(db, force, agents, emit)
}

pub fn run_with_agents(
    db: &mut Database,
    force: bool,
    agents: Vec<crate::models::Agent>,
    mut emit: impl FnMut(&IndexProgress),
) -> Result<IndexProgress, String> {
    let mut progress = IndexProgress::default();
    for agent in agents.into_iter().filter(|a| a.supported) {
        if !agent.sessions_detected {
            continue;
        }
        let adapter = adapters::adapter(&agent.id).ok_or("Unsupported adapter")?;
        let root = Path::new(&agent.path)
            .canonicalize()
            .map_err(|e| e.to_string())?;
        for entry in WalkDir::new(&root).follow_links(false).max_depth(20) {
            let entry = match entry {
                Ok(e) => e,
                Err(e) => {
                    issue(&mut progress, e.to_string());
                    continue;
                }
            };
            if !entry.file_type().is_file()
                || entry.path().extension().and_then(|s| s.to_str()) != Some("jsonl")
            {
                continue;
            }
            progress.scanned += 1;
            let result = (|| -> Result<bool, String> {
                let path = entry.path();
                let size = path.metadata().map_err(|e| e.to_string())?.len();
                if size > 128 * 1024 * 1024 {
                    return Err("File exceeds 128 MiB import limit".into());
                }
                let before = fingerprint(path)?;
                if !force && db.unchanged(&path.to_string_lossy(), &before)? {
                    return Ok(false);
                }
                let mut reader = BufReader::new(File::open(path).map_err(|e| e.to_string())?);
                let parsed = adapter.parse(&mut reader, path)?;
                if fingerprint(path)? != before {
                    return Err(
                        "File changed during indexing; retry after the agent finishes writing"
                            .into(),
                    );
                }
                db.import(&parsed, &before)?;
                progress.warnings += parsed.session.warnings;
                Ok(true)
            })();
            match result {
                Ok(true) => progress.indexed += 1,
                Ok(false) => progress.skipped += 1,
                Err(e) => issue(&mut progress, format!("{}: {e}", entry.path().display())),
            }
            emit(&progress);
        }
    }
    progress.done = true;
    emit(&progress);
    Ok(progress)
}
fn issue(progress: &mut IndexProgress, message: String) {
    progress.failed += 1;
    if progress.issues.len() < 50 {
        progress.issues.push(message);
    }
}
