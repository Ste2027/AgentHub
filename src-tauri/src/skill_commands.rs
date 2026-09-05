use crate::{
    desktop::{with_db, AppState},
    skills::Skill,
};
use serde::Serialize;
use sha2::Digest;
use tauri::State;
#[derive(Serialize)]
pub struct SkillFile {
    pub text: String,
    pub hash: String,
}
#[tauri::command]
pub async fn list_skills(state: State<'_, AppState>) -> Result<Vec<Skill>, String> {
    with_db(&state, |db| {
        let projects = db
            .projects()
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(|p| p.path)
            .collect::<Vec<_>>();
        Ok(crate::skills::discover(&projects))
    })
    .await
}
#[tauri::command]
pub async fn read_skill(path: String) -> Result<SkillFile, String> {
    let p = std::path::PathBuf::from(path);
    if !p.is_absolute() || p.file_name().and_then(|v| v.to_str()) != Some("SKILL.md") {
        return Err("Only a local SKILL.md can be opened".into());
    }
    let meta = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    if meta.len() > 1_048_576 {
        return Err("SKILL.md is larger than 1 MiB".into());
    }
    let text = std::fs::read_to_string(p).map_err(|e| e.to_string())?;
    let hash = format!("{:x}", sha2::Sha256::digest(text.as_bytes()));
    Ok(SkillFile { text, hash })
}
#[tauri::command]
pub async fn save_skill(path: String, text: String, expected: String) -> Result<String, String> {
    let p = std::path::PathBuf::from(&path);
    if !p.is_absolute() || p.file_name().and_then(|v| v.to_str()) != Some("SKILL.md") {
        return Err("Only a local SKILL.md can be edited".into());
    }
    if text.len() > 1_048_576 {
        return Err("SKILL.md is larger than 1 MiB".into());
    }
    let current = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    let digest = format!("{:x}", sha2::Sha256::digest(current.as_bytes()));
    if digest != expected {
        return Err("This skill changed on disk. Reload it before saving.".into());
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let backup = p.with_file_name(format!("SKILL.md.agenthub-backup-{stamp}"));
    std::fs::copy(&p, &backup).map_err(|e| e.to_string())?;
    let tmp = p.with_file_name(format!("SKILL.md.agenthub-tmp-{stamp}"));
    std::fs::write(&tmp, text.as_bytes()).map_err(|e| e.to_string())?;
    if let Err(e) = std::fs::rename(&tmp, &p) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }
    Ok(backup.to_string_lossy().into_owned())
}
#[tauri::command]
pub async fn restore_skill(path: String, backup: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    let b = std::path::PathBuf::from(&backup);
    if !p.is_absolute()
        || p.file_name().and_then(|v| v.to_str()) != Some("SKILL.md")
        || !b.is_absolute()
        || b.parent() != p.parent()
        || !b
            .file_name()
            .and_then(|v| v.to_str())
            .unwrap_or("")
            .starts_with("SKILL.md.agenthub-backup-")
    {
        return Err("Invalid skill backup path".into());
    }
    let text = std::fs::read_to_string(&b).map_err(|e| e.to_string())?;
    let tmp = p.with_file_name("SKILL.md.agenthub-restore-tmp");
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    if let Err(e) = std::fs::rename(&tmp, &p) {
        let _ = std::fs::remove_file(tmp);
        return Err(e.to_string());
    }
    Ok(())
}
