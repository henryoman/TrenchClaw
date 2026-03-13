import path from "node:path";
import { readdir, stat } from "node:fs/promises";

const OMITTED_DIRECTORY_NAMES = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  ".svelte-kit",
  ".vite",
  "dist",
  "build",
  "coverage",
]);

const sortEntries = (entries: Array<{ name: string; isDirectory: boolean }>) =>
  [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

type KnowledgeDocKind = "reference" | "guide" | "vendor-reference" | "skill-support";
type KnowledgeDocPriority = "read-first" | "read-second" | "escalate" | "specialized";
type KnowledgeDocMetadataRule = {
  matches: (relativePath: string) => boolean;
  metadata: KnowledgeDocMetadata;
};

export interface KnowledgeDocEntry {
  path: string;
  title: string;
  kind: KnowledgeDocKind;
  authority: "repo-authored" | "vendor-snapshot" | "generated-support";
  priority: KnowledgeDocPriority;
  topics: string[];
  readWhen: string;
}

export interface KnowledgeSkillPackSummary {
  name: string;
  path: string;
  title: string;
  referenceCount: number;
  topics: string[];
  readWhen: string;
}

export interface KnowledgeInventory {
  coreDocs: KnowledgeDocEntry[];
  deepDocs: KnowledgeDocEntry[];
  supportDocs: KnowledgeDocEntry[];
  skillPacks: KnowledgeSkillPackSummary[];
  tree: string;
}

type KnowledgeDocMetadata = Omit<KnowledgeDocEntry, "path">;

const KNOWLEDGE_WORKSPACE_ROOT = "src/ai/brain/knowledge";
const MANIFEST_AND_TOOLING_FILES = new Set(["KNOWLEDGE_MANIFEST.md", "knowledge-tree.ts"]);
const DOC_FILE_EXTENSIONS = new Set([".md", ".txt"]);

const CORE_DOC_METADATA = new Map<string, KnowledgeDocMetadata>([
  [
    "runtime-reference.md",
    {
      title: "Runtime Reference",
      kind: "reference",
      authority: "repo-authored",
      priority: "read-first",
      topics: ["runtime", "bootstrap", "capabilities", "state"],
      readWhen: "runtime architecture, bootstrap flow, capability exposure, or state-root questions",
    },
  ],
  [
    "settings-reference.md",
    {
      title: "Settings Reference",
      kind: "reference",
      authority: "repo-authored",
      priority: "read-first",
      topics: ["settings", "config", "vault", "profiles"],
      readWhen: "provider selection, settings ownership, overlay order, or vault lookup questions",
    },
  ],
  [
    "wallet-reference.md",
    {
      title: "Wallet Reference",
      kind: "reference",
      authority: "repo-authored",
      priority: "read-first",
      topics: ["wallet", "keypairs", "vault", "signing"],
      readWhen: "wallet organization, key material handling, or signing-path questions",
    },
  ],
  [
    "bash-tool.md",
    {
      title: "Workspace Bash Tool Guide",
      kind: "guide",
      authority: "repo-authored",
      priority: "read-second",
      topics: ["workspace", "bash", "tools", "filesystem"],
      readWhen: "workspace bash/read/write tool usage, shell discovery, or file inspection questions",
    },
  ],
  [
    "helius-agents.md",
    {
      title: "Helius Quick Ops",
      kind: "guide",
      authority: "repo-authored",
      priority: "read-second",
      topics: ["helius", "rpc", "cli", "agents"],
      readWhen: "Helius onboarding, RPC operations, DAS usage, or TrenchClaw Helius integration work",
    },
  ],
  [
    "solana-cli.md",
    {
      title: "Solana CLI Guide",
      kind: "guide",
      authority: "repo-authored",
      priority: "read-second",
      topics: ["solana", "cli", "wallet", "validator"],
      readWhen: "Solana CLI commands, validator inspection, or local wallet shell workflows",
    },
  ],
  [
    "solanacli-file-system-wallet.md",
    {
      title: "File System Wallets Using the CLI",
      kind: "guide",
      authority: "repo-authored",
      priority: "read-second",
      topics: ["solana", "wallet", "filesystem", "cli"],
      readWhen: "filesystem wallet creation, keypair verification, or Solana CLI wallet-file questions",
    },
  ],
]);

const DEEP_DOC_METADATA_RULES: KnowledgeDocMetadataRule[] = [
  {
    matches: (relativePath) => relativePath.endsWith("/bun-secrets-docs.md"),
    metadata: {
      title: "Bun Secrets Reference",
      kind: "vendor-reference",
      authority: "vendor-snapshot",
      priority: "escalate",
      topics: ["bun", "secrets", "env", "runtime"],
      readWhen: "Bun secrets API details are needed beyond the repo-authored short references",
    },
  },
  {
    matches: (relativePath) => relativePath.endsWith("/bun-shell-docs.md"),
    metadata: {
      title: "Bun Shell Reference",
      kind: "vendor-reference",
      authority: "vendor-snapshot",
      priority: "escalate",
      topics: ["bun", "shell", "cli", "scripts"],
      readWhen: "Bun shell syntax, escaping, streaming, or command-behavior details are needed",
    },
  },
  {
    matches: (relativePath) => relativePath.endsWith("/bun-sqlite-docs.md"),
    metadata: {
      title: "Bun SQLite Reference",
      kind: "vendor-reference",
      authority: "vendor-snapshot",
      priority: "escalate",
      topics: ["bun", "sqlite", "database", "sql"],
      readWhen: "Bun SQLite APIs, transactions, prepared statements, or schema details are needed",
    },
  },
  {
    matches: (relativePath) => relativePath.endsWith("/data-structures-as-json.md"),
    metadata: {
      title: "Data Structures as JSON",
      kind: "vendor-reference",
      authority: "vendor-snapshot",
      priority: "escalate",
      topics: ["json", "data-structures", "serialization"],
      readWhen: "JSON serialization behavior or data-shape conversion details are needed",
    },
  },
  {
    matches: (relativePath) => relativePath.endsWith("/helius.md"),
    metadata: {
      title: "Helius Reference",
      kind: "vendor-reference",
      authority: "vendor-snapshot",
      priority: "escalate",
      topics: ["helius", "rpc", "das", "sdk"],
      readWhen: "Helius API or SDK details exceed the short ops guide",
    },
  },
  {
    matches: (relativePath) => relativePath.endsWith("/helius-typescript-sdk.md"),
    metadata: {
      title: "Helius TypeScript SDK",
      kind: "vendor-reference",
      authority: "vendor-snapshot",
      priority: "escalate",
      topics: ["helius", "typescript", "sdk"],
      readWhen: "TypeScript SDK method shapes, examples, or client behavior are needed",
    },
  },
  {
    matches: (relativePath) => relativePath.endsWith("/helius-agents-llms.md"),
    metadata: {
      title: "Helius Agents Docs Index",
      kind: "vendor-reference",
      authority: "vendor-snapshot",
      priority: "specialized",
      topics: ["helius", "agents", "docs-index"],
      readWhen: "you need to discover which Helius agents docs pages exist before opening a deeper reference",
    },
  },
  {
    matches: (relativePath) => relativePath.endsWith("/helius-docs-llms-full.md"),
    metadata: {
      title: "Helius Full Docs Index",
      kind: "vendor-reference",
      authority: "vendor-snapshot",
      priority: "specialized",
      topics: ["helius", "docs-index", "discovery"],
      readWhen: "you need broad Helius doc discovery across multiple product areas",
    },
  },
  {
    matches: (relativePath) => relativePath.includes("/dexscreener/") && relativePath.endsWith("/api-reference.md"),
    metadata: {
      title: "Dexscreener API Reference",
      kind: "vendor-reference",
      authority: "vendor-snapshot",
      priority: "escalate",
      topics: ["dexscreener", "api", "market-data"],
      readWhen: "Dexscreener endpoints, parameters, or response-shape details are needed",
    },
  },
  {
    matches: (relativePath) =>
      relativePath.includes("/dexscreener/")
      && (relativePath.endsWith("/data-retreival-docs.md") || relativePath.endsWith("/dexscreener-actions.md")),
    metadata: {
      title: "Dexscreener Data Retrieval Guide",
      kind: "vendor-reference",
      authority: "vendor-snapshot",
      priority: "escalate",
      topics: ["dexscreener", "actions", "market-data"],
      readWhen: "Dexscreener request flows, action patterns, or data retrieval details are needed",
    },
  },
];

const SUPPORT_DOC_METADATA = new Map<string, KnowledgeDocMetadata>([
  [
    "skills/helius-docs-llms.txt",
    {
      title: "Helius Docs Index Snapshot",
      kind: "skill-support",
      authority: "generated-support",
      priority: "specialized",
      topics: ["helius", "docs-index", "discovery"],
      readWhen: "you need a raw Helius docs index snapshot to find deeper docs quickly",
    },
  ],
]);

const SKILL_METADATA = new Map<string, Omit<KnowledgeSkillPackSummary, "path" | "referenceCount">>([
  [
    "agent-browser",
    {
      name: "agent-browser",
      title: "Agent Browser Skill",
      topics: ["browser", "automation", "auth", "snapshots"],
      readWhen: "browser automation, authenticated sessions, profiling, or web capture work is requested",
    },
  ],
  [
    "helius",
    {
      name: "helius",
      title: "Helius Skill",
      topics: ["helius", "rpc", "das", "sender"],
      readWhen: "Helius API, SDK, onboarding, webhooks, or RPC workflows are requested",
    },
  ],
  [
    "helius-dflow",
    {
      name: "helius-dflow",
      title: "Helius DFlow Skill",
      topics: ["helius", "dflow", "trading", "websockets"],
      readWhen: "DFlow market integrations or combined Helius+DFlow flows are requested",
    },
  ],
  [
    "helius-phantom",
    {
      name: "helius-phantom",
      title: "Helius Phantom Skill",
      topics: ["helius", "phantom", "wallet", "frontend"],
      readWhen: "Phantom wallet integrations, frontend flows, or wallet app patterns are requested",
    },
  ],
  [
    "svm",
    {
      name: "svm",
      title: "SVM Skill",
      topics: ["solana", "svm", "programs", "transactions"],
      readWhen: "Solana VM architecture, execution, or low-level protocol topics are requested",
    },
  ],
]);

const toWorkspaceKnowledgePath = (relativePath: string): string => `${KNOWLEDGE_WORKSPACE_ROOT}/${relativePath}`;

const toTitleCase = (value: string): string =>
  value
    .split(/[-_]/g)
    .filter((part) => part.length > 0)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");

const createFallbackDocMetadata = (relativePath: string): KnowledgeDocMetadata => {
  const fileName = path.basename(relativePath, path.extname(relativePath));
  const topics = Array.from(new Set(relativePath.split(/[/.-]/g).filter((part) => part.length > 2))).slice(0, 4);
  const isDeepDoc = relativePath.startsWith("deep-knowledge/");
  return {
    title: toTitleCase(fileName),
    kind: isDeepDoc ? "vendor-reference" : "guide",
    authority: isDeepDoc ? "vendor-snapshot" : "repo-authored",
    priority: isDeepDoc ? "escalate" : "read-second",
    topics,
    readWhen: isDeepDoc
      ? "you need a deeper provider or API reference than the short repo-authored guides provide"
      : "the task matches this topic and the smaller reference docs do not fully answer it",
  };
};

const resolveKnownDocMetadata = (relativePath: string): KnowledgeDocMetadata | null => {
  const coreDoc = CORE_DOC_METADATA.get(relativePath);
  if (coreDoc) {
    return coreDoc;
  }

  const supportDoc = SUPPORT_DOC_METADATA.get(relativePath);
  if (supportDoc) {
    return supportDoc;
  }

  return DEEP_DOC_METADATA_RULES.find((rule) => rule.matches(relativePath))?.metadata ?? null;
};

const isDocFile = (relativePath: string): boolean => {
  const extension = path.extname(relativePath);
  return DOC_FILE_EXTENSIONS.has(extension) && !MANIFEST_AND_TOOLING_FILES.has(path.basename(relativePath));
};

const walkFiles = async (targetDir: string, relativeDir = ""): Promise<string[]> => {
  const entries = sortEntries(
    (await Promise.all(
      (await readdir(path.join(targetDir, relativeDir)))
        .filter((name) => !OMITTED_DIRECTORY_NAMES.has(name))
        .map(async (name) => {
          const absolutePath = path.join(targetDir, relativeDir, name);
          const fileStat = await stat(absolutePath);
          return {
            name,
            isDirectory: fileStat.isDirectory(),
          };
        }),
    )),
  );

  const files: string[] = [];
  for (const entry of entries) {
    const childRelativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory) {
      files.push(...(await walkFiles(targetDir, childRelativePath)));
      continue;
    }
    files.push(childRelativePath);
  }

  return files;
};

