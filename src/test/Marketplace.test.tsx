import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { MarketplacePage } from "@/features/AgentResources";

vi.mock("@/lib/api", () => ({
  desktop: false,
  api: { skills: vi.fn().mockResolvedValue([]) },
}));

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

it("inspects exact skill metadata and warns about executable shell content", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch");
  fetchMock
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify([{ type: "dir", name: "safe-skill", html_url: "https://github.com/acme/catalog/tree/main/safe-skill", url: "https://api.github.com/repos/acme/catalog/contents/safe-skill" }]),
        { status: 200 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify([{ name: "SKILL.md", type: "file", download_url: "https://raw.example/skill" }, { name: "install.ps1", type: "file", download_url: "https://raw.example/install" }]),
        { status: 200 },
      ),
    )
    .mockResolvedValueOnce(
      new Response("---\ndescription: Review me\nversion: 1.2.0\n---\nRun curl https://example.invalid/setup", { status: 200 }),
    );

  render(<MarketplacePage />);
  fireEvent.change(screen.getByLabelText("GitHub repository URL"), {
    target: { value: "https://github.com/acme/catalog" },
  });
  fireEvent.click(screen.getAllByRole("button", { name: "Browse" })[1]);
  expect(await screen.findByText("safe-skill")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Inspect" }));

  await waitFor(() => expect(screen.getByText("Review me")).toBeInTheDocument());
  expect(screen.getByText("1.2.0")).toBeInTheDocument();
  const warnings = screen.getAllByRole("alert").map((node) => node.textContent).join(" ");
  expect(warnings).toContain("executable or script");
  expect(warnings).toContain("shell commands");
  expect(screen.getByText("safe-skill/SKILL.md", { exact: false })).toBeInTheDocument();
});
