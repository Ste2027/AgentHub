use std::{io::Write, path::Path};

/// Explicit user-selected export only. No agent configuration is modified here.
pub fn write_text(path: &Path, text: &str) -> Result<(), String> {
    if !crate::paths::is_local_absolute(path) {
        return Err("Choose an absolute local export path".into());
    }
    if !matches!(
        path.extension().and_then(|s| s.to_str()),
        Some("json" | "md" | "txt")
    ) {
        return Err("Export as .json, .md or .txt".into());
    }
    if text.len() > 8 * 1024 * 1024 {
        return Err("Export exceeds 8 MiB".into());
    }
    let parent = path.parent().ok_or("No export directory")?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temp.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    temp.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}
