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
    title: 'Capability-gated execution',
    description: 'The model only gets the action and workspace tools that are present in the runtime capability snapshot for the current run.',
  },
  {
    title: 'Policy checks before side effects',
    description: 'Unsupported or disabled actions are blocked before execution, and dangerous actions can require explicit user confirmation.',
  },
  {
    title: 'Instance-scoped state',
    description: 'Vaults, wallets, settings, logs, caches, and workspace files live under one active instance instead of a loose shared folder.',
  },
  {
    title: 'Runtime-owned source of truth',
    description: 'The GUI is a client for runtime APIs. The canonical state lives in the runtime layer and on disk, not in frontend-only state.',
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
  { label: 'Runtime', value: 'Bun + TypeScript core runtime with action dispatch, policy evaluation, and local service boot.' },
  { label: 'Frontend', value: 'SvelteKit local GUI that talks to runtime transport APIs instead of owning durable state.' },
  { label: 'Solana', value: '@solana/kit plus provider-agnostic RPC wiring, wallet management, and Jupiter Ultra integration surfaces.' },
  { label: 'State', value: 'SQLite, JSONL logs, wallet sidecars, and instance-scoped filesystem storage under the runtime state root.' },
] as const;

export const comparison = [
  { feature: '.runtime', current: 'Repo-tracked runtime contract and template area', prior: 'Not the live mutable state root' },
  { feature: '.runtime-state', current: 'Per-instance mutable state for settings, vaults, wallets, logs, and SQLite', prior: 'This is the source of truth at runtime' },
  { feature: 'Workspace', current: 'Instance-scoped operator files, notes, configs, routines, and output', prior: 'Keeps automation and manual work attached to one instance' },
] as const;

export const getHomepageQuickLinks = () =>
  getFeaturedDocs().map(({ slug, title, description, source }) => ({
    label: title,
    slug,
    description,
    kind: source === 'shared' ? 'Reference' : 'Guide',
  }));
