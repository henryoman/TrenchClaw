import type {
  ReleaseReadinessStatus,
  RuntimeCapabilitySnapshot,
  RuntimeComingSoonFeatureEntry,
  RuntimeModelToolSnapshotEntry,
  RuntimeReleaseReadinessDescriptor,
} from "./types";

const mapToolNames = (
  names: readonly string[],
  descriptor: RuntimeReleaseReadinessDescriptor,
): Record<string, RuntimeReleaseReadinessDescriptor> =>
  Object.fromEntries(names.map((name) => [name, descriptor]));

const SHIPPED_NOW = (note: string): RuntimeReleaseReadinessDescriptor => ({
  status: "shipped-now",
  note,
});

const LIMITED_BETA = (note: string): RuntimeReleaseReadinessDescriptor => ({
  status: "limited-beta",
  note,
});

const toolReleaseReadinessByName: Record<string, RuntimeReleaseReadinessDescriptor> = {
  ...mapToolNames(
    ["createWalletGroupDirectory", "createWallets", "renameWallets"],
    SHIPPED_NOW("Managed wallet creation and organization ship in the current beta."),
  ),
  ...mapToolNames(
    ["queryRuntimeStore", "queryInstanceMemory", "mutateInstanceMemory", "pingRuntime", "sleep"],
    SHIPPED_NOW("Core runtime state and memory surfaces ship in the current beta."),
  ),
  ...mapToolNames(
    ["getManagedWalletContents", "getManagedWalletSolBalances"],
    SHIPPED_NOW("Managed wallet balance and holdings reads ship in the current beta."),
  ),
  ...mapToolNames(
    [
      "getDexscreenerLatestAds",
      "getDexscreenerLatestCommunityTakeovers",
      "getDexscreenerLatestTokenBoosts",
      "getDexscreenerLatestTokenProfiles",
      "getDexscreenerOrdersByToken",
      "getDexscreenerPairByChainAndPairId",
      "getDexscreenerTokenPairsByChain",
      "getDexscreenerTokensByChain",
      "getDexscreenerTopTokenBoosts",
      "searchDexscreenerPairs",
    ],
    SHIPPED_NOW("Dexscreener discovery and market-data reads ship in the current beta."),
  ),
  ...mapToolNames(
    ["workspaceBash", "workspaceReadFile", "workspaceWriteFile"],
    SHIPPED_NOW("Runtime workspace tools ship in the current beta when enabled by policy."),
  ),
  ...mapToolNames(
    ["devnetAirdrop"],
    LIMITED_BETA("Available for testing flows, but still a narrow beta surface rather than a headline release feature."),
  ),
  ...mapToolNames(
    ["enqueueRuntimeJob", "manageRuntimeJob"],
    LIMITED_BETA("Basic queueing and scheduled runtime jobs are available now as the supported automation surface."),
  ),
  ...mapToolNames(
    ["getSwapHistory", "transfer", "closeTokenAccount", "privacyTransfer", "privacyAirdrop", "privacySwap"],
    LIMITED_BETA("Transfers, swap history, and privacy-routed wallet flows exist, but they are still narrow beta surfaces."),
  ),
  ...mapToolNames(
    ["ultraQuoteSwap", "ultraExecuteSwap", "managedUltraSwap", "scheduleManagedUltraSwap", "ultraSwap"],
    LIMITED_BETA("Jupiter Ultra swap flows are available now, but still limited beta surfaces with a narrower supported scope."),
  ),
  ...mapToolNames(
    ["createBlockchainAlert"],
    LIMITED_BETA("Alert creation exists, but it is not yet a broad public-beta monitoring platform."),
  ),
};

