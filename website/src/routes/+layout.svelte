<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
  <title>TrenchClaw — Solana Agent Runtime</title>
  <meta name="description" content="Local-first Solana runtime for wallets, actions, and AI workflows." />
</svelte:head>

{@render children()}
