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