const compareDocEntries = (a: KnowledgeDocEntry, b: KnowledgeDocEntry): number => a.path.localeCompare(b.path);

const compareSkillPacks = (a: KnowledgeSkillPackSummary, b: KnowledgeSkillPackSummary): number => a.path.localeCompare(b.path);

const toDocEntry = (relativePath: string): KnowledgeDocEntry => {
  const metadata = resolveKnownDocMetadata(relativePath) ?? createFallbackDocMetadata(relativePath);

  return {
    path: toWorkspaceKnowledgePath(relativePath),
    ...metadata,
  };
};

const buildSkillPackSummary = (skillName: string, referenceCount: number): KnowledgeSkillPackSummary => {
  const metadata = SKILL_METADATA.get(skillName) ?? {
    name: skillName,
    title: `${toTitleCase(skillName)} Skill`,
    topics: skillName.split("-").filter((part) => part.length > 0),
    readWhen: "the user request clearly matches this skill pack's domain",
  };

  return {
    path: toWorkspaceKnowledgePath(`skills/${skillName}/SKILL.md`),
    referenceCount,
    ...metadata,
  };
};

const renderDocTable = (
  headings: readonly string[],
  rows: string[][],
): string => [
  `| ${headings.join(" | ")} |`,
  `| ${headings.map(() => "---").join(" | ")} |`,
  ...rows.map((row) => `| ${row.join(" | ")} |`),
].join("\n");

