# Local verification record

Development platform: Windows x64, Node 24.16.0, Rust 1.94.1, SQLite bundled through rusqlite. Dependency resolutions are recorded in both lockfiles.

Current result: **30 Rust tests and 17 frontend tests passed** on Windows; typecheck, ESLint, rustfmt and Clippy passed. Search-result navigation is tested for sessions outside the currently loaded page. Windows-only path tests reject UNC and device namespaces before filesystem probing.

Checks performed during development:

- TypeScript strict typecheck, ESLint and production Vite build.
- React behavior tests for the browser empty state, disabled local operations, accessible search shortcut, desktop session rendering, safe transcript text, indexing progress and settings IPC calls. Desktop IPC is mocked in these tests; they are not native end-to-end tests.
- Rust integration tests for both adapters, malformed and oversized records, duplicate handling, idempotence, transaction rollback, literal full-text queries, filters, settings persistence, schema reopen and incremental indexing recovery.
- Rust tests for memory revisions, trash/restore, atomic archives, context extraction, truthful analytics, read-only discovery and skill/MCP mutation workflows with backups.
- Synthetic scale test for 10,000 sessions and 100,000 events: in-memory import completed in 0.83s and bounded FTS search in 0.19s on the development machine.
- Frontend tests for memory editing, conflict preservation, archive export, context handoff, empty activity states and marketplace warning/metadata handling.
- Rust formatting and Clippy with warnings denied, including the Tauri desktop feature.
- Tauri Windows build with embedded frontend assets using `--debug --no-bundle`.
- Optimized Windows executable built with `npm run desktop:build -- --no-bundle`. The delivered release-mode executable was launched with isolated storage, stayed responsive, reported its AgentHub window and created the database without a development server.
- Full `npm run desktop` startup: native window responding and Vite HTTP 200. The Vite watcher excludes Rust build output to avoid Windows EBUSY errors; development CSP permits only the local development websocket in addition to IPC.
- Native startup smoke check using `AGENTHUB_DATA_DIR` under an isolated scratch directory: the executable stayed running and responding, reported an AgentHub window, and created its SQLite database. No personal sessions were indexed for this check.
- GitHub Actions release matrix for tag `v0.1.0`: Windows, macOS and Ubuntu jobs completed successfully and published seven platform release assets. The artifacts are unsigned.
- Browser visual inspection of the overview and settings, and keyboard-opened search with focus on the search field. The README screenshot is from the actual empty browser preview.

The Windows sandbox prevented the build tools from reading ancestor directories and prevented native startup. The checks succeeded outside that sandbox. This was an execution-environment restriction, not a workaround added to application code.

Not verified here: signed release installers, every provider version, large personal archives, or full native UI end-to-end flows. The macOS/Linux packages are CI-built artifacts and were not launched on this Windows host.
