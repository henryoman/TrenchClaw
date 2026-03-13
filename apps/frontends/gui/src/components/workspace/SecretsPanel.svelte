<script lang="ts">
  import type {
    GuiPublicRpcOptionView,
    GuiSecretCategory,
    GuiSecretEntryView,
    GuiSecretOptionView,
  } from "@trenchclaw/types";
  import RetroButton from "../ui/RetroButton.svelte";
  import RetroDivider from "../ui/RetroDivider.svelte";
  import RetroField from "../ui/RetroField.svelte";
  import RetroInput from "../ui/RetroInput.svelte";
  import RetroSectionHeader from "../ui/RetroSectionHeader.svelte";
  import RetroSelect from "../ui/RetroSelect.svelte";
  import RetroStatusMessage from "../ui/RetroStatusMessage.svelte";

  export let options: GuiSecretOptionView[] = [];
  export let entries: GuiSecretEntryView[] = [];
  export let publicRpcOptions: GuiPublicRpcOptionView[] = [];
  export let busy = false;
  export let error = "";
  export let llmCheckBusy = false;
  export let llmCheckMessage = "";
  export let onReload: () => void = () => {};
  export let onCheckLlm: () => void = () => {};
  export let onSave: (input: {
    optionId: string;
    value: string;
    source?: "custom" | "public";
    publicRpcId?: string | null;
  }) => Promise<void> | void = () => {};
  export let onClear: (optionId: string) => Promise<void> | void = () => {};

  interface VisibleSecretField {
    id: string;
    label: string;
    placeholder: string;
    category: GuiSecretCategory;
    value: string;
    dirty: boolean;
    supportsPublicRpc: boolean;
    source: "custom" | "public";
    publicRpcId: string | null;
  }

  const DEFAULT_MAINNET_RPC_ID = "solana-mainnet-beta";
  const CUSTOM_RPC_OPTION_ID = "__custom__";
  const AI_OPTION_IDS = [
    "openrouter-api-key",
    "vercel-ai-gateway-api-key",
  ];
  const BLOCKCHAIN_OPTION_IDS = [
    "solana-rpc-url",
    "jupiter-api-key",
  ];

  let draftValues: Record<string, string> = {};
  let draftSources: Record<string, "custom" | "public"> = {};
  let draftPublicRpcIds: Record<string, string> = {};
  let hydrationSignature = "";
  let dirtyOptionIds = new Set<string>();

  const optionFor = (optionId: string): GuiSecretOptionView | undefined =>
    options.find((option) => option.id === optionId);

  const entryFor = (optionId: string): GuiSecretEntryView | undefined =>
    entries.find((entry) => entry.optionId === optionId);

  const defaultPublicRpc = (): GuiPublicRpcOptionView | undefined =>
    publicRpcOptions.find((rpc) => rpc.id === DEFAULT_MAINNET_RPC_ID) ?? publicRpcOptions[0];

  const publicRpcFor = (publicRpcId: string | null): GuiPublicRpcOptionView | undefined =>
    publicRpcOptions.find((rpc) => rpc.id === publicRpcId) ?? defaultPublicRpc();

  const initialSourceFor = (option: GuiSecretOptionView): "custom" | "public" => {
    if (!option.supportsPublicRpc) {
      return "custom";
    }
    const entry = entryFor(option.id);
    if (entry?.source === "public") {
      return "public";
    }
    return (entry?.value ?? "").trim().length > 0 ? "custom" : "public";
  };

  const initialPublicRpcIdFor = (option: GuiSecretOptionView): string | null => {
    if (!option.supportsPublicRpc) {
      return null;
    }
    const entry = entryFor(option.id);
    return entry?.publicRpcId ?? defaultPublicRpc()?.id ?? null;
  };

  const initialValueFor = (option: GuiSecretOptionView): string => {
    const entry = entryFor(option.id);
    if ((entry?.value ?? "").trim().length > 0) {
      return entry?.value ?? "";
    }
    if (option.supportsPublicRpc) {
      return publicRpcFor(initialPublicRpcIdFor(option))?.url ?? "";
    }
    return "";
  };

  const visibleOptionsFor = (optionIds: string[]): GuiSecretOptionView[] =>
    optionIds.map((optionId) => optionFor(optionId)).filter((option): option is GuiSecretOptionView => Boolean(option));

  const buildFields = (category: GuiSecretCategory, optionIds: string[]): VisibleSecretField[] =>
    visibleOptionsFor(optionIds).map((option) => {
      const source = option.supportsPublicRpc ? (draftSources[option.id] ?? initialSourceFor(option)) : "custom";
      const publicRpcId = option.supportsPublicRpc
        ? (draftPublicRpcIds[option.id] ?? initialPublicRpcIdFor(option))
        : null;
      return {
        id: option.id,
        label: option.label,
        placeholder: option.placeholder,
        category,
        value:
          source === "public" && option.supportsPublicRpc
            ? (publicRpcFor(publicRpcId)?.url ?? "")
            : (draftValues[option.id] ?? initialValueFor(option)),
        dirty: dirtyOptionIds.has(option.id),
        supportsPublicRpc: option.supportsPublicRpc,
        source,
        publicRpcId,
      };
    });

  const handleValueChange = (optionId: string, value: string): void => {
    draftValues = {
      ...draftValues,
      [optionId]: value,
    };
    dirtyOptionIds = new Set([...dirtyOptionIds, optionId]);
  };

  const handlePublicRpcChange = (optionId: string, selection: string): void => {
    if (selection === CUSTOM_RPC_OPTION_ID) {
      draftSources = {
        ...draftSources,
        [optionId]: "custom",
      };
      dirtyOptionIds = new Set([...dirtyOptionIds, optionId]);
      return;
    }

    const rpc = publicRpcOptions.find((entry) => entry.id === selection);
    if (!rpc) {
      return;
    }

    draftSources = {
      ...draftSources,
      [optionId]: "public",
    };
    draftPublicRpcIds = {
      ...draftPublicRpcIds,
      [optionId]: rpc.id,
    };
    draftValues = {
      ...draftValues,
      [optionId]: rpc.url,
    };
    dirtyOptionIds = new Set([...dirtyOptionIds, optionId]);
  };

  const saveField = (field: VisibleSecretField): void => {
    const option = optionFor(field.id);
    if (!option) {
      return;
    }

    const rpc = option.supportsPublicRpc ? publicRpcFor(field.publicRpcId) : undefined;

    Promise.resolve(
      onSave({
        optionId: field.id,
        value: option.supportsPublicRpc && field.source === "public" ? (rpc?.url ?? field.value.trim()) : field.value.trim(),
        source: option.supportsPublicRpc ? field.source : undefined,
        publicRpcId: option.supportsPublicRpc ? (field.source === "public" ? field.publicRpcId : null) : undefined,
      }),
    )
      .then(() => {
        dirtyOptionIds.delete(field.id);
        dirtyOptionIds = new Set(dirtyOptionIds);
      })
      .catch(() => {});
  };

  const clearField = (field: VisibleSecretField): void => {
    const option = optionFor(field.id);
    if (!option) {
      return;
    }

    if (field.id === "solana-rpc-url") {
      const rpc = defaultPublicRpc();
      if (!rpc) {
        return;
      }
      draftSources = {
        ...draftSources,
        [field.id]: "public",
      };
      draftPublicRpcIds = {
        ...draftPublicRpcIds,
        [field.id]: rpc.id,
      };
      draftValues = {
        ...draftValues,
        [field.id]: rpc.url,
      };
      Promise.resolve(
        onSave({
          optionId: field.id,
          value: rpc.url,
          source: "public",
          publicRpcId: rpc.id,
        }),
      )
        .then(() => {
          dirtyOptionIds.delete(field.id);
          dirtyOptionIds = new Set(dirtyOptionIds);
        })
        .catch(() => {});
      return;
    }

    draftValues = {
      ...draftValues,
      [field.id]: "",
    };
    dirtyOptionIds.delete(field.id);
    dirtyOptionIds = new Set(dirtyOptionIds);
    void onClear(field.id);
  };

  const handleReload = (): void => {
    if (dirtyOptionIds.size > 0) {
      const proceed = window.confirm("You have unsaved key changes. Reload and discard them?");
      if (!proceed) {
        return;
      }
    }
    dirtyOptionIds = new Set();
    onReload();
  };

  const createHydrationSignature = (): string =>
    JSON.stringify({
      optionIds: options.map((option) => option.id),
      entryValues: entries.map((entry) => [entry.optionId, entry.value, entry.source, entry.publicRpcId]),
      rpcIds: publicRpcOptions.map((rpc) => rpc.id),
    });

  $: {
    const signature = createHydrationSignature();
    if (signature !== hydrationSignature) {
      const visibleOptions = [...visibleOptionsFor(AI_OPTION_IDS), ...visibleOptionsFor(BLOCKCHAIN_OPTION_IDS)];
      draftValues = Object.fromEntries(
        visibleOptions.map((option) => [
          option.id,
          initialValueFor(option),
        ]),
      );
      draftSources = Object.fromEntries(
        visibleOptions
          .filter((option) => option.supportsPublicRpc)
          .map((option) => [option.id, initialSourceFor(option)]),
      );
      draftPublicRpcIds = Object.fromEntries(
        visibleOptions
          .filter((option) => option.supportsPublicRpc)
          .map((option) => [option.id, initialPublicRpcIdFor(option) ?? ""]),
      );
      hydrationSignature = signature;
      dirtyOptionIds = new Set();
    }
  }

  $: aiFields = buildFields("ai", AI_OPTION_IDS);
  $: blockchainFields = buildFields("blockchain", BLOCKCHAIN_OPTION_IDS);
  $: statusErrorText = error.trim();
  $: llmStatusText = llmCheckMessage.trim();
