# Changelog

## 0.2.0 — 2026-09-06

- Renamed the product and repository from AgentHub to ContextMeld after a category collision review.
- Added native automatic indexing for supported Claude Code and OpenAI Codex session folders.
- Added debounced, bounded processing of changed JSONL files without polling or full-directory rescans.
- Added watcher state to the top bar and Settings, with a manual-index fallback and a user-controlled off switch.
- Preserved the v0.1.x database location, application identifier, environment variables, local preferences and import formats.
- Added native watcher, incremental-indexing and UI regression coverage.

## 0.1.1 — 2026-09-06

- Added an isolated synthetic demo workspace and real populated product visuals.
- Completed cross-agent context review, native clipboard copy and Markdown/JSON export.
- Added full skill-package copy, duplicate, import/export, trash/restore and guarded editing.
- Added safe Claude JSON and Codex TOML MCP mutations with secret masking and rollback.
- Completed bounded marketplace package inspection and atomic installation.
- Expanded project details, activity, universal search routing and onboarding indexing.
- Corrected installation detection so config/session remnants do not count as installed apps.
- Refined the compatibility matrix, dialogs, responsive layout and light theme.
- Added security, migration, performance and UI regression coverage.

## 0.1.0 — 2026-09-02

- Initial Tauri desktop application with React, TypeScript, Rust and SQLite.
- Read-only Claude Code and OpenAI Codex session adapters.
- Session browser, timelines, projects, local full-text search and path settings.
- Windows, macOS and Linux release workflow.
