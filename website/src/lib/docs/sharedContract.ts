import type { DocSourceOverride } from "./types";

export const docsThemeStorageKey = "trenchclaw-docs-theme";
export const docsSiteTitle = "TrenchClaw Docs";
export const docsSiteDescription = "Clean TrenchClaw docs for install, runtime architecture, keys, settings, and local-first guard rails.";
export const homepageFeaturedDocCount = 3;

export const sharedDocSources: Record<string, DocSourceOverride> = {
  "/src/content/shared/architecture.md": {
    slug: "architecture",
    title: "Architecture",
    description: "How TrenchClaw actually ships: runtime authority, tool snapshots, lane routing, instance state, and execution boundaries.",
    order: 3,
    featured: true,
    source: "shared",
  },
};

export const websiteSharedContract = {
  canonicalArchitectureSource: "../ARCHITECTURE.md",
  generatedArchitectureCopy: "src/content/shared/architecture.md",
  installBootstrapScripts: [
    "static/install/macos-bootstrap.sh",
    "static/install/linux-bootstrap.sh",
  ],
  runtimeInstallerSource: "../scripts/install-trenchclaw.sh",
} as const;
