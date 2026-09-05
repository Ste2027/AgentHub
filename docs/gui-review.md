# GUI review — in progress

## Verified corrections

- Search shortcut label follows the host platform (Ctrl K on Windows).
- Sidebar buttons expose a title and the active page to assistive technology.
- Context export textareas respect their row count instead of inheriting a 200px minimum from the memory editor.
- Settings privacy text distinguishes read-only transcripts from explicit skill/MCP writes and opt-in Marketplace requests.

Validation after these changes: 17 frontend tests passed; typecheck, ESLint, production frontend build and git diff whitespace check passed.

## Screenshot review

Initial captures lagged one navigation behind their filenames. Images were visually inspected and relabeled by their actual content. Timeline and Context Export use synthetic examples in the real components via temporary, subsequently removed source overrides. These are illustrative component captures, not evidence of a native end-to-end workflow. Skills and MCP captures show browser-only empty states.

## Remaining verification

- Native desktop forms, confirmations and file operations.
- Light theme and compact viewport interaction checks.
- Complete page-by-page browser review: the attempted navigation batch timed out and is not counted as a pass.
- Rebuild native packages after the GUI corrections before delivering an updated installer.

The public release has not been replaced with these local GUI changes.
