import { getDocBySlug, getDocsList } from './catalog';
import { getDocRouteEntrySlugs } from './structure';
import type { DocPage } from './types';

export const getDocRouteEntries = (): Array<{ slug: string }> => getDocRouteEntrySlugs().map((slug) => ({ slug }));

export const resolveDocRequest = (
  slug: string,
):
  | { type: 'doc'; doc: DocPage; docs: ReturnType<typeof getDocsList> }
  | { type: 'not-found' } => {
  const doc = getDocBySlug(slug);
  if (!doc) {
    return { type: 'not-found' };
  }

  return {
    type: 'doc',
    doc,
    docs: getDocsList(),
  };
};
