# Contributing

Start with the setup instructions in README. Keep changes focused, document observable behavior, and run the frontend checks, Rust tests, formatter and Clippy before submitting a pull request. A new provider must have an authoritative format reference and synthetic fixtures covering normal input, missing fields and corruption.

Do not include personal session files, credentials or machine-specific absolute paths in commits. UI examples belong in tests, never production data paths. Preserve local-only operation and avoid adding services or telemetry for convenience.

Use small components and narrow Rust modules. Database changes require migrations and regression tests. Describe the actual checks run and any platform limits in the PR. Screenshots should use empty states or explicitly synthetic test data.

For bugs, include OS, app version, steps, expected behavior and a minimized synthetic record. If the issue involves sensitive data, follow SECURITY.md instead of opening a public issue.
