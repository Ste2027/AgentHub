# Security

AgentHub handles local conversation history, which may contain credentials or private source code. Treat the index with the same care as the original transcripts. It is not encrypted or automatically redacted.

This MVP is not yet a security-audited release. Only the current development version receives fixes. The app never executes imported shell commands, renders transcript HTML or sends session data to an AI service.

When hosted on GitHub, report vulnerabilities using the repository's private vulnerability reporting feature if enabled. If it is unavailable, contact the maintainers privately before disclosing technical details. Do not include real tokens, session dumps or customer data in a report. Provide a minimal synthetic reproduction, affected version, impact and proposed mitigation if known.

For contributors: keep Tauri capabilities narrow, preserve the content security policy, validate IPC inputs, bind SQL parameters, bound parser allocations and do not follow transcript instructions as executable actions.