export const buildKnowledgeInventory = async (targetDir: string): Promise<KnowledgeInventory> => {
  const resolved = path.resolve(targetDir);
  const fileStat = await stat(resolved);
  if (!fileStat.isDirectory()) {
    throw new Error(`Expected directory path, received: ${resolved}`);
  }

  const [tree, relativeFiles] = await Promise.all([renderDirectoryTree(resolved), walkFiles(resolved)]);
  const docFiles = relativeFiles.filter(isDocFile);

  const coreDocs = docFiles
    .filter((relativePath) => !relativePath.startsWith("deep-knowledge/") && !relativePath.startsWith("skills/"))
    .map(toDocEntry)
    .sort(compareDocEntries);

  const deepDocs = docFiles
    .filter((relativePath) => relativePath.startsWith("deep-knowledge/"))
    .map(toDocEntry)
    .sort(compareDocEntries);

  const supportDocs = docFiles
    .filter(
      (relativePath) =>
        relativePath.startsWith("skills/")
        && !relativePath.endsWith("/SKILL.md")
        && !relativePath.includes(`${path.sep}references${path.sep}`),
    )
    .map(toDocEntry)
    .sort(compareDocEntries);

  const skillReferenceCounts = new Map<string, number>();
  for (const relativePath of relativeFiles) {
    if (!relativePath.startsWith("skills/")) {
      continue;
    }
    const [, skillName, ...rest] = relativePath.split(path.sep);
    if (!skillName || rest[0] !== "references") {
      continue;
    }
    skillReferenceCounts.set(skillName, (skillReferenceCounts.get(skillName) ?? 0) + 1);
  }

  const skillPacks = relativeFiles
    .filter((relativePath) => relativePath.startsWith("skills/") && relativePath.endsWith("/SKILL.md"))
    .map((relativePath) => {
      const skillName = relativePath.split(path.sep)[1];
      return buildSkillPackSummary(skillName!, skillReferenceCounts.get(skillName!) ?? 0);
    })
    .sort(compareSkillPacks);

  return {
    coreDocs,
    deepDocs,
    supportDocs,
    skillPacks,
    tree,
  };
};

