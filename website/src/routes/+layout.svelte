<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
  <title>TrenchClaw — Solana Agent Runtime</title>
  <meta name="description" content="High-performance agentic framework and runtime for Solana. Built with @solana/kit, TypeScript, and Bun." />
</svelte:head>

{@render children()}
