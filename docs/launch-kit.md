# ContextMeld v0.2.0 launch kit

## Short description

ContextMeld is a local desktop workspace for Claude Code and OpenAI Codex history, search, memories, skills, MCP configuration and reviewable cross-agent context handoffs.

## Positioning

**Category:** local coding-agent companion

**Primary promise:** Find the context you already created, then carry the useful parts to your next agent session.

**Do not describe it as:** an agent launcher, autonomous orchestrator, cloud observability platform or automatic session continuation tool.

## GitHub announcement

I kept losing useful work between Claude Code and Codex, so I built a local desktop app that indexes the coding-agent history already on your machine.

ContextMeld lets you search sessions, follow work by project, preserve reusable memories, review skills and MCP configuration, and build a compact Claude-to-Codex or Codex-to-Claude context package. It runs locally with SQLite, has no account or telemetry, and never executes transcript commands, downloaded scripts or MCP servers.

v0.2.0 introduces the ContextMeld name and adds native automatic indexing for supported Claude Code and Codex session folders. It also includes an isolated demo workspace, native clipboard handoffs, safe JSON/TOML MCP editing, complete skill-package copy/install flows and installers for Windows, macOS and Linux.

## Show HN draft

**Title:** Show HN: ContextMeld – a local control center for Claude Code and Codex history

I kept losing useful work between Claude Code and Codex, so I built ContextMeld, a local Tauri desktop app that indexes the coding-agent history already on your machine.

It provides unified session timelines and local full-text search, then builds an editable handoff package with the current task, decisions, TODOs, files, commands, recorded errors, selected memories, relevant skills and bounded Git context. It also reviews local skills and MCP JSON/TOML configuration through explicit, backed-up changes.

There is no account, telemetry, cloud backend or automatic execution. Cursor, Gemini CLI, OpenCode and Copilot currently have detection only; their session adapters are deliberately marked planned until stable local formats can be tested.

Repository and downloads: https://github.com/Ste2027/ContextMeld

I would especially value feedback on detection across different machines, the usefulness of the context handoff, and any local format variants the current adapters miss. Please do not attach real transcripts to issues; minimized synthetic records are enough.

## Reddit: r/codex

**Title:** I built a local-first desktop workspace for Codex and Claude Code session history

I built ContextMeld because useful decisions kept disappearing into separate Codex and Claude Code histories.

ContextMeld indexes supported local JSONL session files into SQLite and provides:

- unified Codex and Claude Code timelines;
- local full-text search across sessions and projects;
- reusable memories selected explicitly for context export;
- inspection of local skills and MCP configuration;
- editable Codex-to-Claude or Claude-to-Codex handoff packages;
- native file watching so changed sessions are indexed automatically.

It does not require an account, telemetry or a cloud backend. Source transcripts are opened read-only, recorded commands remain inert text, and downloaded marketplace scripts are never executed. The repository also includes an isolated synthetic demo that does not scan normal agent folders.

The current release has verified session adapters for Codex and Claude Code. Cursor, Gemini CLI, OpenCode and GitHub Copilot currently have installation and configuration detection only.

Repository and unsigned installers for Windows, macOS and Linux:
https://github.com/Ste2027/ContextMeld

I would value specific feedback on two things: whether Codex detection is accurate on another machine, and whether search or context export makes an older piece of work easier to recover. Please do not attach real transcripts to issues; minimized synthetic records are sufficient.

**Flair:** Showcase

## Reddit: r/coolgithubprojects

**Post type:** Link

**Title:** [Local desktop workspace for Claude Code and Codex history] - ContextMeld

**URL:** https://github.com/Ste2027/ContextMeld

## Reddit: r/github self-promotion megathread

I built ContextMeld, an MIT-licensed local desktop workspace for Claude Code and OpenAI Codex history. It provides unified timelines, local full-text search, project views, reusable memories, skills and MCP inspection, and editable cross-agent context handoffs. It has no account, telemetry or cloud backend, and includes installers for Windows, macOS and Linux.

Repository: https://github.com/Ste2027/ContextMeld

I am looking for feedback on installation, agent detection and the safety documentation.

## Product Hunt

**Name:** ContextMeld

**Tagline:** Your coding-agent context, together and local

**Description (under 260 characters):** ContextMeld brings Claude Code and Codex sessions, search, memories, skills and MCP into one local desktop workspace. Build reviewable context handoffs without an account, telemetry, cloud backend or automatic command execution.

**Topics:** Open Source, Developer Tools, Artificial Intelligence

**Pricing:** Free

**Primary URL:** https://github.com/Ste2027/ContextMeld

**First maker comment:**

I built ContextMeld because useful work kept disappearing into separate Claude Code and Codex histories. I wanted one place to find an old decision, understand the project around it and prepare only the context needed for the next session.

ContextMeld reads supported local history into SQLite and keeps the workflow explicit. It does not require an account, send telemetry, run transcript commands or automatically submit anything to an agent. Memories are selected deliberately for a handoff, skills and MCP edits are reviewable, and the demo uses synthetic data without scanning normal agent folders.

This first public release supports Claude Code and Codex session formats. Cursor, Gemini CLI, OpenCode and GitHub Copilot are detection-only until their local formats can be tested safely. I would value concrete feedback on installation, detection and the handoff workflow, especially from Windows, macOS and Linux users.

**Gallery order:**

1. `docs/launch/product-hunt-01-overview.png`
2. `docs/launch/product-hunt-02-search.png`
3. `docs/launch/product-hunt-03-local-context.png`

**Thumbnail:** `docs/launch/product-hunt-thumbnail.png`

## LinkedIn post

Coding-agent history is becoming a new kind of project knowledge, but it is usually scattered across tools and folders.

I built ContextMeld, an open-source local desktop workspace that indexes supported Claude Code and OpenAI Codex sessions. It adds unified search, project views, reusable memories, skill and MCP review, and compact cross-agent context handoffs.

Everything stays on the machine by default: no account, telemetry, cloud backend or automatic execution. The repository includes an isolated synthetic demo and installers for Windows, macOS and Linux.

Repository: https://github.com/Ste2027/ContextMeld

I am particularly interested in feedback from developers who use more than one coding agent.

## X post

I kept losing useful work between Claude Code and Codex, so I built ContextMeld: a local desktop app for unified sessions, search, memories, skills, MCP and reviewable cross-agent handoffs. No account, telemetry or automatic execution. https://github.com/Ste2027/ContextMeld

## Short direct message for early testers

I am testing ContextMeld, an open-source desktop app that brings local Claude Code and Codex history into one searchable workspace. Would you be willing to try the installer or isolated demo and tell me whether detection is accurate on your machine? No account or telemetry: https://github.com/Ste2027/ContextMeld
