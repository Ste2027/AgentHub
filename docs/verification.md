# Verification record — v0.1.1

Development host: Windows x64, Node 24.16.0, Rust 1.94.1, bundled SQLite through rusqlite. Both dependency lockfiles are committed.

## Local quality gates

- Frontend: **29/29 tests passed** across 6 test files.
- Rust with the desktop feature: **34/34 tests passed**: 6 unit tests and 28 integration tests.
- TypeScript strict typecheck, ESLint, Vite production build and `git diff --check` passed.
- `cargo fmt --check` passed.
- Clippy passed for all targets with the desktop feature and warnings denied.
- Core optimized `cargo build --release --locked` passed.
- Full `tauri build --features desktop` passed and produced the release executable plus MSI and NSIS bundles.
- `npm audit` reported zero known vulnerabilities.

The test suites cover Claude/Codex parsing, malformed and oversized JSONL, duplicate records, incremental indexing, transaction rollback, literal FTS queries, filters, migrations, memory revisions/trash/import/export, bounded Git context, truthful analytics, skill package mutations, JSON/TOML MCP mutations, path traversal, marketplace warnings, stale hashes, secret masking and direct search navigation.

## Synthetic performance run

The in-memory scale fixture creates **10,000 sessions and 100,000 events** with no personal data:

- Transactional import and FTS population: **884.449 ms**
- Bounded FTS query: **181.174 ms**
- Full test including verification: **1.19 s**

Session and timeline APIs return bounded pages of 100 records/events.

## Windows production artifacts

| Artifact | Architecture | Size | SHA-256 |
| --- | --- | ---: | --- |
| `agenthub.exe` | x64 | 14,444,032 bytes | `8C4535F6EEB06E83683857735B6F9931174E92A4B2EC0ADACB88902869D876E4` |
| `AgentHub_0.1.1_x64_en-US.msi` | x64 | 5,103,616 bytes | `7FCFFFF99D6979B668A9F8E5C0FC379280816A65CA3F3A9D0859B06890E407AC` |
| `AgentHub_0.1.1_x64-setup.exe` | x64 | 3,540,220 bytes | `61554ABA1CCD64B6843407E500F57CC36DFD618C82C27EF1A4A6D7A1890BFFD2` |

The embedded release executable reports product/file version 0.1.1. Packages are unsigned.

## Native Windows smoke test

The optimized embedded executable was launched without a development server using `AGENTHUB_DEMO=1` and the isolated root `C:\AgentHubSmokeV011`. The test did not scan normal agent folders.

Verified in the real Tauri WebView:

- first-run onboarding advanced through all four steps;
- **Index my sessions** performed a real index request and reported 8 unchanged synthetic sessions;
- dashboard showed 8 sessions, 3 projects, 38 events and 12 tool calls;
- Ctrl+K searched for `timeout`, and selecting the result opened the exact recorded error session;
- Memories showed three local notes and explicit **Use in context** actions;
- Skills discovered four packages and exposed review/copy/duplicate/remove/export actions;
- MCP discovered four individual servers and masked `DEMO_TOKEN`;
- Claude Code session → Continue with another agent → OpenAI Codex built the context package;
- native clipboard copy completed and changed the action to **Copied**.

Dark theme, light theme and a 760×620 compact viewport were visually inspected. Every sidebar page and the principal dialogs were captured from the actual Tauri app with isolated synthetic data; see [gui-review.md](gui-review.md).

## Repository scan

Tracked and proposed release files were scanned for provider keys, GitHub tokens, private-key blocks, common personal home paths, the local username and common private email domains. No credential, personal transcript, database, log, backup or temporary file is included. The only generic `/home/` pattern is the intentionally synthetic demo layout assembled below its isolated demo root.

All Markdown relative links resolve. Generated screenshots display only `C:\AgentHubDemoData`; they contain no real user session or personal path. The app contains no telemetry SDK, account flow, cloud backend, automatic upload, shell execution plugin or skill execution path.

## CI and release artifacts

The tagged commit passed the public [Quality run](https://github.com/Ste2027/AgentHub/actions/runs/34020397968). The subsequent [Release run](https://github.com/Ste2027/AgentHub/actions/runs/34020745397) completed successfully on Windows, macOS and Ubuntu and published [AgentHub v0.1.1](https://github.com/Ste2027/AgentHub/releases/tag/v0.1.1) as a non-draft, non-prerelease release.

The seven release assets were checked through their public download URLs and returned HTTP 200:

- Windows x64: NSIS setup and MSI.
- macOS Apple Silicon: DMG and application tarball.
- Linux x86_64: AppImage, DEB and RPM.

Windows is run-tested locally. macOS and Linux bundles are build-verified by GitHub Actions and are not run-tested on this Windows host.
