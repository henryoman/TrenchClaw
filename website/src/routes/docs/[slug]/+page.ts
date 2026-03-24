import { error } from '@sveltejs/kit';
import { getDocRouteEntries, resolveDocRequest } from '../../../lib/docs';

export const prerender = true;

export const entries = () => getDocRouteEntries();

export const load = ({ params }: { params: { slug: string } }) => {
  const resolved = resolveDocRequest(params.slug);

  if (resolved.type === 'not-found') {
    throw error(404, 'Documentation page not found');
  }

  return { doc: resolved.doc, docs: resolved.docs };
};
