export interface CatalogItem {
  name: string;
  url: string;
  apiUrl: string;
  sha: string;
  sourceRoot: string;
}

export interface InspectedSkill {
  name: string;
  text: string;
  source: string;
  sourceRoot: string;
  apiUrl: string;
  sha: string;
  files: { path: string; text: string; size: number }[];
  description: string;
  version: string;
  warnings: string[];
  scripts: string[];
  mcpFiles: string[];
  archive: string;
}

export interface MarketplaceInstall {
  name: string;
  sourceRoot: string;
  source: string;
  sha: string;
  version: string;
  destination: string;
  targetAgent: string;
  installedAt: string;
}

type GithubEntry = {
  type: string;
  name: string;
  html_url: string;
  url: string;
  download_url: string | null;
  size: number;
  sha: string;
};

function safeSegment(name: string) {
  return (
    name.length > 0 &&
    name.length <= 255 &&
    name !== "." &&
    name !== ".." &&
    !name.includes("/") &&
    !name.includes("\\") &&
    !name.includes(":") &&
    !name.includes("\0")
  );
}

function githubApi(url: string) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "api.github.com" ||
    parsed.username ||
    parsed.password
  )
    throw Error("GitHub returned an unsafe API URL.");
}

async function entries(url: string): Promise<GithubEntry[]> {
  githubApi(url);
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw Error(`GitHub returned ${response.status}.`);
  const value = (await response.json()) as unknown;
  if (!Array.isArray(value))
    throw Error("GitHub returned an invalid directory listing.");
  return value as GithubEntry[];
}

export async function browseMarketplaceSource(
  source: string,
): Promise<CatalogItem[]> {
  const normalized = source.trim().replace(/\.git\/?$/, "");
  const match = normalized.match(
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/,
  );
  if (!match)
    throw Error(
      "Enter a public HTTPS GitHub repository URL, for example https://github.com/org/skills.",
    );
  const apiUrl = `https://api.github.com/repos/${match[1]}/${match[2]}/contents`;
  const data = await entries(apiUrl);
  return data
    .filter((entry) => entry.type === "dir" && safeSegment(entry.name))
    .map((entry) => ({
      name: entry.name,
      url: entry.html_url,
      apiUrl: entry.url,
      sha: entry.sha,
      sourceRoot: normalized,
    }));
}

export async function inspectMarketplaceSkill(
  item: CatalogItem,
): Promise<InspectedSkill> {
  if (!safeSegment(item.name)) throw Error("The package name is not portable.");
  const files: { path: string; text: string; size: number }[] = [];
  let total = 0;
  async function walk(
    url: string,
    prefix: string,
    depth: number,
  ): Promise<void> {
    if (depth > 8)
      throw Error("Package folders are nested more than 8 levels deep.");
    for (const entry of await entries(url)) {
      if (!safeSegment(entry.name))
        throw Error("Package contains an unsafe path segment.");
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.type === "dir") {
        await walk(entry.url, path, depth + 1);
        continue;
      }
      if (entry.type !== "file")
        throw Error(`Unsupported GitHub entry type at ${path}: ${entry.type}.`);
      if (files.length >= 128)
        throw Error("Package contains more than 128 files.");
      if (entry.size > 1024 * 1024)
        throw Error(`${path} is larger than 1 MiB.`);
      if (
        /\.(exe|dll|dylib|so|bin|zip|tar|gz|7z|png|jpe?g|gif|webp|pdf)$/i.test(
          path,
        )
      )
        throw Error(
          `${path} is binary; ContextMeld skill archives accept UTF-8 text only.`,
        );
      if (!entry.download_url)
        throw Error(`${path} has no downloadable content.`);
      const download = new URL(entry.download_url);
      if (
        download.protocol !== "https:" ||
        download.hostname !== "raw.githubusercontent.com" ||
        download.username ||
        download.password
      )
        throw Error(`GitHub returned an unsafe download URL for ${path}.`);
      const response = await fetch(download.toString());
      if (!response.ok)
        throw Error(`Could not download ${path}: ${response.status}.`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 1024 * 1024)
        throw Error(`${path} is larger than 1 MiB.`);
      total += bytes.byteLength;
      if (total > 4 * 1024 * 1024)
        throw Error("Package contents are larger than 4 MiB.");
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw Error(`${path} is not valid UTF-8 text.`);
      }
      if (text.includes("\0"))
        throw Error(`${path} contains binary null bytes.`);
      files.push({ path, text, size: bytes.byteLength });
    }
  }
  await walk(item.apiUrl, "", 0);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const skill = files.find((file) => file.path === "SKILL.md");
  if (!skill) throw Error("This folder has no SKILL.md at its root.");
  const frontmatter = skill.text.match(/^---\s*([\s\S]*?)\s*---/);
  const field = (key: string) =>
    frontmatter?.[1]
      ?.split(/\r?\n/)
      .find((line) => line.trim().toLowerCase().startsWith(`${key}:`))
      ?.split(":")
      .slice(1)
      .join(":")
      .trim()
      .replace(/^['"]|['"]$/g, "") || "Unknown";
  const scripts = files
    .map((file) => file.path)
    .filter((path) => /\.(sh|bash|ps1|bat|cmd|py|js|mjs|cjs|ts)$/i.test(path));
  const mcpFiles = files
    .filter(
      (file) =>
        /(^|\/)(\.mcp\.json|mcp[^/]*\.(json|jsonc|toml))$/i.test(file.path) ||
        /\b(mcpServers|mcp_servers)\b/.test(file.text),
    )
    .map((file) => file.path);
  const combined = files.map((file) => file.text).join("\n");
  const warnings: string[] = [];
  if (scripts.length)
    warnings.push("This package contains executable or script files.");
  if (mcpFiles.length)
    warnings.push("This package contains or references MCP configuration.");
  if (
    /\b(curl|wget|invoke-webrequest|powershell|rm\s+-rf|format\s+c:|chmod\s+\+x)\b/i.test(
      combined,
    )
  )
    warnings.push(
      "Package text contains shell commands; review every occurrence before use.",
    );
  if (
    /\b(api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*['"][^$<{][^'"]+/i.test(
      combined,
    )
  )
    warnings.push(
      "Package text may contain a literal credential; inspect it before installation.",
    );
  const archive = JSON.stringify(
    {
      format: "contextmeld.skill",
      version: 1,
      name: item.name,
      files: files.map(({ path, text }) => ({ path, text })),
    },
    null,
    2,
  );
  return {
    ...item,
    source: item.url,
    text: skill.text,
    files,
    description: field("description"),
    version: field("version"),
    warnings,
    scripts,
    mcpFiles,
    archive,
  };
}

export async function checkMarketplaceUpdate(record: MarketplaceInstall) {
  const items = await browseMarketplaceSource(record.sourceRoot);
  const remote = items.find((item) => item.name === record.name);
  if (!remote) return "missing" as const;
  return remote.sha === record.sha
    ? ("current" as const)
    : ("available" as const);
}
