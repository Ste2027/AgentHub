# Architecture decisions

## Boundaries

The React application only invokes typed commands. It cannot read directories or run shell commands. Tauri owns a single SQLite connection behind a mutex, and runs blocking operations in its background runtime. Providers implement an isolated Rust parsing trait; the core has no dependency on Tauri unless the `desktop` feature is enabled.

The current TypeScript models mirror serialized Rust structs. Rust integration tests and frontend tests protect the boundary, but generated cross-language bindings are a future improvement.

## Persistence

Migration 001 creates agent, project, session, event, settings and indexed-file tables, with a separate FTS5 index. Foreign keys enforce event ownership. Schema changes must be additive, transactional migrations, never edits to a released migration. Databases from newer schema versions are rejected.

Each import uses one transaction: upsert project, replace the session's events and FTS rows, then update the fingerprint. A failure rolls back to the previous searchable session. The source file is never changed. Reindexing the same source path is idempotent. Source paths use OS canonical roots; IDs use SHA-256(provider namespace + source identity) via a provider-prefixed path hash, not unstable process hashes.

FTS stores text separately because it is a derived index. Search input is bound as a parameter and each token is quoted, so SQL and FTS operators in a query are treated as literal data. Displayed transcript content is escaped by React, without HTML execution.

On Windows, UNC and device namespaces are rejected before agent-directory detection or project Git probing. Only local absolute paths are probed; `.git` markers use symlink metadata rather than following the marker itself. OS-mounted network volumes and intermediate junctions are outside this simple path-namespace check.

## Indexing

The indexer visits only supported provider roots. It does not follow symbolic links. File-size and modification-time fingerprints avoid reparsing unchanged files. It checks metadata before and after parsing; files changed during the read are retried on a later scan. A full rebuild bypasses the fingerprint check. Current limits bound file, line and traversal sizes.

Import diagnostics are bounded to 50 file issue messages per run, with full counts retained. Per-session malformed-line counts persist in SQLite. Source removal is archival: it does not purge cached sessions automatically.

## Deliberate MVP tradeoffs

- Manual scans avoid hidden background work and complicated filesystem watcher semantics.
- One connection makes import atomicity straightforward; concurrent read connections and per-file lock scope are planned for larger archives.
- Ordered events represent messages, calls, results and errors without copying the same payload into many tables.
- Pagination limits IPC payloads to 100 events or sessions per request. Individual large events can still be expensive to render; the UI initially truncates text with an explicit expand action.
- No success rates, costs or token sums are presented without a verified source and counting model.
