import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(async () => () => {}),
}));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: mocks.invoke,
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));
const fixture = {
  id: "synthetic-1",
  agent: "claude",
  source_id: "fixture",
  source: "/synthetic/session.jsonl",
  project: "/synthetic/project",
  title: "Repair synthetic login flow",
  updated_at: "2026-09-01T10:00:00Z",
  model: "fixture-model",
  event_count: 1,
  warnings: 0,
};
beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.invoke.mockImplementation(async (command: string) => {
    switch (command) {
      case "overview":
        return {
          sessions: 1,
          projects: 1,
          events: 1,
          agents: [
            {
              id: "claude",
              name: "Claude Code",
              supported: true,
              detected: true,
              path: "/synthetic",
            },
          ],
          database_path: "/synthetic/index.db",
        };
      case "get_settings":
        return { claude_path: "", codex_path: "", light_mode: false };
      case "list_sessions":
        return [fixture];
      case "get_session":
        return {
          ...fixture,
          id: "older-session",
          title: "Older synthetic task",
        };
      case "search":
        return [
          {
            session_id: "older-session",
            title: "Older synthetic task",
            agent: "claude",
            project: fixture.project,
            text: "Archived result",
            kind: "message",
            ordinal: 0,
          },
        ];
      case "list_projects":
        return [
          {
            path: fixture.project,
            name: "project",
            sessions: 1,
            agents: "claude",
            updated_at: fixture.updated_at,
            git: false,
          },
        ];
      case "session_events":
        return [
          {
            ordinal: 0,
            kind: "message",
            role: "user",
            timestamp: fixture.updated_at,
            text: "<script>danger()</script>",
            name: "",
            call_id: "",
          },
        ];
      case "index_sessions":
        return {
          scanned: 1,
          indexed: 1,
          skipped: 0,
          failed: 0,
          warnings: 0,
          done: true,
          issues: [],
        };
      case "save_settings":
        return undefined;
      default:
        throw Error("Unexpected IPC command: " + command);
    }
  });
});
describe("Desktop UI contract", () => {
  it("opens a search result outside the loaded session page directly", async () => {
    render(<App />);
    await screen.findByText("Repair synthetic login flow");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search all sessions" }),
      { target: { value: "Archived" } },
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Older synthetic task/ }),
    );
    expect(
      await screen.findByRole("heading", { name: "Older synthetic task" }),
    ).toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledWith("get_session", {
      sessionId: "older-session",
    });
  });
  it("opens a project search result on the matching project card", async () => {
    const { container } = render(<App />);
    await screen.findByText("Repair synthetic login flow");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search all sessions" }),
      { target: { value: "synthetic/project" } },
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /project.*synthetic\/project/i }),
    );
    expect(
      await screen.findByRole("heading", { name: "Projects" }),
    ).toBeInTheDocument();
    expect(container.querySelector("[data-project-path].search-target"))
      .toHaveAttribute("data-project-path", fixture.project);
  });
  it("opens an indexed session and renders transcript markup as inert text", async () => {
    const { container } = render(<App />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Repair synthetic login flow/,
      }),
    );
    expect(
      await screen.findByText("<script>danger()</script>"),
    ).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(mocks.invoke).toHaveBeenCalledWith("session_events", {
      sessionId: "synthetic-1",
      offset: 0,
    });
  });
  it("reports a completed import and refreshes real data", async () => {
    render(<App />);
    await screen.findByText("Repair synthetic login flow");
    fireEvent.click(screen.getByRole("button", { name: "Index sessions" }));
    expect(await screen.findByText("Index complete")).toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledWith("index_sessions", {
      force: false,
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Index sessions" }),
      ).toBeEnabled(),
    );
  });
  it("saves user-supplied paths through the typed IPC boundary", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save settings" }),
      ).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText("Claude Code"), {
      target: { value: "/synthetic/new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText(/Settings saved/)).toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledWith("save_settings", {
      settings: {
        claude_path: "/synthetic/new",
        codex_path: "",
        light_mode: false,
      },
    });
  });
});
