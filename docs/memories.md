# Using memories

Memories are local, searchable notes attached to ContextMeld. They are useful for decisions you want to keep near a project, conventions for one agent, or a short global preference. They are not a background prompt store: ContextMeld never injects them into Claude Code, Codex or another agent automatically.

Open **Memories** from the sidebar and choose **New memory**. Give the note a title and body, then choose a scope:

- **Global** applies everywhere in ContextMeld.
- **Project** stores the note with a project path.
- **Agent** associates it with one or more providers.

Tags make notes easier to filter. Editing uses a saved revision, so a change made by another window is rejected instead of silently overwriting it. Deleted notes go to the local trash and can be restored. Import and export use a portable JSON archive; exports contain only the notes you select.

Memories become useful to an agent through **Context export** in a session detail. Select the memories you want, review the generated handoff, edit task or decisions if needed, then copy it to the agent chat or export a Markdown file. The package includes the selected notes and bounded session context. Nothing is sent by ContextMeld.

All of this data stays in the local SQLite database shown in **Settings → Local storage**. The original transcript files are never modified.
