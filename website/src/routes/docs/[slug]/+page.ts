import { error } from '@sveltejs/kit';
import { getDocBySlug, getDocsList } from '$lib/docs';

export const prerender = true;

export const entries = () => getDocsList().map((doc) => ({ slug: doc.slug }));

export const load = ({ params }) => {
  const doc = getDocBySlug(params.slug);

  if (!doc) {
    throw error(404, 'Documentation page not found');
  }

  return { doc, docs: getDocsList() };
};
