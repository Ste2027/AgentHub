use crate::{
    desktop::{with_db, AppState},
    skills::Skill,
};
use serde::Serialize;
use sha2::Digest;
use tauri::State;

fn validate_skill_path(path: &std::path::Path) -> Result<(), String> {
    if !path.is_absolute() || path.file_name().and_then(|v| v.to_str()) != Some("SKILL.md") {
        return Err("Only a local SKILL.md can be used".into());
    }
    Ok(())
}

fn copy_dir(source: &std::path::Path, destination: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(destination).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        let target = destination.join(entry.file_name());
        if ty.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else if ty.is_file() {
            std::fs::copy(entry.path(), target).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
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
    validate_skill_path(&p)?;
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
            .starts_with("SKILL.md.agenthub-")
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

#[tauri::command]
pub async fn copy_skill(path: String, destination_dir: String) -> Result<String, String> {
    let source = std::path::PathBuf::from(path);
    let destination_root = std::path::PathBuf::from(destination_dir);
    validate_skill_path(&source)?;
    if !destination_root.is_absolute() {
        return Err("Destination must be an absolute local directory".into());
    }
    let source_dir = source
        .parent()
        .ok_or_else(|| "Skill has no parent directory".to_string())?;
    let name = source_dir
        .file_name()
        .ok_or_else(|| "Skill directory has no name".to_string())?;
    let target = destination_root.join(name);
    if target.exists() {
        return Err("A skill with this name already exists at the destination".into());
    }
    copy_dir(source_dir, &target)?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn install_skill(
    name: String,
    text: String,
    destination_dir: String,
) -> Result<String, String> {
    if name.is_empty()
        || name.len() > 96
        || name == "."
        || name == ".."
        || name.contains(['/', '\\', ':'])
    {
        return Err("Skill name must be a simple folder name".into());
    }
    if text.len() > 1_048_576 {
        return Err("SKILL.md is larger than 1 MiB".into());
    }
    let root = std::path::PathBuf::from(destination_dir);
    if !root.is_absolute() {
        return Err("Destination must be an absolute local directory".into());
    }
    let folder = root.join(&name);
    if folder.exists() {
        return Err("A skill with this name already exists at the destination".into());
    }
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let target = folder.join("SKILL.md");
    let tmp = folder.join("SKILL.md.agenthub-install-tmp");
    if let Err(e) = std::fs::write(&tmp, text.as_bytes()) {
        let _ = std::fs::remove_dir_all(&folder);
        return Err(e.to_string());
    }
    if let Err(e) = std::fs::rename(&tmp, &target) {
        let _ = std::fs::remove_dir_all(&folder);
        return Err(e.to_string());
    }
    Ok(folder.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn delete_skill(path: String) -> Result<String, String> {
    let p = std::path::PathBuf::from(path);
    validate_skill_path(&p)?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let trash = p.with_file_name(format!("SKILL.md.agenthub-trash-{stamp}"));
    std::fs::rename(&p, &trash).map_err(|e| e.to_string())?;
    Ok(trash.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::Digest;

    fn temp_root(label: &str) -> std::path::PathBuf {
        let id = format!(
            "agenthub-{label}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let root = std::env::temp_dir().join(id);
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn skill_mutations_backup_restore_copy_install_and_trash() {
        let root = temp_root("skill");
        let skill_dir = root.join("source");
        std::fs::create_dir_all(skill_dir.join("scripts")).unwrap();
        let skill = skill_dir.join("SKILL.md");
        std::fs::write(&skill, "old skill\n").unwrap();
        std::fs::write(skill_dir.join("scripts").join("notes.txt"), "asset").unwrap();
        let old_hash = format!("{:x}", sha2::Sha256::digest(b"old skill\n"));

        let backup = tauri::async_runtime::block_on(save_skill(
            skill.to_string_lossy().into_owned(),
            "new skill\n".into(),
            old_hash,
        ))
        .unwrap();
        assert_eq!(std::fs::read_to_string(&skill).unwrap(), "new skill\n");
        assert!(std::path::Path::new(&backup).exists());

        tauri::async_runtime::block_on(restore_skill(skill.to_string_lossy().into_owned(), backup))
            .unwrap();
        assert_eq!(std::fs::read_to_string(&skill).unwrap(), "old skill\n");

        let copied = tauri::async_runtime::block_on(copy_skill(
            skill.to_string_lossy().into_owned(),
            root.join("copied").to_string_lossy().into_owned(),
        ))
        .unwrap();
        assert!(std::path::Path::new(&copied).join("SKILL.md").exists());
        assert!(std::path::Path::new(&copied)
            .join("scripts/notes.txt")
            .exists());

        let trash =
            tauri::async_runtime::block_on(delete_skill(skill.to_string_lossy().into_owned()))
                .unwrap();
        assert!(!skill.exists());
        assert!(std::path::Path::new(&trash).exists());

        let installed = tauri::async_runtime::block_on(install_skill(
            "imported".into(),
            "# imported\n".into(),
            root.join("installed").to_string_lossy().into_owned(),
        ))
        .unwrap();
        assert_eq!(
            std::fs::read_to_string(std::path::Path::new(&installed).join("SKILL.md")).unwrap(),
            "# imported\n"
        );
        let _ = std::fs::remove_dir_all(root);
    }
}
