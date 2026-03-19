import { getFeaturedDocs } from '$lib/docs';

export const githubUrl = 'https://github.com/henryoman/trenchclaw';
export const xUrl = 'https://x.com/trenchclawagent';
export const architectureHref = '/docs/architecture';

export const installTargets = [
  {
    label: 'macOS',
    command: "curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/macos-bootstrap.sh | bash",
  },
  {
    label: 'Linux',
    command: "curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/linux-bootstrap.sh | bash",
  },
] as const;

export const docsPrerequisiteBootstrap = {
  label: 'Prerequisite installer',
  description: 'Run this if you want TrenchClaw to install or update the optional external CLIs used by some workflows.',
  command: 'curl -fsSL https://raw.githubusercontent.com/henryoman/trenchclaw/main/scripts/install-required-tools.sh | sh',
  note: 'Today this helper manages Solana CLI and Helius CLI. For Helius it prefers Bun, then pnpm, and prints manual install commands if none are available.',
} as const;

export const docsPrerequisites = [
  {
    label: 'Solana CLI',
    kind: 'Optional workflow tool',
    description: 'Useful for shell commands, chain-side debugging, and CLI-backed helper workflows.',
    command: 'sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"',
  },
  {
    label: 'Helius CLI',
    kind: 'Optional workflow tool',
    description: 'Useful for Helius project setup, API key management, RPC endpoint lookup, and shell automation.',
    command: 'bun add -g helius-cli@latest',
  },
  {
    label: 'Helius API key',
    kind: 'Required key',
    description: 'Needed for Helius-backed RPC, DAS, enhanced transaction lookups, and related runtime integrations.',
    command: null,
  },
  {
    label: 'OpenRouter API key',
    kind: 'Required key',
    description: 'Needed for the default AI provider path used by TrenchClaw.',
    command: null,
  },
  {
    label: 'Jupiter Ultra API key',
    kind: 'Required key',
    description: 'Needed for Jupiter Ultra access when swap flows call the Ultra API.',
    command: null,
  },
] as const;

export const principles = [
  {
    title: 'Automate repeatable tasks',
    description: 'Actions, routines, and runtime controls are organized around the workflows operators actually run.',
  },
  {
    title: 'Manage wallets locally',
    description: 'Wallet groups, keypair dumps, and sidecar metadata stay aligned with the runtime contract.',
  },
  {
    title: 'Use validated actions',
    description: 'Validated actions, policy checks, and local state make runs easier to inspect and debug.',
  },
] as const;

export const terminalLines = [
  { tone: 'dim', text: '$ trenchclaw' },
  { tone: 'dim', text: 'booting runtime...' },
  { tone: 'bright', text: 'readonly app loaded from ~/.local/share/trenchclaw/current' },
  { tone: 'bright', text: 'state root: ~/.trenchclaw' },
  { tone: 'bright', text: 'scheduler online' },
  { tone: 'dim', text: 'web gui: http://127.0.0.1:4173' },
  { tone: 'dim', text: 'docs: /docs/getting-started' },
  { tone: 'bright', text: 'ready for actions and routines' },
] as const;

export const stack = [
  { label: 'Stack', value: 'Compiled Bun binary, TypeScript, and a local web app' },
  { label: 'Solana', value: '@solana/kit with provider-agnostic RPC adapters' },
  { label: 'Agent', value: 'AI SDK orchestration with runtime policies' },
  { label: 'State', value: 'SQLite, JSONL indexes, and protected filesystem storage' },
] as const;

export const comparison = [
  { feature: 'Actions', current: 'Validated modules for on-chain and runtime tasks', prior: 'Reduces invalid execution' },
  { feature: 'Routines', current: 'Automated flows for repeated runtime work', prior: 'Keeps execution consistent across runs' },
  { feature: 'Storage', current: 'SQLite, JSONL sidecars, and protected filesystem paths', prior: 'Local state stays inspectable and durable' },
] as const;

export const getHomepageQuickLinks = () =>
  getFeaturedDocs().map(({ slug, title, description }) => ({
    label: title,
    slug,
    description,
  }));
