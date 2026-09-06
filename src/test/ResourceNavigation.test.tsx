import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SkillsPage, McpPage } from "@/features/AgentResources";
import type { McpServer, Skill } from "@/lib/types";
const mocks = vi.hoisted(() => ({
  skills: vi.fn<() => Promise<Skill[]>>(async () => []),
  mcpServers: vi.fn<() => Promise<McpServer[]>>(async () => []),
  skillContent: vi.fn(async () => ({
    text: "Selected skill instructions",
    hash: "v1",
  })),
  mcpConfig: vi.fn(async () => ({
    text: '{"mcpServers":{"target":{}}}',
    hash: "v1",
    format: "json" as const,
    secrets_revealed: false,
  })),
  saveMcpConfig: vi.fn(
    async () => "/synthetic/config.json.contextmeld-backup-1",
  ),
  restoreMcpConfig: vi.fn(
    async () => "/synthetic/config.json.contextmeld-backup-before-restore-2",
  ),
  deleteSkill: vi.fn(async () => "/synthetic/.contextmeld-trash/1--target"),
  restoreDeletedSkill: vi.fn(async () => "/synthetic/target"),
  exportSkill: vi.fn(async () =>
    JSON.stringify({
      format: "contextmeld.skill",
      version: 1,
      name: "target",
      files: [
        { path: "SKILL.md", text: "# target" },
        { path: "scripts/helper.ts", text: "export {};" },
      ],
    }),
  ),
  copySkill: vi.fn(async () => "/synthetic/claude/skills/target"),
  duplicateSkill: vi.fn(async () => "/synthetic/target-copy"),
  addMcpServer: vi.fn(
    async () => "/synthetic/config.json.contextmeld-backup-3",
  ),
}));
vi.mock("@/lib/api", () => ({ desktop: true, api: mocks }));
const hit = {
  session_id: "",
  title: "Target",
  agent: "claude",
  project: "",
  text: "",
  kind: "skill",
  ordinal: 0,
};
afterEach(() => vi.restoreAllMocks());
it("opens a skill search result by its exact path even outside the discovery list", async () => {
  render(
    <SkillsPage
      selection={{
        ...hit,
        entity_type: "skill",
        entity_id: "/synthetic/target/SKILL.md",
      }}
    />,
  );
  expect(
    await screen.findByText("Selected skill instructions"),
  ).toBeInTheDocument();
  expect(mocks.skillContent).toHaveBeenCalledWith("/synthetic/target/SKILL.md");
});
it("opens the config referenced by an MCP search result", async () => {
  render(
    <McpPage
      selection={{
        ...hit,
        entity_type: "mcp",
        entity_id: "/synthetic/config.json",
      }}
    />,
  );
  expect(
    await screen.findByRole("heading", { name: "Target configuration" }),
  ).toBeInTheDocument();
  expect(
    await screen.findByText('{"mcpServers":{"target":{}}}'),
  ).toBeInTheDocument();
  expect(mocks.mcpConfig).toHaveBeenCalledWith("/synthetic/config.json");
});
it("keeps a verified MCP backup available for an explicit rollback", async () => {
  mocks.mcpServers.mockResolvedValueOnce([
    {
      name: "target",
      agent: "claude",
      scope: "user",
      config_path: "/synthetic/config.json",
      transport: "stdio",
      command: "node",
      args: [],
      env_keys: ["TOKEN"],
      url: null,
      enabled: true,
      readable: true,
    },
  ]);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<McpPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Reveal & edit JSON" }),
  );
  fireEvent.change(await screen.findByLabelText("MCP configuration"), {
    target: { value: '{"mcpServers":{"target":{"disabled":true}}}' },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save MCP config" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Rollback last change" }),
  );
  await waitFor(() =>
    expect(mocks.restoreMcpConfig).toHaveBeenCalledWith(
      "/synthetic/config.json",
      "/synthetic/config.json.contextmeld-backup-1",
    ),
  );
});

it("moves a complete skill to ContextMeld trash and restores it explicitly", async () => {
  const skill: Skill = {
    name: "target",
    agent: "codex",
    scope: "user",
    path: "/synthetic/target/SKILL.md",
    description: "Synthetic test skill",
    readable: true,
    modified_at: "",
    files: ["/synthetic/target/scripts/helper.ts"],
  };
  mocks.skills.mockResolvedValueOnce([skill]).mockResolvedValue([]);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<SkillsPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
  fireEvent.click(screen.getByRole("button", { name: "Move to trash" }));
  expect(
    await screen.findByRole("button", { name: "Restore removed skill" }),
  ).toBeInTheDocument();
  expect(mocks.deleteSkill).toHaveBeenCalledWith(skill.path);
  fireEvent.click(
    screen.getByRole("button", { name: "Restore removed skill" }),
  );
  await waitFor(() =>
    expect(mocks.restoreDeletedSkill).toHaveBeenCalledWith(
      "/synthetic/.contextmeld-trash/1--target",
    ),
  );
});

it("previews the complete skill package before copying it", async () => {
  const skill: Skill = {
    name: "target",
    agent: "codex",
    scope: "user",
    path: "/synthetic/target/SKILL.md",
    description: "Synthetic test skill",
    readable: true,
    modified_at: "",
    files: ["scripts/helper.ts"],
  };
  mocks.skills.mockResolvedValueOnce([skill]);
  render(<SkillsPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Copy to agent" }));
  expect(await screen.findByRole("dialog")).toHaveTextContent(
    "scripts/helper.ts",
  );
  fireEvent.change(screen.getByLabelText("Skill copy destination"), {
    target: { value: "/synthetic/claude/skills" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Copy skill" }));
  await waitFor(() =>
    expect(mocks.copySkill).toHaveBeenCalledWith(
      skill.path,
      "/synthetic/claude/skills",
    ),
  );
});

it("reviews an MCP addition before creating a verified backup", async () => {
  render(<McpPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Add server" }));
  fireEvent.change(screen.getByLabelText("MCP configuration path"), {
    target: { value: "/synthetic/config.json" },
  });
  fireEvent.change(screen.getByLabelText("MCP server name"), {
    target: { value: "docs" },
  });
  fireEvent.click(
    screen.getAllByRole("button", { name: "Add server" }).at(-1)!,
  );
  await waitFor(() =>
    expect(mocks.addMcpServer).toHaveBeenCalledWith(
      "/synthetic/config.json",
      "docs",
      expect.stringContaining("command"),
      "v1",
    ),
  );
});
