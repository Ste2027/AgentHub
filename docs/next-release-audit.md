# Next release audit

Baseline inspected: public master/tag v0.1.0 at fc58e19; local GUI fix at 508ea5a. Preserve v0.1.0 and public history. Choose the new version after implementation scope is known.

## Live repository evidence

- Public repository Ste2027/AgentHub, default branch master.
- Latest observed Quality 33968251779 and Release 33968251829: completed/success.
- Seven existing assets: Windows x64 NSIS/MSI; macOS ARM64 DMG/app archive; Linux x64 AppImage/deb/rpm. Build success does not establish installation or runtime behavior.
- Topics empty; Discussions disabled.
- Future local commits configured to verified account-ID GitHub noreply address. Existing published authorship preserved.
- Initial tracked-text scan found no matching provider-key/private-key/personal-home patterns. This is a preliminary pattern scan, not proof that every secret is absent. Screenshot and history review remain separate gates.

## Code evidence matrix

| Feature | Implemented | Partial / missing | Evidence / testing |
| --- | --- | --- | --- |
| Sessions | Claude/Codex, paging, agent/project filters, timeline | Date/model filters, configurable sort | Existing desktop and core tests; broader UX pending |
| Search | Session/event FTS, memories, skill/MCP metadata matching | Skill/MCP hits route only to tab; project resources need direct routing | Search.tsx, App.tsx selectHit; existing session navigation regression |
| Context | Editable Markdown, explicit memory selection, JSON added this iteration | Only first memory page loaded; skills/current state/structured sections incomplete | Insights tests include JSON selection/privacy regression |
| Skills | Discovery, file read/edit/copy/import/delete | Review full-package import/export, safe rendered detail and copy previews | AgentResources.tsx and skill_commands.rs; audit incomplete |
| MCP | Discovery, masked env keys, JSON mutations | Full change preview coverage and TOML editing require audit | mcp_commands.rs and resource tests; native validation pending |
| Marketplace | Explicit public GitHub browsing, metadata and warnings | Updates view is manual status, full-file installation needs audit | Marketplace test; security edge cases incomplete |
| Agents | Claude/Codex directories, planned providers | Six-provider executable/config detection, last index metadata | Provider architecture exists; new detection not implemented |
| GUI | Shortcut labels, compact sidebar titles, context field sizing fixed | Light/native/responsive workflows not fully verified | GUI review record; frontend checks |
| Demo/media | Component captures with temporary synthetic overrides | No reproducible safe demo yet; populated 15-screen gallery/GIF missing | Existing captures are not release-quality runtime evidence |
| Release | Existing three-platform workflow and v0.1.0 assets | New version, full final gates, clean clone/install checks | No new release/tag created |

## Required next work

Follow the user-requested order: security audit; Sessions/Search/Handoff; Skills/MCP/Marketplace; detection; UX/performance; isolated synthetic demo; genuine captures and GIF; README; GitHub metadata; all gates; new release; final report.

Do not call this release complete based on earlier test counts or tab existence. The attached specification includes additional requirements beyond this preliminary matrix. Track those as they are inspected, and retain unverified items as open.
