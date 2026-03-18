import { getDocBySlug, getDocsList } from './catalog';
import { legacyDocSlugs, resolveCanonicalDocSlug } from './aliases';
import { getDocRouteEntrySlugs } from './structure';
import type { DocPage } from './types';

export const getDocRouteEntries = (): Array<{ slug: string }> => [
  ...getDocRouteEntrySlugs().map((slug) => ({ slug })),
  ...legacyDocSlugs.map((slug) => ({ slug })),
];

export const resolveDocRequest = (
  slug: string,
):
  | { type: 'redirect'; location: string }
  | { type: 'doc'; doc: DocPage; docs: ReturnType<typeof getDocsList> }
  | { type: 'not-found' } => {
  const canonicalSlug = resolveCanonicalDocSlug(slug);
  if (canonicalSlug !== slug) {
    return {
      type: 'redirect',
      location: `/docs/${canonicalSlug}`,
    };
  }

  const doc = getDocBySlug(canonicalSlug);
  if (!doc) {
    return { type: 'not-found' };
  }

  return {
    type: 'doc',
    doc,
    docs: getDocsList(),
  };
};
