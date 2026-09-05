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
  })),
  saveMcpConfig: vi.fn(async () => "/synthetic/config.json.agenthub-backup-1"),
  restoreMcpConfig: vi.fn(
    async () => "/synthetic/config.json.agenthub-backup-before-restore-2",
  ),
  deleteSkill: vi.fn(async () => "/synthetic/.agenthub-trash/1--target"),
  restoreDeletedSkill: vi.fn(async () => "/synthetic/target"),
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
  fireEvent.click(await screen.findByRole("button", { name: "Edit JSON" }));
  fireEvent.change(screen.getByLabelText("MCP configuration"), {
    target: { value: '{"mcpServers":{"target":{"disabled":true}}}' },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save MCP config" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Rollback last change" }),
  );
  await waitFor(() =>
    expect(mocks.restoreMcpConfig).toHaveBeenCalledWith(
      "/synthetic/config.json",
      "/synthetic/config.json.agenthub-backup-1",
    ),
  );
});

it("moves a complete skill to AgentHub trash and restores it explicitly", async () => {
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
  expect(
    await screen.findByRole("button", { name: "Restore removed skill" }),
  ).toBeInTheDocument();
  expect(mocks.deleteSkill).toHaveBeenCalledWith(skill.path);
  fireEvent.click(
    screen.getByRole("button", { name: "Restore removed skill" }),
  );
  await waitFor(() =>
    expect(mocks.restoreDeletedSkill).toHaveBeenCalledWith(
      "/synthetic/.agenthub-trash/1--target",
    ),
  );
});
