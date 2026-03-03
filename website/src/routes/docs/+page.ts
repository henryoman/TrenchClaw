import { getDocsList } from '$lib/docs/content';

export const prerender = true;

export const load = () => ({
  docs: getDocsList()
});
