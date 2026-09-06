# Provider support

## Sources

The implementation was scoped against the official [Claude Code session documentation](https://code.claude.com/docs/en/agent-sdk/sessions), the [Claude Code SDK message types](https://platform.claude.com/docs/en/agent-sdk/typescript), and the public [Codex protocol](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs) / [response models](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/models.rs). These are living sources, not a promise of a stable transcript schema. Test fixtures are synthetic minimal examples of the supported fields.

ContextMeld evaluates executable discovery, configuration-directory discovery and session-directory discovery independently. Only executable discovery marks an agent as installed in the sidebar. A surviving config or history folder is labelled as such and never promoted to an installation. Detection never starts an executable or contacts a provider.

## Claude Code

Reads user and assistant records with `message.content`, optional `sessionId`, `cwd`, `timestamp`, `uuid`, and `message.model`. Supports plain text content and structured `text`, `tool_use`, and `tool_result` blocks. Tool results link through `tool_use_id`; `is_error` marks a recorded error. Repeated record UUID/block positions replace an earlier event, avoiding exact-record duplicates. Distinct partial records with different UUIDs are not merged by message ID.

Progress, queue operations, file snapshots, images and thinking blocks are ignored. Absence of a field is preserved as unknown. Subagent JSONL files are indexed separately by their source path.

## OpenAI Codex

Reads `session_meta` for identity/working directory and `turn_context` for model information. `response_item` provides text messages, function/custom tool calls and tool outputs. `event_msg.error` is preserved. Mirrored user/assistant messages in `event_msg` are deliberately not imported alongside their `response_item` counterpart.

This means event-only transcripts without response items may have little or no timeline content. Encrypted reasoning, images, compaction internals, token counters and newer provider-specific event variants are not parsed. Shell/file-edit tool arguments are visible as source text; the parser does not infer a structured diff or command outcome it cannot verify.

## Adding a provider

Implement `AgentAdapter`, add a registry entry with a real supported path, normalize into `ParsedSession`, and supply fixtures plus error-handling tests. Unsupported registry entries have no parser and never enter indexing. The registry currently reserves Cursor, Gemini CLI, OpenCode and GitHub Copilot.

Before supporting a new variant, cite a real format source, avoid brittle position-based parsing and confirm that repeated records do not inflate counts. Never execute commands from fixtures or source transcripts. Avoid importing authentication/configuration files when only session history is required.
