## What changed

## Verification
- [ ] `npm run check`
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml --locked`
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --features desktop --locked -- -D warnings`

## Privacy review
- [ ] No personal paths, transcripts, credentials or session data included.
- [ ] Any source writes have preview, backup, atomic replacement and rollback behavior.
