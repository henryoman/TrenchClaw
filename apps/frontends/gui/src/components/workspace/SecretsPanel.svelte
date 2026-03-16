<script lang="ts">
  import type {
    GuiPublicRpcOptionView,
    GuiRpcProviderOptionView,
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
  export let rpcProviderOptions: GuiRpcProviderOptionView[] = [];
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
    rpcProviderId?: string | null;
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
    rpcProviderId: string | null;
    credentialLabel: string;
  }

  const DEFAULT_MAINNET_RPC_ID = "solana-mainnet-beta";
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
  let draftRpcProviderIds: Record<string, string> = {};
  let hydrationSignature = "";
  let dirtyOptionIds = new Set<string>();

  const optionFor = (optionId: string): GuiSecretOptionView | undefined =>
    options.find((option) => option.id === optionId);

  const entryFor = (optionId: string): GuiSecretEntryView | undefined =>
    entries.find((entry) => entry.optionId === optionId);

  const defaultPublicRpc = (): GuiPublicRpcOptionView | undefined =>
    publicRpcOptions.find((rpc) => rpc.id === DEFAULT_MAINNET_RPC_ID) ?? publicRpcOptions[0];

  const defaultRpcProvider = (): GuiRpcProviderOptionView | undefined => rpcProviderOptions[0];

  const rpcProviderFor = (rpcProviderId: string | null): GuiRpcProviderOptionView | undefined =>
    rpcProviderOptions.find((provider) => provider.id === rpcProviderId) ?? defaultRpcProvider();

  const isKnownPublicRpcUrl = (value: string): boolean => {
    const normalizedValue = value.trim();
    return normalizedValue.length > 0 && publicRpcOptions.some((rpc) => rpc.url === normalizedValue);
  };

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

  const initialRpcProviderIdFor = (option: GuiSecretOptionView): string | null => {
    if (!option.supportsPublicRpc) {
      return null;
    }
    const entry = entryFor(option.id);
    return entry?.rpcProviderId ?? defaultRpcProvider()?.id ?? null;
  };

  const initialValueFor = (option: GuiSecretOptionView): string => {
    const entry = entryFor(option.id);
    const entryValue = entry?.value ?? "";
    if (option.supportsPublicRpc && entry?.source === "public" && isKnownPublicRpcUrl(entryValue)) {
      return "";
    }
    if (entryValue.trim().length > 0) {
      return entryValue;
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
      const rpcProviderId = option.supportsPublicRpc
        ? (draftRpcProviderIds[option.id] ?? initialRpcProviderIdFor(option))
        : null;
      const provider = option.supportsPublicRpc ? rpcProviderFor(rpcProviderId) : undefined;
      return {
        id: option.id,
        label: option.label,
        placeholder: provider?.placeholder ?? option.placeholder,
        category,
        value: draftValues[option.id] ?? initialValueFor(option),
        dirty: dirtyOptionIds.has(option.id),
        supportsPublicRpc: option.supportsPublicRpc,
        source,
        publicRpcId,
        rpcProviderId,
        credentialLabel: provider?.credentialLabel ?? option.label,
      };
    });

  const handleValueChange = (optionId: string, value: string): void => {
    draftValues = {
      ...draftValues,
      [optionId]: value,
    };
    dirtyOptionIds = new Set([...dirtyOptionIds, optionId]);
  };

  const handleRpcProviderChange = (optionId: string, selection: string): void => {
    const provider = rpcProviderOptions.find((entry) => entry.id === selection);
    if (!provider) {
      return;
    }

    draftRpcProviderIds = {
      ...draftRpcProviderIds,
      [optionId]: provider.id,
    };
    dirtyOptionIds = new Set([...dirtyOptionIds, optionId]);
  };

  const saveField = (field: VisibleSecretField): void => {
    const option = optionFor(field.id);
    if (!option) {
      return;
    }

    Promise.resolve(
      onSave({
        optionId: field.id,
        value: field.value.trim(),
        source: undefined,
        publicRpcId: undefined,
        rpcProviderId: option.supportsPublicRpc ? field.rpcProviderId : undefined,
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
      entryValues: entries.map((entry) => [entry.optionId, entry.value, entry.source, entry.publicRpcId, entry.rpcProviderId]),
      rpcIds: publicRpcOptions.map((rpc) => rpc.id),
      rpcProviderIds: rpcProviderOptions.map((provider) => provider.id),
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
      draftRpcProviderIds = Object.fromEntries(
        visibleOptions
          .filter((option) => option.supportsPublicRpc)
          .map((option) => [option.id, initialRpcProviderIdFor(option) ?? ""]),
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
              <RetroField label="RPC provider">
                <RetroSelect
                  value={field.rpcProviderId ?? ""}
                  disabled={busy}
                  on:change={(event) => {
                    const target = event.currentTarget as HTMLSelectElement;
                    handleRpcProviderChange(field.id, target.value);
                  }}
                >
                  {#each rpcProviderOptions as provider (provider.id)}
                    <option value={provider.id}>{provider.label}</option>
                  {/each}
                </RetroSelect>
              </RetroField>
            {/if}

            <RetroField label={field.credentialLabel}>
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

</style>
