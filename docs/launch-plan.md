# ContextMeld launch plan

This plan is built around one clear position:

> ContextMeld is the local companion for finding, preserving and carrying coding-agent context. It reads supported history; it does not run agents.

That distinction matters. The coding-agent desktop market already contains many launchers and multi-agent orchestrators. ContextMeld should lead with the problem it solves: useful decisions and work become difficult to find when they are split between Claude Code, Codex and projects.

## Launch readiness

The public repository already has the essentials:

- a downloadable, working release for Windows, macOS and Linux;
- a synthetic demo that does not scan normal agent folders;
- an animated product tour and current screenshots;
- a clear privacy model, security notes and known limitations;
- contribution, conduct and vulnerability-reporting guidance;
- repeatable frontend and Rust verification in GitHub Actions;
- repository description and focused discovery topics.

Before the first broad announcement, upload `docs/social-preview.png` under **Repository settings → Social preview**. GitHub recommends a 1280 × 640 image and the prepared asset already has that size.

## Ordered launch sequence

### 1. Small technical feedback round

Share the repository privately with 3–5 developers who actively use Claude Code or Codex. Ask each person to try the installer or isolated demo and answer only three questions:

1. Did agent detection match what is actually installed?
2. Could you find an older session or decision faster than before?
3. At which screen did the product become unclear or feel unsafe?

Fix reproducible onboarding, detection or packaging problems before a public launch. Do not optimize for compliments; collect exact operating system, app version and steps.

### 2. Show HN

Use the prepared Show HN post in `docs/launch-kit.md`. Link directly to the repository so readers can inspect and download the product without signup. Stay available to answer technical and privacy questions during the first few hours.

Do not ask friends to upvote or coordinate comments. Hacker News explicitly disallows that. A concise maker story and candid limitations are a better fit for the community.

### 3. Relevant Reddit communities

Post only in communities whose current rules allow project sharing. Rewrite the opening sentence for each community and disclose that you built the project. Good candidates to check at posting time are communities about open source, self-hosted/local-first software, Claude Code and Codex.

Use one screenshot or the tour GIF, then ask for a specific kind of feedback. Avoid posting the same text to several communities on the same day.

### 4. Product Hunt

Launch after the first feedback round has confirmed that installation and detection work on machines other than the development machine. Use the prepared 240 × 240 thumbnail, three 1270 × 760 gallery images and Product Hunt copy in `docs/launch-kit.md`.

Product Hunt accepts live digital products and recommends a direct product URL, a short tagline, a description of at most 260 characters, a first maker comment, a square thumbnail and at least two gallery images. ContextMeld is free, live and available without an account, which fits those requirements.

### 5. Ecosystem directories and durable content

Submit ContextMeld to curated lists only when it satisfies their inclusion rules. `awesome-agent-clients` is especially relevant under “Session viewers & companion tools,” but its current guidance usually holds projects below roughly 50 stars. Build initial adoption first, then submit a factual entry.

Write one durable technical article after real users have tried the product. The strongest topic is the implementation of safe local session indexing: read-only source transcripts, bounded parsing, native file events, debouncing, fingerprints and SQLite FTS. That article can be shared on DEV Community, Hashnode or a personal site without repeating the launch announcement.

## Message hierarchy

Every launch surface should communicate these points in this order:

1. **Problem:** useful coding-agent history is fragmented across tools and projects.
2. **Outcome:** search it in one local desktop workspace and carry compact context between agents.
3. **Trust:** no account, telemetry, cloud backend or automatic command execution.
4. **Proof:** real installers, synthetic demo, current screenshots and a public verification record.
5. **Scope:** Claude Code and Codex sessions are supported; other agents currently have detection only.

## What to measure

Use public GitHub signals and direct feedback so the app itself remains telemetry-free:

- release downloads by platform;
- stars, forks and unique repository visitors;
- completed installation reports;
- reproducible bug reports;
- requests for specific adapters;
- first-time contributors.

Record a baseline immediately before each announcement and compare it after 24 hours and 7 days. Avoid paid promotion until one channel produces installs and useful feedback organically; advertising an unvalidated message usually buys low-quality traffic.

## Sources used for the plan

- [Show HN Guidelines](https://news.ycombinator.com/showhn.html)
- [Product Hunt: how to post a product](https://help.producthunt.com/en/articles/479557-how-to-post-a-product)
- [Product Hunt featuring guidelines](https://help.producthunt.com/en/articles/9883485-product-hunt-featuring-guidelines)
- [GitHub social media preview documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview)
- [GitHub repository topics documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics)
- [`awesome-agent-clients` inclusion guidance](https://github.com/1shiharat/awesome-agent-clients#contributing)
