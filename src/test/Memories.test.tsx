import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryLibrary } from "@/features/memories/MemoryLibrary";
import { MemoryEditor } from "@/features/memories/MemoryEditor";
const mocks = vi.hoisted(() => ({
  memories: vi.fn(),
  memory: vi.fn(),
  saveMemory: vi.fn(),
  trashMemory: vi.fn(),
  exportMemories: vi.fn(),
  importMemories: vi.fn(),
  saveText: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ desktop: true, api: mocks }));
vi.mock("@/lib/files", () => ({ saveText: mocks.saveText }));
const item = {
  id: "memory-1",
  revision: 1,
  title: "Database decisions",
  body: "Use transactions",
  scope: "global" as const,
  project: "",
  agents: ["codex"],
  tags: ["sqlite"],
  created_at: "2026-09-05T10:00:00Z",
  updated_at: "2026-09-05T10:00:00Z",
  deleted_at: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.memories.mockResolvedValue({ items: [item], total: 1 });
  mocks.memory.mockResolvedValue(item);
  mocks.saveMemory.mockResolvedValue({ ...item, revision: 2 });
  mocks.trashMemory.mockResolvedValue(undefined);
  mocks.exportMemories.mockResolvedValue('{"format":"agenthub.memories"}');
  mocks.saveText.mockResolvedValue(true);
});
describe("Memory library", () => {
  it("edits content with its saved revision and agent associations", async () => {
    render(<MemoryLibrary projects={[]} onDirty={vi.fn()} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Database decisions" }),
    );
    fireEvent.change(screen.getByLabelText(/Memory content/), {
      target: { value: "Use SQLite WAL" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save memory" }));
    await waitFor(() =>
      expect(mocks.saveMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "memory-1",
          revision: 1,
          body: "Use SQLite WAL",
          agents: ["codex"],
        }),
      ),
    );
    expect(
      await screen.findByText("Memory saved locally."),
    ).toBeInTheDocument();
  });
  it("moves a memory to trash and exposes restoration", async () => {
    render(<MemoryLibrary projects={[]} onDirty={vi.fn()} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Trash Database decisions" }),
    );
    await waitFor(() =>
      expect(mocks.trashMemory).toHaveBeenCalledWith("memory-1", 1, false),
    );
    mocks.memories.mockResolvedValue({
      items: [{ ...item, revision: 2, deleted_at: "today" }],
      total: 1,
    });
    fireEvent.click(screen.getByRole("button", { name: "Trash" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Restore Database decisions" }),
    );
    await waitFor(() =>
      expect(mocks.trashMemory).toHaveBeenCalledWith("memory-1", 2, true),
    );
  });
  it("exports a selected record through the native file save helper", async () => {
    render(<MemoryLibrary projects={[]} onDirty={vi.fn()} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Export Database decisions" }),
    );
    await waitFor(() =>
      expect(mocks.exportMemories).toHaveBeenCalledWith(["memory-1"]),
    );
    expect(mocks.saveText).toHaveBeenCalledWith(
      '{"format":"agenthub.memories"}',
      "agenthub-memories.json",
    );
  });
  it("keeps unsaved content on a revision conflict", async () => {
    mocks.saveMemory.mockRejectedValue(
      Error("This memory changed. Reload it."),
    );
    render(
      <MemoryLibrary projects={[]} initialId="memory-1" onDirty={vi.fn()} />,
    );
    const field = await screen.findByLabelText(/Memory content/);
    fireEvent.change(field, { target: { value: "My unsaved edit" } });
    fireEvent.click(screen.getByRole("button", { name: "Save memory" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This memory changed",
    );
    expect(field).toHaveValue("My unsaved edit");
  });
  it("protects a dirty editor from accidental close", () => {
    const close = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <MemoryEditor
        initial={item}
        projects={[]}
        onDirty={vi.fn()}
        onSave={vi.fn()}
        onClose={close}
      />,
    );
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Changed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
    expect(close).not.toHaveBeenCalled();
  });
});
