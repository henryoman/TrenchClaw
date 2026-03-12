<script lang="ts">
  import DocsArticle from '$lib/components/docs/DocsArticle.svelte';
  import DocsShell from '$lib/components/docs/DocsShell.svelte';
  import { docsSiteTitle } from '$lib/docs';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{data.doc.title} | {docsSiteTitle}</title>
  <meta name="description" content={data.doc.description} />
</svelte:head>

<DocsShell docs={data.docs} currentSlug={data.doc.slug} toc={data.doc.headings}>
  <DocsArticle doc={data.doc} />
</DocsShell>
