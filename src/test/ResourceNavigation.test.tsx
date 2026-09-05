import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SkillsPage, McpPage } from "@/features/AgentResources";
const mocks = vi.hoisted(() => ({
  skills: vi.fn(async () => []), mcpServers: vi.fn(async () => []),
  skillContent: vi.fn(async () => ({ text: "Selected skill instructions", hash: "v1" })),
  mcpConfig: vi.fn(async () => ({ text: '{"mcpServers":{"target":{}}}', hash: "v1" })),
}));
vi.mock("@/lib/api", () => ({ desktop: true, api: mocks }));
const hit = { session_id: "", title: "Target", agent: "claude", project: "", text: "", kind: "skill", ordinal: 0 };
it("opens a skill search result by its exact path even outside the discovery list", async () => {
  render(<SkillsPage selection={{ ...hit, entity_type: "skill", entity_id: "/synthetic/target/SKILL.md" }} />);
  expect(await screen.findByText("Selected skill instructions")).toBeInTheDocument();
  expect(mocks.skillContent).toHaveBeenCalledWith("/synthetic/target/SKILL.md");
});
it("opens the config referenced by an MCP search result", async () => {
  render(<McpPage selection={{ ...hit, entity_type: "mcp", entity_id: "/synthetic/config.json" }} />);
  expect(await screen.findByText('{"mcpServers":{"target":{}}}')).toBeInTheDocument();
  expect(mocks.mcpConfig).toHaveBeenCalledWith("/synthetic/config.json");
});
