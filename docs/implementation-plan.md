# Full application completion plan

Goal: finish the full AgentHub product described in the original specification, verify it, publish the source publicly on GitHub, and deliver an accurate user-facing capability guide. The MVP is the baseline, not the completion criterion.

## Verified baseline — 0.1

- [x] Tauri desktop launch, Rust/React architecture, SQLite migrations.
- [x] Claude Code and Codex session adapters, incremental indexing and diagnostics.
- [x] Session browser, paginated timeline, project discovery, local search and settings.
- [x] Local-first operation and no telemetry or fabricated metrics.
- [x] Windows optimized binary; baseline tests and local startup checks.

## Product completion gates

- [ ] Memories: global/project/agent scope, CRUD, tags, search, import/export, and clear agent associations.
- [ ] Skills: local discovery, content/metadata/assets inspection, create/edit/duplicate, enable/disable, import/export, compatibility and previewed synchronization.
- [ ] MCP: verified Claude/Codex configuration discovery, command/args/env inspection, edit and enable/disable, explicit connection tests, previewed compatible synchronization with backups and conflict detection.
- [ ] Cross-agent continuation: editable structured context containing task, decisions, modified files, commands, errors and remaining TODOs; export without executing agent commands.
- [ ] Analytics: truthful sessions, model/tool/command/error/file activity and per-agent comparisons. Token data only for supported, correctly deduplicated source fields; unknown values remain unknown.
- [ ] Expanded project detail and universal search covering all implemented data domains, including filenames, skills, memories and MCP servers.
- [ ] Index management, cancellation/responsiveness, clear empty/error/loading states, keyboard accessibility and appearance parity.
- [ ] Regression coverage for migrations, imports, provider formats, configuration writes and rollback, search and UI workflows.
- [ ] Native build/startup and visual verification of new pages; end-user feature guide and maintained changelog/version history.
- [ ] Public GitHub repository with reviewed source only, CI, license, contributor/security documentation and downloadable release artifacts. Verify the public URL and release state.

Additional agents remain explicitly unsupported until their real formats are implemented and verified; the requested placeholder adapters must never claim live compatibility. Optional cloud sync is not enabled by default or used as a prerequisite for local operation. Community adapter documentation must explain how to add verified providers.

## Current development sequence

1. Persistent memory library and import/export, with migration and UI tests.
2. Structured context export and source-grounded analytics.
3. Skills and MCP management, verified formats and safe explicit writes.
4. Integrate search/project views and finish interaction/performance checks.
5. Audit every gate, publish and verify GitHub/release artifacts, then deliver the full capability guide.

No unchecked gate can be treated as complete merely because the build is green. Record evidence in verification.md and update this plan as capabilities are verified.
