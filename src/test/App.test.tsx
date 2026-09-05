import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { App } from "../App";
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: vi.fn(),
}));
describe("Browser preview", () => {
  it("does not fabricate local data and explains desktop requirement", () => {
    render(<App />);
    expect(screen.getByText("Your agents. One workspace.")).toBeInTheDocument();
    expect(screen.getByText("Desktop companion")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Index sessions" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Your next idea starts with context"),
    ).toBeInTheDocument();
  });
  it("navigates to settings and prevents unsupported browser writes", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByLabelText("Claude Code")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save settings" }),
    ).toBeDisabled();
  });
  it("opens accessible global search with keyboard shortcut", async () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Search all sessions" }),
    ).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Close search" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
