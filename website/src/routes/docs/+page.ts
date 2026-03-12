import { getDocsList } from '$lib/docs';

export const prerender = true;

export const load = () => ({
  docs: getDocsList()
});