export const renderKnowledgeRoutingSummary = async (targetDir: string): Promise<string> => {
  const inventory = await buildKnowledgeInventory(targetDir);

  const coreDocRows = inventory.coreDocs.map((entry) => [
    `\`${entry.path}\``,
    entry.kind,
    entry.priority,
    entry.readWhen,
  ]);

  const deepDocRows = inventory.deepDocs.map((entry) => [
    `\`${entry.path}\``,
    entry.topics.join(", "),
    entry.readWhen,
  ]);

  const skillPackRows = inventory.skillPacks.map((entry) => [
    `\`${entry.path}\``,
    String(entry.referenceCount),
    entry.topics.join(", "),
    entry.readWhen,
  ]);

  return [
    "## Knowledge Routing",
    "- Treat runtime contract and exact enabled tools as higher authority than any doc file.",
    "- Read repo-authored reference docs first for runtime, settings, wallet, and workspace behavior.",
    "- Read repo-authored guides second for concrete workflows and local conventions.",
    "- Escalate to `deep-knowledge/` only when short refs are insufficient or exact provider/API detail is required.",
    "- Open a skill pack only when the request clearly matches that skill's domain or workflow.",
    "",
    "### Core Docs",
    renderDocTable(["path", "kind", "priority", "read when"], coreDocRows),
    "",
    "### Deep References",
    renderDocTable(["path", "topics", "read when"], deepDocRows),
    "",
    "### Skill Packs",
    renderDocTable(["path", "refs", "topics", "read when"], skillPackRows),
  ].join("\n");
};

