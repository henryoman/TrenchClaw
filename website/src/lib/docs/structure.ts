import type { DocListItem } from './types';

export const primaryDocSlugs = [
  'getting-started',
  'keys-and-settings',
  'beta-capabilities',
] as const;

export const referenceDocSlugs = ['architecture'] as const;

export const canonicalDocSlugs = [
  ...primaryDocSlugs,
  ...referenceDocSlugs,
] as const;

export const getDocRouteEntrySlugs = (): string[] => [...canonicalDocSlugs];

export const splitDocsBySection = (
  inputDocs: DocListItem[],
): { primary: DocListItem[]; reference: DocListItem[] } => ({
  primary: inputDocs.filter((doc) => primaryDocSlugs.includes(doc.slug as (typeof primaryDocSlugs)[number])),
  reference: inputDocs.filter((doc) => referenceDocSlugs.includes(doc.slug as (typeof referenceDocSlugs)[number])),
});
