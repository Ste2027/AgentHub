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
