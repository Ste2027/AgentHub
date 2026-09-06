# GUI review — v0.1.1

## Verified corrections

- Search shortcut label follows the host platform (Ctrl K on Windows).
- Sidebar buttons expose a title and the active page to assistive technology.
- Context export textareas respect their row count instead of inheriting a 200px minimum from the memory editor.
- Settings privacy text distinguishes read-only transcripts from explicit skill/MCP writes and opt-in Marketplace requests.
- The sidebar counts only detected executables as installations; configuration and session-history signals remain visible on the Agents page.
- The compatibility matrix uses a full-width bordered table with stable spacing at desktop and compact widths.
- Skill, Marketplace and MCP mutations use in-app review dialogs with exact paths/files, warnings and sticky actions.
- Context clipboard copy uses the native Tauri clipboard plugin and was exercised in the real WebView.

Validation after these changes: 29 frontend tests passed; typecheck, ESLint, production frontend build and git diff whitespace check passed.

## Screenshot review

Every image under `docs/screenshots` was captured from the actual Windows Tauri WebView with `AGENTHUB_DEMO=1` and isolated storage at `C:\AgentHubDemoData`. The dataset contains synthetic sessions, projects, memories, skills and MCP configuration only. Captures cover all sidebar pages, session timeline, universal search, skill review/copy, Marketplace install review, Context Export, light mode and the 760×620 minimum-width layout.

## Results

- Dark and light themes remain readable with consistent borders, contrast and focus states.
- The sidebar collapses to icons at the minimum width without covering the workspace.
- Search opens with Ctrl+K, focuses its input and routes results to the relevant resource.
- Session and Context Export pages scroll independently without clipped actions.
- Long action dialogs keep Cancel/Confirm visible in a sticky footer.
- Empty, loading, error, success and rollback messages use accessible status/alert roles where applicable.

The macOS and Linux packages are built by CI. Their native rendering was not visually run-tested on this Windows host.
