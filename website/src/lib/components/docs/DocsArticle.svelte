<script lang="ts">
  import { resolve } from '$app/paths';
  import type { DocPage } from '$lib/docs';

  import { copyCodeBlocks } from './copy-code';

  let { doc }: { doc: DocPage } = $props();
</script>

<a href={resolve('/docs')} class="docs-back-link">&larr; All docs</a>
<div class="docs-article-shell mt-4">
  <article class="docs-content" use:copyCodeBlocks={doc.html}>
    <h1>{doc.title}</h1>
    <p class="docs-lead">{doc.description}</p>
    {@html doc.html}
  </article>
</div>
