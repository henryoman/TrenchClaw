export const legacyDocSlugMap = {
  'instances-and-safety-profiles': 'getting-started',
  'runtime-and-frontends': 'getting-started',
  'acquire-sol-with-jupiter': 'getting-started',
  'solana-explained': 'getting-started',
  'ai-and-vault-setup': 'keys-and-settings',
  'wallet-management': 'beta-capabilities',
  'swaps-transfers-and-market-data': 'beta-capabilities',
  'routines-and-queueing': 'beta-capabilities',
  'troubleshooting-and-current-limitations': 'beta-capabilities',
  'beta-capability-matrix': 'beta-capabilities',
} as const satisfies Record<string, string>;

export const legacyDocSlugs = Object.keys(legacyDocSlugMap).sort();

export const resolveCanonicalDocSlug = (slug: string): string => legacyDocSlugMap[slug as keyof typeof legacyDocSlugMap] ?? slug;