</script>

<section class="secrets-panel" aria-label="Keys panel">
  <header class="secrets-header">
    <RetroSectionHeader title="Keys" />
    <div class="actions">
      <RetroButton variant="secondary" disabled={busy} on:click={handleReload}>Reload keys</RetroButton>
      <RetroButton variant="secondary" disabled={busy || llmCheckBusy} on:click={onCheckLlm}>Test AI connection</RetroButton>
    </div>
  </header>

  <div class="section-stack">
    <section class="secret-section" aria-label="AI keys">
      <h3>AI</h3>
      <div class="field-list">
        {#each aiFields as field (field.id)}
          <article class="secret-card">
            <RetroField label={field.label}>
              <RetroInput
                value={field.value}
                disabled={busy}
                placeholder={field.placeholder}
                on:input={(event) => {
                  const target = event.currentTarget as HTMLInputElement;
                  handleValueChange(field.id, target.value);
                }}
              />
            </RetroField>

            <div class="row-actions">
              <RetroButton disabled={busy || !field.value.trim() || !field.dirty} on:click={() => saveField(field)}>
                Save
              </RetroButton>
              <RetroButton variant="secondary" disabled={busy || !field.value.trim()} on:click={() => clearField(field)}>
                Clear
              </RetroButton>
            </div>
          </article>
        {/each}
      </div>
    </section>

    <RetroDivider />

    <section class="secret-section" aria-label="Blockchain keys">
      <h3>Blockchain</h3>
      <div class="field-list">
        {#each blockchainFields as field (field.id)}
          <article class="secret-card">
            {#if field.supportsPublicRpc}
              <RetroField label="RPC source">
                <RetroSelect
                  value={field.source === "public" ? (field.publicRpcId ?? "") : CUSTOM_RPC_OPTION_ID}
                  disabled={busy}
                  on:change={(event) => {
                    const target = event.currentTarget as HTMLSelectElement;
                    handlePublicRpcChange(field.id, target.value);
                  }}
                >
                  <option value={CUSTOM_RPC_OPTION_ID}>Custom URL</option>
                  {#each publicRpcOptions as rpc (rpc.id)}
                    <option value={rpc.id}>{rpc.label}</option>
                  {/each}
                </RetroSelect>
              </RetroField>
            {/if}

            <RetroField label={field.label}>
              <RetroInput
                value={field.value}
                disabled={busy || (field.supportsPublicRpc && field.source === "public")}
                placeholder={field.placeholder}
                on:input={(event) => {
                  const target = event.currentTarget as HTMLInputElement;
                  handleValueChange(field.id, target.value);
                }}
              />
            </RetroField>

            <div class="row-actions">
              <RetroButton disabled={busy || !field.value.trim() || !field.dirty} on:click={() => saveField(field)}>
                Save
              </RetroButton>
              <RetroButton variant="secondary" disabled={busy || !field.value.trim()} on:click={() => clearField(field)}>
                {field.id === "solana-rpc-url" ? "Reset" : "Clear"}
              </RetroButton>
            </div>
          </article>
        {/each}
      </div>
    </section>
  </div>

  <RetroStatusMessage tone="error" text={statusErrorText} />
  <RetroStatusMessage tone="error" text={llmStatusText} />
</section>

<style>
  .secrets-panel {
    border: var(--tc-border);
    background: var(--tc-color-black-2);
    min-height: 0;
    min-width: 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--tc-space-3);
    padding: var(--tc-space-3);
    overflow-y: auto;
    overflow-x: hidden;
  }

  .secrets-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--tc-space-3);
    min-width: 0;
  }

  .actions {
    display: flex;
    gap: var(--tc-space-2);
    flex-wrap: wrap;
  }

  .section-stack {
    display: grid;
    gap: var(--tc-space-4);
    min-width: 0;
  }

  .secret-section {
    display: grid;
    gap: var(--tc-space-3);
    min-width: 0;
  }

  .field-list {
    display: grid;
    gap: var(--tc-space-2);
  }

  .secret-card {
    display: grid;
    gap: var(--tc-space-2);
    min-width: 0;
    border: var(--tc-row-box-border);
    background: var(--tc-row-box-bg);
    padding: var(--tc-row-box-padding);
  }

  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--tc-space-2);
  }

  h3 {
    margin: 0;
    font-size: var(--tc-section-title-size);
    text-transform: uppercase;
    letter-spacing: var(--tc-section-title-letter-spacing);
    color: var(--tc-color-turquoise);
  }

  @media (max-width: 600px) {
    .secrets-header {
      flex-direction: column;
    }
  }
</style>
