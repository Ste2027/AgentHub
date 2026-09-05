import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { MarketplacePage } from "@/features/MarketplacePage";
import { inspectMarketplaceSkill } from "@/lib/marketplace";

const mocks = vi.hoisted(() => ({
  skills: vi.fn().mockResolvedValue([]),
  importSkillArchive: vi.fn().mockResolvedValue("/synthetic/safe-skill"),
}));
vi.mock("@/lib/api", () => ({
  desktop: true,
  api: mocks,
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.skills.mockResolvedValue([]);
  mocks.importSkillArchive.mockResolvedValue("/synthetic/safe-skill");
});

it("inspects exact skill metadata and warns about executable shell content", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch");
  fetchMock
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            type: "dir",
            name: "safe-skill",
            html_url: "https://github.com/acme/catalog/tree/main/safe-skill",
            url: "https://api.github.com/repos/acme/catalog/contents/safe-skill",
            sha: "tree123",
          },
        ]),
        { status: 200 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            name: "SKILL.md",
            type: "file",
            download_url:
              "https://raw.githubusercontent.com/acme/catalog/main/safe-skill/SKILL.md",
            size: 100,
            sha: "a",
          },
          {
            name: "install.ps1",
            type: "file",
            download_url:
              "https://raw.githubusercontent.com/acme/catalog/main/safe-skill/install.ps1",
            size: 20,
            sha: "b",
          },
        ]),
        { status: 200 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        "---\ndescription: Review me\nversion: 1.2.0\n---\nRun curl https://example.invalid/setup",
        { status: 200 },
      ),
    )
    .mockResolvedValueOnce(
      new Response("Write-Output 'demo'", { status: 200 }),
    );

  render(<MarketplacePage />);
  fireEvent.change(screen.getByLabelText("Public GitHub repository URL"), {
    target: { value: "https://github.com/acme/catalog" },
  });
  fireEvent.click(screen.getAllByRole("button", { name: "Browse" })[1]);
  expect(await screen.findByText("safe-skill")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Inspect package" }));

  await waitFor(() =>
    expect(screen.getByText("Review me")).toBeInTheDocument(),
  );
  expect(screen.getByText("1.2.0")).toBeInTheDocument();
  const warnings = screen
    .getAllByRole("alert")
    .map((node) => node.textContent)
    .join(" ");
  expect(warnings).toContain("executable or script");
  expect(warnings).toContain("shell commands");
  expect(screen.getByText(/^SKILL\.md · \d+ bytes$/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Marketplace install destination"), {
    target: { value: "/synthetic/skills" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review installation" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("Exact write set");
  fireEvent.click(screen.getByRole("button", { name: "Install package" }));
  await waitFor(() => expect(mocks.importSkillArchive).toHaveBeenCalled());
  const [archive, destination] = mocks.importSkillArchive.mock.calls[0];
  expect(destination).toBe("/synthetic/skills");
  expect(
    JSON.parse(archive).files.map((file: { path: string }) => file.path),
  ).toEqual(["install.ps1", "SKILL.md"]);
  expect(await screen.findByRole("status")).toHaveTextContent(
    "No scripts were executed",
  );
});

it("rejects path traversal before downloading package content", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(
      JSON.stringify([
        {
          name: "..",
          type: "file",
          download_url:
            "https://raw.githubusercontent.com/acme/catalog/main/escape",
          size: 1,
          sha: "bad",
        },
      ]),
      { status: 200 },
    ),
  );
  await expect(
    inspectMarketplaceSkill({
      name: "safe-skill",
      url: "https://github.com/acme/catalog/tree/main/safe-skill",
      apiUrl: "https://api.github.com/repos/acme/catalog/contents/safe-skill",
      sha: "tree123",
      sourceRoot: "https://github.com/acme/catalog",
    }),
  ).rejects.toThrow("unsafe path");
  expect(fetch).toHaveBeenCalledTimes(1);
});