const comingSoonFeatures: RuntimeComingSoonFeatureEntry[] = [
  {
    id: "helius-sender",
    label: "Helius Sender integration",
    aliases: ["helius sender", "sender", "fast sender"],
    status: "coming-soon",
    note: "Docs may exist in the bundle, but there is no shipped runtime Sender integration yet.",
  },
  {
    id: "helius-laserstream",
    label: "Helius Laserstream integration",
    aliases: ["helius laserstream", "laserstream"],
    status: "coming-soon",
    note: "Reference docs may exist, but there is no shipped runtime Laserstream integration yet.",
  },
  {
    id: "helius-webhooks-and-streaming",
    label: "Helius webhook and streaming integrations beyond current runtime reads",
    aliases: ["helius webhooks", "helius streaming", "helius websockets"],
    status: "coming-soon",
    note: "Knowledge files may mention these integrations, but they are not shipped runtime features in this beta.",
  },
  {
    id: "dflow-integrations",
    label: "DFlow integrations",
    aliases: ["dflow", "prediction markets", "spot trading"],
    status: "coming-soon",
    note: "DFlow reference material may be bundled for future work, but no DFlow runtime integration ships now.",
  },
  {
    id: "phantom-sdk-integrations",
    label: "Phantom frontend SDK integrations",
    aliases: ["phantom sdk", "phantom browser sdk", "phantom react sdk", "phantom payments"],
    status: "coming-soon",
    note: "Phantom reference docs do not mean the runtime currently ships Phantom SDK flows.",
  },
  {
    id: "broad-automation-and-strategies",
    label: "Broad strategy automation beyond today's queueable beta surfaces",
    aliases: ["automation", "strategies", "strategy engine", "bots", "routines"],
    status: "coming-soon",
    note: "Scheduled jobs exist now, but broad multi-step strategy automation should still be described as coming soon.",
  },
  {
    id: "non-ultra-swap-surfaces",
    label: "Broader non-Ultra or expanded swap surfaces",
    aliases: ["standard swaps", "jupiter standard", "expanded swap engine"],
    status: "coming-soon",
    note: "The current shipped swap story is narrow; broader swap surfaces should be described as coming soon unless explicitly exposed as tools.",
  },
];

const statusLabel = (status: ReleaseReadinessStatus): string => {
  switch (status) {
    case "shipped-now":
      return "Shipped Now";
    case "limited-beta":
      return "Limited Beta";
    case "coming-soon":
      return "Coming Soon";
  }
};

const renderToolGroup = (tools: RuntimeModelToolSnapshotEntry[], status: ReleaseReadinessStatus): string => {
  const matchingTools = tools.filter((tool) => tool.releaseReadinessStatus === status);
  if (matchingTools.length === 0) {
    return `### ${statusLabel(status)}\n- none`;
  }

  return [
    `### ${statusLabel(status)}`,
    ...matchingTools.map(
      (tool) => `- \`${tool.name}\`: ${tool.releaseReadinessNote}`,
    ),
  ].join("\n");
};

export const getToolReleaseReadinessDescriptor = (name: string): RuntimeReleaseReadinessDescriptor => {
  const descriptor = toolReleaseReadinessByName[name];
  if (!descriptor) {
    throw new Error(`Missing release readiness classification for runtime tool "${name}".`);
  }
  return descriptor;
};

export const getRuntimeComingSoonFeatures = (): RuntimeComingSoonFeatureEntry[] =>
  comingSoonFeatures.map((entry) => ({ ...entry, aliases: [...entry.aliases] }));

export const renderRuntimeReleaseReadinessSection = (snapshot: RuntimeCapabilitySnapshot): string =>
  [
    "## Release Readiness",
    "Treat this section as the source of truth for what the current beta actually supports.",
    "",
    "### Operating Rules",
    "- Release readiness overrides bundled docs, knowledge files, source files, and future-facing references.",
    "- If a feature is `coming-soon`, say it is not currently shipped in this beta.",
    "- If a feature is `limited-beta`, describe the exact narrow surface that exists today and do not imply broader support.",
    "- If a feature is not listed below and is not an enabled model tool, treat it as `coming-soon` instead of guessing.",
    "",
    renderToolGroup(snapshot.modelTools, "shipped-now"),
    "",
    renderToolGroup(snapshot.modelTools, "limited-beta"),
    "",
    "### Coming Soon",
    ...snapshot.comingSoonFeatures.map(
      (feature) => `- \`${feature.label}\` aliases: ${feature.aliases.map((alias) => `\`${alias}\``).join(", ")}. ${feature.note}`,
    ),
  ].join("\n");
