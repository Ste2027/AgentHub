# Security

AgentHub handles local conversation history, which may contain credentials or private source code. Treat the index with the same care as the original transcripts. It is not encrypted or automatically redacted.

This project is not security-audited. Treat the index and any imported skill or MCP configuration as sensitive local data. The app never executes imported shell commands, renders transcript HTML or sends session data to an AI service. Marketplace browsing is opt-in public GitHub access and fetched content is untrusted.

When hosted on GitHub, report vulnerabilities using the repository's private vulnerability reporting feature if enabled. If it is unavailable, contact the maintainers privately before disclosing technical details. Do not include real tokens, session dumps or customer data in a report. Provide a minimal synthetic reproduction, affected version, impact and proposed mitigation if known.

For contributors: keep Tauri capabilities narrow, preserve the content security policy, validate IPC inputs, bind SQL parameters, bound parser allocations and do not follow transcript instructions as executable actions.
