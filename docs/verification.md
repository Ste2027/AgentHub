# Verification record — v0.2.0

Verified on 2026-09-06 before tagging.

## Automated checks

| Area                               | Result                      |
| ---------------------------------- | --------------------------- |
| TypeScript typecheck               | Passed                      |
| ESLint                             | Passed with no warnings     |
| Frontend tests                     | 30 passed                   |
| Vite production build              | Passed                      |
| Rust desktop tests                 | 38 passed                   |
| Native Windows watcher integration | Passed                      |
| Rustfmt                            | Passed                      |
| Clippy, desktop and all targets    | Passed with warnings denied |

The watcher integration creates a real JSONL file under a temporary Claude session root, receives the operating-system event after the debounce, imports one session and verifies it in SQLite. Incremental-index tests also reject paths outside configured roots and skip unchanged files.

## Windows release artifact

| File                              |             Size | SHA-256                                                            |
| --------------------------------- | ---------------: | ------------------------------------------------------------------ |
| `contextmeld.exe`                 | 14,738,432 bytes | `245D209865757E667CDCE52C37AAB4020F70B858FCADF110E0F627BE8D19517F` |
| `ContextMeld_0.2.0_x64-setup.exe` |  3,604,116 bytes | `D72C26607EA21FDDF8AB75D03F22960B3B57AD634331CA0969F7D460BF7D0A4B` |

The optimized executable launched without a development server in isolated synthetic demo mode. Its embedded WebView reported the title `ContextMeld` at `tauri.localhost`; the process was then closed. No normal agent directory was scanned.

## Visual review

All current screenshots and the README tour were recaptured from the production Windows WebView with synthetic sessions, projects, memories, skills and MCP configuration. The review covered every navigation page, a session timeline, Context Export and Settings. The top bar displayed `Auto index on`; Settings displayed two synthetic watched roots with balanced spacing and no overflow at 1280×840.

The previous [v0.1.1 verification record](verification-v0.1.1.md) remains available for its historical artifacts and public CI links.

## Compatibility and privacy

- Existing v0.1.x databases remain at the historical application-data identifier and filename.
- The old demo/data environment variables, local preferences, archive markers and backup names remain readable.
- New archives, exports, backups, executable names and installer names use ContextMeld.
- Automatic indexing watches detected supported local roots only, never executes file contents and performs no network request.
- No personal session or machine-specific developer path is committed in source, fixtures or documentation.
