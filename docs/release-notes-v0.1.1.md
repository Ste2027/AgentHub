## AgentHub v0.1.1

AgentHub now provides a complete, reviewable local workflow for moving useful context between Claude Code and OpenAI Codex. It also turns Skills and MCP from read-only inventories into guarded local resource managers.

### Highlights

- Populated, isolated demo mode with sessions, projects, memories, skills, MCP and handoff data.
- Claude/Codex session indexing, timelines, literal full-text search and direct result navigation.
- Editable cross-agent context packages with bounded Git context, selected memories and relevant skills; native clipboard copy plus Markdown/JSON export.
- Complete skill-package inspection, copy, duplicate, import/export, trash/restore and safe atomic `SKILL.md` editing.
- MCP JSON and TOML add/edit/duplicate/enable/disable/remove/copy with secret masking, backups, expected hashes, parse validation and automatic rollback.
- Reviewed GitHub skill marketplace installs with bounded trees, path-traversal protection, conflict detection and no script execution.
- Correct agent detection: only a discovered executable counts as installed; configuration and history are shown as separate signals.
- Refined onboarding, project/activity pages, dark/light themes, compact layouts, dialogs and compatibility matrix.
- Real Tauri screenshots, a 9-second handoff demo and a second skill-copy demo.

### Privacy and safety

All indexed history and memories remain local. AgentHub has no account, telemetry, cloud backend or automatic upload. Marketplace traffic occurs only after an explicit browse/inspect action. Transcript commands, downloaded scripts and MCP servers are never executed.

### Packaging

The release workflow builds unsigned Windows, macOS and Linux packages. Windows has been smoke-tested locally with isolated synthetic storage. macOS and Linux artifacts are built by GitHub Actions and are not run-tested on this Windows host.
