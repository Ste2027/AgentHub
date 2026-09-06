## ContextMeld v0.2.0

AgentHub is now **ContextMeld**. The new name reflects the app's main purpose: bringing useful context from Claude Code and OpenAI Codex into one private, reviewable workspace.

This release also adds native automatic session indexing. ContextMeld watches only the supported local session directories it already detects, filters events to JSONL session files, groups rapid writes with a short debounce and imports only changed files. It does not poll, start an agent or upload session data.

The top bar shows the current watcher state. Settings lists the watched directories, reports the last automatic run and lets the user disable the feature. A manual full index remains available for first launch and as a fallback.

Existing v0.1.x data remains compatible. The application keeps the previous local database filename and Tauri identifier, accepts the old environment-variable names and can import archives and restore backups made under the AgentHub name.

Validation includes the complete frontend suite, Rust core and desktop suites, a real Windows filesystem-event test, formatting, Clippy and production builds. Release packages are unsigned.
