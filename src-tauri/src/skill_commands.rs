use crate::{
    desktop::{with_db, AppState},
    skills::Skill,
};
use serde::{Deserialize, Serialize};
use sha2::Digest;
use tauri::State;

fn validate_skill_path(path: &std::path::Path) -> Result<(), String> {
    if !crate::paths::is_local_absolute(path)
        || path.file_name().and_then(|v| v.to_str()) != Some("SKILL.md")
    {
        return Err("Only a local SKILL.md can be used".into());
    }
    Ok(())
}

#[derive(Serialize, Deserialize)]
struct SkillArchiveFile {
    path: String,
    text: String,
}

#[derive(Serialize, Deserialize)]
struct SkillArchive {
    format: String,
    version: usize,
    name: String,
    files: Vec<SkillArchiveFile>,
}

fn simple_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 96
        && name != "."
        && name != ".."
        && !name.contains(['/', '\\', ':'])
}

fn safe_relative(path: &std::path::Path) -> bool {
    path.components().count() <= 20
        && path
            .components()
            .all(|part| matches!(part, std::path::Component::Normal(_)))
}

fn collect_archive_files(
    root: &std::path::Path,
    directory: &std::path::Path,
    files: &mut Vec<SkillArchiveFile>,
    total: &mut usize,
) -> Result<(), String> {
    for entry in std::fs::read_dir(directory).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        if ty.is_symlink() {
            return Err("Skill archives cannot contain symbolic links".into());
        }
        if ty.is_dir() {
            collect_archive_files(root, &entry.path(), files, total)?;
            continue;
        }
        if !ty.is_file() {
            continue;
        }
        if files.len() >= 128 {
            return Err("Skill archive contains more than 128 files".into());
        }
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        if metadata.len() > 1_048_576 {
            return Err("A skill file is larger than 1 MiB".into());
        }
        let text = std::fs::read_to_string(entry.path())
            .map_err(|_| "Skill archives support UTF-8 text files only".to_string())?;
        *total += text.len();
        if *total > 4 * 1024 * 1024 {
            return Err("Skill archive is larger than 4 MiB".into());
        }
        let relative = entry
            .path()
            .strip_prefix(root)
            .map_err(|e| e.to_string())?
            .to_path_buf();
        if !safe_relative(&relative) {
            return Err("Unsafe skill archive path".into());
        }
        files.push(SkillArchiveFile {
            path: relative.to_string_lossy().replace('\\', "/"),
            text,
        });
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
    let demo_home = state.demo_root.as_ref().map(|root| root.join("home"));
    with_db(&state, move |db| {
        let projects = db
            .projects()
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(|p| p.path)
            .collect::<Vec<_>>();
        Ok(match demo_home {
            Some(home) => crate::skills::discover_at(&home, &projects),
            None => crate::skills::discover(&projects),
        })
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
pub async fn export_skill(path: String) -> Result<String, String> {
    let skill = std::path::PathBuf::from(path);
    validate_skill_path(&skill)?;
    let root = skill
        .parent()
        .ok_or_else(|| "Skill has no parent directory".to_string())?;
    let name = root
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Skill folder name is not valid UTF-8".to_string())?;
    if !simple_name(name) {
        return Err("Skill folder name is not portable".into());
    }
    let mut files = Vec::new();
    let mut total = 0;
    collect_archive_files(root, root, &mut files, &mut total)?;
    files.sort_by(|a, b| a.path.cmp(&b.path));
    if !files.iter().any(|file| file.path == "SKILL.md") {
        return Err("Skill archive is missing SKILL.md".into());
    }
    serde_json::to_string_pretty(&SkillArchive {
        format: "contextmeld.skill".into(),
        version: 1,
        name: name.into(),
        files,
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_skill_archive(json: String, destination_dir: String) -> Result<String, String> {
    if json.len() > 6 * 1024 * 1024 {
        return Err("Skill archive is larger than 6 MiB".into());
    }
    let archive: SkillArchive =
        serde_json::from_str(&json).map_err(|e| format!("Invalid skill archive: {e}"))?;
    if !matches!(
        archive.format.as_str(),
        "contextmeld.skill" | "agenthub.skill"
    ) || archive.version != 1
    {
        return Err("Unsupported skill archive format/version".into());
    }
    if !simple_name(&archive.name) || archive.files.is_empty() || archive.files.len() > 128 {
        return Err("Invalid skill archive metadata".into());
    }
    let root = std::path::PathBuf::from(destination_dir);
    if !crate::paths::is_local_absolute(&root) {
        return Err("Destination must be an absolute local directory".into());
    }
    let folder = root.join(&archive.name);
    if folder.exists() {
        return Err("A skill with this name already exists at the destination".into());
    }
    let mut seen = std::collections::BTreeSet::new();
    let mut total = 0usize;
    for file in &archive.files {
        let relative = std::path::PathBuf::from(&file.path);
        if !safe_relative(&relative) || !seen.insert(relative.clone()) {
            return Err("Skill archive contains an unsafe or duplicate path".into());
        }
        if file.text.len() > 1_048_576 {
            return Err("A skill file is larger than 1 MiB".into());
        }
        total += file.text.len();
        if total > 4 * 1024 * 1024 {
            return Err("Skill archive contents are larger than 4 MiB".into());
        }
    }
    if !seen.contains(&std::path::PathBuf::from("SKILL.md")) {
        return Err("Skill archive is missing SKILL.md".into());
    }
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let result = (|| {
        for file in &archive.files {
            let target = folder.join(&file.path);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let tmp = target.with_extension("contextmeld-import-tmp");
            std::fs::write(&tmp, file.text.as_bytes()).map_err(|e| e.to_string())?;
            std::fs::rename(&tmp, &target).map_err(|e| e.to_string())?;
            if std::fs::read_to_string(&target).ok().as_deref() != Some(file.text.as_str()) {
                return Err("Skill import verification failed".into());
            }
        }
        Ok(folder.to_string_lossy().into_owned())
    })();
    if result.is_err() {
        let _ = std::fs::remove_dir_all(&folder);
    }
    result
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
    let backup = p.with_file_name(format!("SKILL.md.contextmeld-backup-{stamp}"));
    std::fs::copy(&p, &backup).map_err(|e| e.to_string())?;
    crate::exports::replace_text(&p, &text)?;
    if std::fs::read_to_string(&p).ok().as_deref() != Some(text.as_str()) {
        let _ = std::fs::copy(&backup, &p);
        return Err("Skill verification failed; the previous file was restored".into());
    }
    Ok(backup.to_string_lossy().into_owned())
}
#[tauri::command]
pub async fn restore_skill(path: String, backup: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    let b = std::path::PathBuf::from(&backup);
    if !crate::paths::is_local_absolute(&p)
        || p.file_name().and_then(|v| v.to_str()) != Some("SKILL.md")
        || !crate::paths::is_local_absolute(&b)
        || b.parent() != p.parent()
        || !matches!(
            b
            .file_name()
            .and_then(|v| v.to_str())
            .unwrap_or(""),
            name if name.starts_with("SKILL.md.contextmeld-")
                || name.starts_with("SKILL.md.agenthub-")
        )
    {
        return Err("Invalid skill backup path".into());
    }
    let text = std::fs::read_to_string(&b).map_err(|e| e.to_string())?;
    crate::exports::replace_text(&p, &text)
}

#[tauri::command]
pub async fn copy_skill(path: String, destination_dir: String) -> Result<String, String> {
    let source = std::path::PathBuf::from(path);
    let destination_root = std::path::PathBuf::from(destination_dir);
    validate_skill_path(&source)?;
    if !crate::paths::is_local_absolute(&destination_root) {
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
pub async fn duplicate_skill(path: String, new_name: String) -> Result<String, String> {
    let source = std::path::PathBuf::from(path);
    validate_skill_path(&source)?;
    if !simple_name(&new_name) {
        return Err("Skill name must be a simple portable folder name".into());
    }
    let source_dir = source
        .parent()
        .ok_or_else(|| "Skill has no parent directory".to_string())?;
    let target = source_dir
        .parent()
        .ok_or_else(|| "Skill has no parent directory".to_string())?
        .join(new_name);
    if target.exists() {
        return Err("A skill with this name already exists beside the source".into());
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
    if !simple_name(&name) {
        return Err("Skill name must be a simple folder name".into());
    }
    if text.len() > 1_048_576 {
        return Err("SKILL.md is larger than 1 MiB".into());
    }
    let root = std::path::PathBuf::from(destination_dir);
    if !crate::paths::is_local_absolute(&root) {
        return Err("Destination must be an absolute local directory".into());
    }
    let folder = root.join(&name);
    if folder.exists() {
        return Err("A skill with this name already exists at the destination".into());
    }
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let target = folder.join("SKILL.md");
    let tmp = folder.join("SKILL.md.contextmeld-install-tmp");
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
    let source = p
        .parent()
        .ok_or_else(|| "Skill has no parent directory".to_string())?;
    let parent = source
        .parent()
        .ok_or_else(|| "Skill has no parent directory".to_string())?;
    let name = source
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Invalid skill folder name".to_string())?;
    if !simple_name(name) {
        return Err("Skill folder name is not portable".into());
    }
    let trash_root = parent.join(".contextmeld-trash");
    std::fs::create_dir_all(&trash_root).map_err(|e| e.to_string())?;
    let trash = trash_root.join(format!("{stamp}--{name}"));
    std::fs::rename(source, &trash).map_err(|e| e.to_string())?;
    Ok(trash.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn restore_deleted_skill(trash_path: String) -> Result<String, String> {
    let trash = std::path::PathBuf::from(trash_path);
    if !crate::paths::is_local_absolute(&trash)
        || !matches!(
            trash
                .parent()
                .and_then(std::path::Path::file_name)
                .and_then(|v| v.to_str()),
            Some(".contextmeld-trash" | ".agenthub-trash")
        )
    {
        return Err("Invalid ContextMeld skill trash path".into());
    }
    let stored = trash
        .file_name()
        .and_then(|v| v.to_str())
        .ok_or_else(|| "Invalid skill trash entry".to_string())?;
    let (_, name) = stored
        .split_once("--")
        .ok_or_else(|| "Invalid skill trash entry".to_string())?;
    if !simple_name(name) {
        return Err("Invalid skill trash entry".into());
    }
    let destination = trash
        .parent()
        .and_then(std::path::Path::parent)
        .ok_or_else(|| "Invalid skill trash location".to_string())?
        .join(name);
    if destination.exists() {
        return Err("A skill with this name already exists at the original location".into());
    }
    std::fs::rename(&trash, &destination).map_err(|e| e.to_string())?;
    if !destination.join("SKILL.md").is_file() {
        let _ = std::fs::rename(&destination, &trash);
        return Err("Restored folder does not contain SKILL.md".into());
    }
    Ok(destination.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::Digest;

    fn temp_root(label: &str) -> std::path::PathBuf {
        let id = format!(
            "contextmeld-{label}-{}",
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

        let duplicate = tauri::async_runtime::block_on(duplicate_skill(
            skill.to_string_lossy().into_owned(),
            "source-copy".into(),
        ))
        .unwrap();
        assert!(std::path::Path::new(&duplicate)
            .join("scripts/notes.txt")
            .exists());

        let archive =
            tauri::async_runtime::block_on(export_skill(skill.to_string_lossy().into_owned()))
                .unwrap();
        let imported = tauri::async_runtime::block_on(import_skill_archive(
            archive,
            root.join("archives").to_string_lossy().into_owned(),
        ))
        .unwrap();
        assert_eq!(
            std::fs::read_to_string(std::path::Path::new(&imported).join("scripts/notes.txt"))
                .unwrap(),
            "asset"
        );
        let malicious = r#"{"format":"contextmeld.skill","version":1,"name":"bad","files":[{"path":"SKILL.md","text":"ok"},{"path":"../escape.txt","text":"bad"}]}"#;
        assert!(tauri::async_runtime::block_on(import_skill_archive(
            malicious.into(),
            root.join("archives").to_string_lossy().into_owned(),
        ))
        .is_err());

        let trash =
            tauri::async_runtime::block_on(delete_skill(skill.to_string_lossy().into_owned()))
                .unwrap();
        assert!(!skill.exists());
        assert!(std::path::Path::new(&trash).exists());
        let restored = tauri::async_runtime::block_on(restore_deleted_skill(trash)).unwrap();
        assert!(std::path::Path::new(&restored).join("SKILL.md").exists());
        assert!(std::path::Path::new(&restored)
            .join("scripts/notes.txt")
            .exists());

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
