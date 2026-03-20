export const legacyDocSlugMap = {
  'beta-capabilities': 'getting-started',
  'instances-and-safety-profiles': 'getting-started',
  'runtime-and-frontends': 'getting-started',
  'acquire-sol-with-jupiter': 'getting-started',
  'solana-explained': 'getting-started',
  'ai-and-vault-setup': 'keys-and-settings',
  'wallet-management': 'getting-started',
  'swaps-transfers-and-market-data': 'keys-and-settings',
  'routines-and-queueing': 'getting-started',
  'troubleshooting-and-current-limitations': 'getting-started',
  'beta-capability-matrix': 'getting-started',
} as const satisfies Record<string, string>;

export const legacyDocSlugs = Object.keys(legacyDocSlugMap).toSorted();

export const resolveCanonicalDocSlug = (slug: string): string => legacyDocSlugMap[slug as keyof typeof legacyDocSlugMap] ?? slug;
