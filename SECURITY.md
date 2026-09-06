# Security

ContextMeld reads local agent transcripts, skill files and MCP configuration. Those files can contain source code, credentials, private URLs and internal project names. The local index is not encrypted and content is not automatically redacted, so protect the application data directory and exported files like the originals.

## Trust boundaries

- **Local files are user-controlled input.** Parsers are bounded, malformed records are skipped, and SQL uses bound parameters. Transcript text is displayed as text and is never interpreted as HTML or instructions.
- **Marketplace content is untrusted.** Browsing is opt-in and uses public GitHub endpoints. ContextMeld shows exact files and warnings before installation. It never runs scripts, starts MCP processes, changes shell profiles or silently modifies an agent directory.
- **IPC is a file-management boundary.** Mutating commands require explicit absolute paths, expected content hashes and a confirmation in the UI. JSON edits are written through a temporary file, backed up, replaced atomically and parsed again; a failed verification restores the backup.
- **Secrets stay masked.** MCP environment values are never returned to the UI or stored in the index; only variable names are shown with a mask. Do not paste real tokens into issues, screenshots or exported context.

The desktop app has no telemetry, account or cloud backend. A user can choose to browse public GitHub sources, but local transcripts, memories and configuration contents are not uploaded by ContextMeld.

This project has not undergone an independent security audit. Report vulnerabilities using GitHub's private vulnerability reporting feature when available. Otherwise contact the maintainers privately before disclosure. Include the affected version, impact and a minimal synthetic reproduction; never include real tokens, session dumps or customer data.

For contributors, keep Tauri capabilities narrow, preserve the content security policy, validate every IPC input, bind SQL parameters, cap parser allocations, avoid command execution, and treat all imported content as data rather than executable instructions.
