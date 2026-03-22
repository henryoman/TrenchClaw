import path from "node:path";
import { readdir, stat } from "node:fs/promises";

import { CORE_APP_ROOT } from "../../runtime/runtime-paths";

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
  [...entries].toSorted((a, b) => {
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

export interface KnowledgeLookupEntry {
  kind: "core-doc" | "deep-doc" | "support-doc" | "skill-pack";
  alias: string;
  aliases: string[];
  path: string;
  title: string;
  topics: string[];
  readWhen: string;
  priority?: KnowledgeDocPriority;
  authority?: KnowledgeDocEntry["authority"];
  referenceCount?: number;
}

type KnowledgeDocMetadata = Omit<KnowledgeDocEntry, "path">;

const KNOWLEDGE_ROOT_ENV = "TRENCHCLAW_KNOWLEDGE_DIR";
export const KNOWLEDGE_WORKSPACE_ROOT = "src/ai/brain/knowledge";
const INDEX_AND_SUPPORT_FILES = new Set(["KNOWLEDGE_MANIFEST.md"]);
const DOC_FILE_EXTENSIONS = new Set([".md", ".txt"]);
const KNOWLEDGE_ROUTING_RULES = [
  "Treat live runtime state, enabled tools, filesystem policy, and resolved settings as higher authority than docs.",
  "Use `listKnowledgeDocs` to browse or search the knowledge registry only when a live runtime tool is not enough.",
  "Use `readKnowledgeDoc` only after you know the alias or exact doc name.",
  "Start with repo-authored reference docs before deep vendor references.",
  "Open a skill pack only when the task clearly matches that skill's domain or workflow.",
] as const;

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
    matches: (relativePath) => relativePath.endsWith("/helius-cli.md"),
    metadata: {
      title: "Helius CLI Guide",
      kind: "vendor-reference",
      authority: "vendor-snapshot",
      priority: "escalate",
      topics: ["helius", "cli", "onboarding", "commands"],
      readWhen: "Helius CLI install, signup, config, or shell-automation details are needed",
    },
  },
  {
    matches: (relativePath) => relativePath.endsWith("/helius-cli-commands.md"),
    metadata: {
      title: "Helius CLI Commands",
      kind: "vendor-reference",
      authority: "vendor-snapshot",
      priority: "escalate",
      topics: ["helius", "cli", "commands", "reference"],
      readWhen: "you need the command-family lookup for the Helius CLI",
    },
  },
  {
    matches: (relativePath) => relativePath.endsWith("/helius-cli-readme.md"),
    metadata: {
      title: "Helius CLI README",
      kind: "vendor-reference",
      authority: "vendor-snapshot",
      priority: "specialized",
      topics: ["helius", "cli", "examples", "readme"],
      readWhen: "you want upstream CLI repo examples or to cross-check docs against the README",
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
  return DOC_FILE_EXTENSIONS.has(extension) && !INDEX_AND_SUPPORT_FILES.has(path.basename(relativePath));
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

  return (await Promise.all(
    entries.map(async (entry) => {
      const childRelativePath = path.join(relativeDir, entry.name);
      if (entry.isDirectory) {
        return walkFiles(targetDir, childRelativePath);
      }
      return [childRelativePath];
    }),
  )).flat();
};

const compareDocEntries = (a: KnowledgeDocEntry, b: KnowledgeDocEntry): number => a.path.localeCompare(b.path);

const compareSkillPacks = (a: KnowledgeSkillPackSummary, b: KnowledgeSkillPackSummary): number => a.path.localeCompare(b.path);

const normalizeSelector = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\.(md|txt)$/gu, "")
    .replace(/[`"'"]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

const toDocEntry = (relativePath: string): KnowledgeDocEntry => {
  const metadata = resolveKnownDocMetadata(relativePath) ?? createFallbackDocMetadata(relativePath);

  return {
    path: toWorkspaceKnowledgePath(relativePath),
    ...metadata,
  };
};

const buildDocAliasCandidates = (entry: KnowledgeDocEntry): string[] => {
  const relativePath = entry.path.replace(`${KNOWLEDGE_WORKSPACE_ROOT}/`, "");
  const withoutExtension = relativePath.replace(/\.(md|txt)$/u, "");
  const basename = path.basename(withoutExtension);
  const withoutDeepPrefix = withoutExtension.replace(/^deep-knowledge\//u, "");
  const withoutSkillsPrefix = withoutExtension.replace(/^skills\//u, "");
  const titleAlias = normalizeSelector(entry.title);
  return [
    basename,
    withoutExtension.replaceAll(path.sep, "-"),
    withoutDeepPrefix.replaceAll(path.sep, "-"),
    withoutSkillsPrefix.replaceAll(path.sep, "-"),
    titleAlias,
  ]
    .map(normalizeSelector)
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
};

const buildSkillAliasCandidates = (entry: KnowledgeSkillPackSummary): string[] =>
  [
    entry.name,
    `${entry.name}-skill`,
    `skill-${entry.name}`,
    normalizeSelector(entry.title),
    entry.path
      .replace(`${KNOWLEDGE_WORKSPACE_ROOT}/`, "")
      .replace(/\.(md|txt)$/u, "")
      .replaceAll(path.sep, "-"),
  ]
    .map(normalizeSelector)
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);

const choosePrimaryAlias = (candidates: string[], usedAliases: Set<string>, fallbackSeed: string): string => {
  for (const candidate of candidates) {
    if (!usedAliases.has(candidate)) {
      usedAliases.add(candidate);
      return candidate;
    }
  }
  let suffix = 2;
  let fallback = `${normalizeSelector(fallbackSeed)}-${suffix}`;
  while (usedAliases.has(fallback)) {
    suffix += 1;
    fallback = `${normalizeSelector(fallbackSeed)}-${suffix}`;
  }
  usedAliases.add(fallback);
  return fallback;
};

const buildKnowledgeLookupEntries = (inventory: KnowledgeInventory): KnowledgeLookupEntry[] => {
  const usedAliases = new Set<string>();
  const entries: KnowledgeLookupEntry[] = [];

  const pushDocEntries = (kind: KnowledgeLookupEntry["kind"], docs: KnowledgeDocEntry[]) => {
    for (const doc of docs) {
      const candidates = buildDocAliasCandidates(doc);
      const alias = choosePrimaryAlias(candidates, usedAliases, doc.title);
      entries.push({
        kind,
        alias,
        aliases: candidates,
        path: doc.path,
        title: doc.title,
        topics: doc.topics,
        readWhen: doc.readWhen,
        priority: doc.priority,
        authority: doc.authority,
      });
    }
  };

  pushDocEntries("core-doc", inventory.coreDocs);
  pushDocEntries("deep-doc", inventory.deepDocs);
  pushDocEntries("support-doc", inventory.supportDocs);

  for (const skill of inventory.skillPacks) {
    const candidates = buildSkillAliasCandidates(skill);
    const alias = choosePrimaryAlias(candidates, usedAliases, skill.title);
    entries.push({
      kind: "skill-pack",
      alias,
      aliases: candidates,
      path: skill.path,
      title: skill.title,
      topics: skill.topics,
      readWhen: skill.readWhen,
      referenceCount: skill.referenceCount,
    });
  }

  return entries.toSorted((a, b) => a.alias.localeCompare(b.alias));
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

export const resolveKnowledgeRoot = (): string => {
  const configuredRoot = process.env[KNOWLEDGE_ROOT_ENV]?.trim();
  if (!configuredRoot) {
    return path.join(CORE_APP_ROOT, KNOWLEDGE_WORKSPACE_ROOT);
  }
  return path.isAbsolute(configuredRoot) ? path.resolve(configuredRoot) : path.resolve(CORE_APP_ROOT, configuredRoot);
};

export const renderKnowledgeRoutingRules = (): string =>
  KNOWLEDGE_ROUTING_RULES.map((rule) => `- ${rule}`).join("\n");

export const renderKnowledgePromptSummary = (): string => [
  "## Knowledge Index",
  "- core doc aliases: `runtime-reference`, `settings-reference`, `wallet-reference`, `bash-tool`, `helius-agents`, `solana-cli`, `solanacli-file-system-wallet`",
  "- skill pack aliases: use `listKnowledgeDocs` to see the available knowledge docs, deep references, and skill packs",
  "- use `runtime-reference` for runtime roots, shipped bundle contents, and first-run generated defaults",
  "- use `listKnowledgeDocs` to see the available knowledge docs, deep references, and skill packs",
  '- Use `tier = "skills"` when you specifically need a skill pack.',
  "## Knowledge Routing",
  renderKnowledgeRoutingRules(),
  "- Start with `runtime-reference` for runtime behavior and `settings-reference` for settings ownership.",
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
    .toSorted(compareDocEntries);

  const deepDocs = docFiles
    .filter((relativePath) => relativePath.startsWith("deep-knowledge/"))
    .map(toDocEntry)
    .toSorted(compareDocEntries);

  const supportDocs = docFiles
    .filter(
      (relativePath) =>
        relativePath.startsWith("skills/")
        && !relativePath.endsWith("/SKILL.md")
        && !relativePath.includes(`${path.sep}references${path.sep}`),
    )
    .map(toDocEntry)
    .toSorted(compareDocEntries);

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
    .toSorted(compareSkillPacks);

  return {
    coreDocs,
    deepDocs,
    supportDocs,
    skillPacks,
    tree,
  };
};

export const buildKnowledgeLookup = async (targetDir: string): Promise<KnowledgeLookupEntry[]> =>
  buildKnowledgeLookupEntries(await buildKnowledgeInventory(targetDir));

export const resolveKnowledgeLookupEntry = async (
  targetDir: string,
  selector: string,
): Promise<KnowledgeLookupEntry | null> => {
  const normalizedSelector = normalizeSelector(selector);
  if (!normalizedSelector) {
    return null;
  }
  const entries = await buildKnowledgeLookup(targetDir);
  const exactMatch = entries.find(
    (entry) =>
      normalizeSelector(entry.alias) === normalizedSelector
      || normalizeSelector(entry.path) === normalizedSelector
      || entry.aliases.some((alias) => normalizeSelector(alias) === normalizedSelector),
  );
  if (exactMatch) {
    return exactMatch;
  }
  return (
    entries.find(
      (entry) =>
        normalizeSelector(entry.title) === normalizedSelector
        || entry.topics.some((topic) => normalizeSelector(topic) === normalizedSelector),
    ) ?? null
  );
};

export const renderKnowledgeIndexMarkdown = async (
  targetDir: string,
  generatedAt: string,
): Promise<string> => {
  const inventory = await buildKnowledgeInventory(targetDir);
  const coreDocRows = inventory.coreDocs.map((entry) => [
    `\`${entry.path}\``,
    entry.title,
    entry.kind,
    entry.priority,
    entry.readWhen,
  ]);
  const deepDocRows = inventory.deepDocs.map((entry) => [
    `\`${entry.path}\``,
    entry.title,
    entry.topics.join(", "),
    entry.readWhen,
  ]);
  const skillPackRows = inventory.skillPacks.map((entry) => [
    `\`${entry.path}\``,
    entry.title,
    String(entry.referenceCount),
    entry.topics.join(", "),
    entry.readWhen,
  ]);
  const supportDocRows = inventory.supportDocs.map((entry) => [
    `\`${entry.path}\``,
    entry.title,
    entry.kind,
    entry.readWhen,
  ]);

  return `# Knowledge Index

Generated at: ${generatedAt}
Root: ${KNOWLEDGE_WORKSPACE_ROOT}

Use this index to see what knowledge exists before opening any specific file.

## Routing Rules

${renderKnowledgeRoutingRules()}

## Core Docs

${renderDocTable(["path", "title", "kind", "priority", "read when"], coreDocRows)}

## Deep References

${renderDocTable(["path", "title", "topics", "read when"], deepDocRows)}

## Skill Packs

${renderDocTable(["path", "title", "refs", "topics", "read when"], skillPackRows)}

## Support Files

${renderDocTable(["path", "title", "kind", "read when"], supportDocRows)}

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
  const childLines = (await Promise.all(
    normalized.map(async (entry, index) => {
      const absolutePath = path.join(targetDir, entry.name);
      const isLast = index === normalized.length - 1;
      const branch = isLast ? "`-- " : "|-- ";
      const lines = [`${prefix}${branch}${entry.name}${entry.isDirectory ? "/" : ""}`];

      if (entry.isDirectory) {
        const nestedPrefix = `${prefix}${isLast ? "    " : "|   "}`;
        lines.push(...(await renderTree(absolutePath, nestedPrefix)));
      }

      return lines;
    }),
  )).flat();

  return prefix ? childLines : [`${rootLabel}/`, ...childLines];
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
