<script lang="ts">
  import { docsSiteDescription, docsSiteTitle } from '$lib/docs';
  import DocsIndex from '$lib/components/docs/DocsIndex.svelte';
  import DocsShell from '$lib/components/docs/DocsShell.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{docsSiteTitle}</title>
  <meta name="description" content={docsSiteDescription} />
</svelte:head>

<DocsShell docs={data.docs}>
  <DocsIndex docs={data.docs} />
</DocsShell>
