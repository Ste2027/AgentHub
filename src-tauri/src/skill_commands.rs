use crate::{
    desktop::{with_db, AppState},
    skills::Skill,
};
use tauri::State;
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
pub async fn read_skill(path: String) -> Result<String, String> {
    let p = std::path::PathBuf::from(path);
    if !p.is_absolute() || p.file_name().and_then(|v| v.to_str()) != Some("SKILL.md") {
        return Err("Only a local SKILL.md can be opened".into());
    }
    let meta = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    if meta.len() > 1_048_576 {
        return Err("SKILL.md is larger than 1 MiB".into());
    }
    std::fs::read_to_string(p).map_err(|e| e.to_string())
}
