import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ContextExport } from "@/features/ContextExport";
import { Analytics } from "@/features/Analytics";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  memories: vi.fn(),
  analytics: vi.fn(),
  saveText: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ desktop: true, api: mocks }));
vi.mock("@/lib/files", () => ({ saveText: mocks.saveText }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({
    session_id: "s",
    title: "Fix login",
    project: "/p",
    repository: "/repo",
    git_diff: "Not collected",
    source_agent: "claude",
    task: "Fix login",
    decisions: "",
    remaining_work: "",
    files: [],
    commands: ["npm test"],
    errors: [],
    notes: [],
    truncated: false,
  });
  mocks.memories.mockResolvedValue({ items: [], total: 0 });
  mocks.saveText.mockResolvedValue(true);
});
it("exports edited context with the chosen target and source caveats", async () => {
  render(<ContextExport sessionId="s" onClose={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText("Task"), {
    target: { value: "Fix login and add regression coverage" },
  });
  fireEvent.change(screen.getByLabelText("Next agent"), {
    target: { value: "Cursor" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Export context" }));
  await waitFor(() => expect(mocks.saveText).toHaveBeenCalled());
  const markdown = mocks.saveText.mock.calls[0][0];
  expect(markdown).toContain("Target: Cursor");
  expect(markdown).toContain("Fix login and add regression coverage");
  expect(markdown).toContain("execution is not inferred");
  expect(markdown).toContain("Repository: /repo");
  expect(markdown).toContain("## Git diff");
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Context exported",
  );
});
it("reports export cancellation without claiming success", async () => {
  mocks.saveText.mockResolvedValue(false);
  render(<ContextExport sessionId="s" onClose={vi.fn()} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Export context" }),
  );
  await waitFor(() => expect(mocks.saveText).toHaveBeenCalled());
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
it("exports a versioned JSON package with edits and only explicitly selected memories", async () => {
  mocks.memories.mockResolvedValue({ items: [
    { id: "include", title: "Conventions", scope: "global", body: "Use migrations", agents: [] },
    { id: "exclude", title: "Private draft", scope: "global", body: "Do not share", agents: [] },
  ], total: 2 });
  render(<ContextExport sessionId="s" onClose={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText("Task"), { target: { value: "Reviewed goal" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Conventions global" }));
  fireEvent.change(screen.getByLabelText("Export format"), { target: { value: "json" } });
  fireEvent.click(screen.getByRole("button", { name: "Export context" }));
  await waitFor(() => expect(mocks.saveText).toHaveBeenCalled());
  const [text, filename] = mocks.saveText.mock.calls[0];
  const result = JSON.parse(text);
  expect(filename).toBe("agenthub-context.json");
  expect(result.format).toBe("agenthub.context");
  expect(result.version).toBe(1);
  expect(result.context.task).toBe("Reviewed goal");
  expect(result.target_agent).toBe("OpenAI Codex");
  expect(result.memories.map((memory: { id: string }) => memory.id)).toEqual(["include"]);
  expect(text).not.toContain("Do not share");
});
it("shows source failures", async () => {
  mocks.context.mockRejectedValue(new Error("Session missing"));
  render(<ContextExport sessionId="s" onClose={vi.fn()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Session missing");
});
it("renders empty analytics without invented data", async () => {
  mocks.analytics.mockResolvedValue({
    session_count: 0,
    project_count: 0,
    event_count: 0,
    activity: [],
    models: [],
    tools: [],
    file_requests: [],
    shell_requests: [],
    errors: [],
    agents: [],
  });
  render(<Analytics revision={0} />);
  expect(
    await screen.findByText("No indexed sessions yet."),
  ).toBeInTheDocument();
  expect(
    screen.getAllByText("No matching records in the local index."),
  ).toHaveLength(6);
});
