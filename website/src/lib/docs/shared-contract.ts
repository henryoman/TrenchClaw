import type { DocSourceOverride } from './types';

export const docsThemeStorageKey = 'trenchclaw-docs-theme';
export const docsSiteTitle = 'TrenchClaw Docs';
export const docsSiteDescription = 'Straightforward TrenchClaw docs for install, keys, and the settings that matter right now.';
export const homepageFeaturedDocCount = 2;

export const sharedDocSources: Record<string, DocSourceOverride> = {
  '/src/content/shared/architecture.md': {
    slug: 'architecture',
    title: 'Architecture',
    description: 'The real TrenchClaw architecture: repo layout, boot flow, settings layering, runtime execution, chat tooling, and state boundaries.',
    order: 2,
    source: 'shared',
  },
};

export const websiteSharedContract = {
  canonicalArchitectureSource: '../ARCHITECTURE.md',
  generatedArchitectureCopy: 'src/content/shared/architecture.md',
  installBootstrapScripts: [
    'static/install/macos-bootstrap.sh',
    'static/install/linux-bootstrap.sh',
  ],
  runtimeInstallerSource: '../scripts/install-trenchclaw.sh',
} as const;