export const renderKnowledgeManifestMarkdown = async (
  targetDir: string,
  generatedAt: string,
): Promise<string> => {
  const inventory = await buildKnowledgeInventory(targetDir);
  const coreDocRows = inventory.coreDocs.map((entry) => [
    `\`${entry.path}\``,
    entry.kind,
    entry.priority,
    entry.authority,
    entry.readWhen,
  ]);
  const deepDocRows = inventory.deepDocs.map((entry) => [
    `\`${entry.path}\``,
    entry.topics.join(", "),
    entry.priority,
    entry.readWhen,
  ]);
  const skillPackRows = inventory.skillPacks.map((entry) => [
    `\`${entry.path}\``,
    String(entry.referenceCount),
    entry.topics.join(", "),
    entry.readWhen,
  ]);
  const supportDocRows = inventory.supportDocs.map((entry) => [
    `\`${entry.path}\``,
    entry.kind,
    entry.readWhen,
  ]);

  return `# Knowledge Manifest

Generated at: ${generatedAt}
Root: ${KNOWLEDGE_WORKSPACE_ROOT}

Use this manifest to choose the smallest correct doc set before opening files.

## Routing Rules

- Treat the live runtime contract, enabled tool allowlist, and resolved settings as higher authority than docs.
- Start with repo-authored reference docs for runtime, settings, wallet, and workspace behavior.
- Use repo-authored guides for local workflows, command patterns, and integration shortcuts.
- Escalate to deep vendor references only when exact API/provider detail is required.
- Use skill packs when the task clearly matches a skill workflow; the \`SKILL.md\` file is the entry point.

## Core Docs

${renderDocTable(["path", "kind", "priority", "authority", "read when"], coreDocRows)}

## Deep References

${renderDocTable(["path", "topics", "priority", "read when"], deepDocRows)}

## Skill Packs

${renderDocTable(["path", "refs", "topics", "read when"], skillPackRows)}

## Support Files

${renderDocTable(["path", "kind", "read when"], supportDocRows)}

## Directory Tree

\`\`\`text
${inventory.tree}
\`\`\`
`;
};

const renderTree = async (
  targetDir: string,
  prefix = "",
  rootName?: string,
): Promise<string[]> => {
  const dirEntries = await readdir(targetDir);
  const normalized = sortEntries(
    await Promise.all(
      dirEntries
        .filter((name: string) => !OMITTED_DIRECTORY_NAMES.has(name))
        .map(async (name: string) => {
          const absolutePath = path.join(targetDir, name);
          const fileStat = await stat(absolutePath);
          return {
            name,
            isDirectory: fileStat.isDirectory(),
          };
        }),
    ),
  );

  const rootLabel = rootName ?? path.basename(targetDir);
  const lines: string[] = prefix ? [] : [`${rootLabel}/`];

  for (let index = 0; index < normalized.length; index += 1) {
    const entry = normalized[index]!;
    const absolutePath = path.join(targetDir, entry.name);
    const isLast = index === normalized.length - 1;
    const branch = isLast ? "`-- " : "|-- ";
    lines.push(`${prefix}${branch}${entry.name}${entry.isDirectory ? "/" : ""}`);

    if (entry.isDirectory) {
      const childPrefix = `${prefix}${isLast ? "    " : "|   "}`;
      const childLines = await renderTree(absolutePath, childPrefix);
      lines.push(...childLines);
    }
  }

  return lines;
};

export const renderDirectoryTree = async (targetDir: string): Promise<string> => {
  const resolved = path.resolve(targetDir);
  const fileStat = await stat(resolved);
  if (!fileStat.isDirectory()) {
    throw new Error(`Expected directory path, received: ${resolved}`);
  }

  const lines = await renderTree(resolved, "", path.basename(resolved));
  return lines.join("\n");
};
