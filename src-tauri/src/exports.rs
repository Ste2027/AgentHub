use std::{io::Write, path::Path};

/// Replace a local file with a fully flushed temporary file in the same directory.
/// `NamedTempFile::persist` uses the platform replacement primitive, including on
/// Windows where `std::fs::rename` cannot overwrite an existing file.
pub fn replace_text(path: &Path, text: &str) -> Result<(), String> {
    let parent = path.parent().ok_or("No destination directory")?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temp.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    temp.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}

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
    replace_text(path, text)
}
