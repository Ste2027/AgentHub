use std::path::Path;

/// Reject network/device namespaces before probing paths supplied by transcripts.
pub fn is_local_absolute(path: &Path) -> bool {
    if !path.is_absolute() {
        return false;
    }
    #[cfg(windows)]
    {
        use std::path::{Component, Prefix};
        matches!(path.components().next(), Some(Component::Prefix(p)) if matches!(p.kind(), Prefix::Disk(_) | Prefix::VerbatimDisk(_)))
    }
    #[cfg(not(windows))]
    {
        true
    }
}

pub fn has_local_git_marker(path: &Path) -> bool {
    is_local_absolute(path)
        && std::fs::symlink_metadata(path.join(".git"))
            .map(|m| m.is_dir() || m.is_file())
            .unwrap_or(false)
}

pub fn git_branch(path: &Path) -> String {
    if !is_local_absolute(path) {
        return String::new();
    }
    let marker = path.join(".git");
    let git_dir = if marker.is_dir() {
        marker
    } else {
        let Ok(link) = std::fs::read_to_string(&marker) else {
            return String::new();
        };
        let Some(value) = link.trim().strip_prefix("gitdir:") else {
            return String::new();
        };
        let candidate = Path::new(value.trim());
        let resolved = if candidate.is_absolute() {
            candidate.to_path_buf()
        } else {
            path.join(candidate)
        };
        if !is_local_absolute(&resolved) {
            return String::new();
        }
        resolved
    };
    let head = git_dir.join("HEAD");
    if std::fs::metadata(&head)
        .map(|metadata| metadata.len() > 8192)
        .unwrap_or(true)
    {
        return String::new();
    }
    let Ok(value) = std::fs::read_to_string(head) else {
        return String::new();
    };
    let value = value.trim();
    value
        .strip_prefix("ref: refs/heads/")
        .map(str::to_owned)
        .unwrap_or_else(|| value.chars().take(12).collect())
}
