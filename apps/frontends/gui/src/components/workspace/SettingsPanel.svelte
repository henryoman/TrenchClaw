<script lang="ts">
  import type {
    GuiAiModelOptionView,
    GuiAiProviderOptionView,
    GuiAiSettingsView,
    GuiPublicRpcOptionView,
    GuiRpcProviderOptionView,
    GuiSecretEntryView,
    GuiTradingSettingsView,
  } from "@trenchclaw/types";
  import RetroButton from "../ui/RetroButton.svelte";
  import RetroDivider from "../ui/RetroDivider.svelte";
  import RetroField from "../ui/RetroField.svelte";
  import RetroInput from "../ui/RetroInput.svelte";
  import RetroSelect from "../ui/RetroSelect.svelte";
  import RetroSectionHeader from "../ui/RetroSectionHeader.svelte";
  import RetroStatusMessage from "../ui/RetroStatusMessage.svelte";

  export let aiSettingsFilePath = "";
  export let aiSettingsTemplatePath = "";
  export let aiSettings: GuiAiSettingsView | null = null;
  export let aiProviderOptions: GuiAiProviderOptionView[] = [];
  export let aiModelOptions: GuiAiModelOptionView[] = [];
  export let secretEntries: GuiSecretEntryView[] = [];
  export let publicRpcOptions: GuiPublicRpcOptionView[] = [];
  export let rpcProviderOptions: GuiRpcProviderOptionView[] = [];
  export let secretsBusy = false;
  export let secretsError = "";
  export let aiSettingsBusy = false;
  export let aiSettingsError = "";
  export let tradingSettingsFilePath = "";
  export let tradingSettings: GuiTradingSettingsView | null = null;
  export let tradingSettingsBusy = false;
  export let tradingSettingsError = "";
  export let onReloadAiSettings: () => void = () => {};
  export let onSaveAiSettings: (settings: GuiAiSettingsView) => Promise<void> | void = () => {};
  export let onReloadTradingSettings: () => void = () => {};
  export let onSaveTradingSettings: (settings: GuiTradingSettingsView) => Promise<void> | void = () => {};
  export let onSaveSecret: (input: {
    optionId: string;
    value: string;
    source?: "custom" | "public";
    publicRpcId?: string | null;
    rpcProviderId?: string | null;
  }) => Promise<void> | void = () => {};

  const DEFAULT_AI_PROVIDER_OPTIONS: GuiAiProviderOptionView[] = [
    { id: "openrouter", label: "OpenRouter", description: "Use OpenRouter and show OpenRouter-supported models." },
    { id: "gateway", label: "Vercel AI Gateway", description: "Use Vercel AI Gateway and show Gateway-supported models." },
  ];
  const DEFAULT_AI_PROVIDER: GuiAiSettingsView["provider"] = "openrouter";
  const DEFAULT_AI_MODEL = "anthropic/claude-sonnet-4.6";
  const SOLANA_RPC_OPTION_ID = "solana-rpc-url";
  const PROVIDER_KEY_OPTION_BY_ID: Record<GuiAiSettingsView["provider"], string> = {
    gateway: "vercel-ai-gateway-api-key",
    openrouter: "openrouter-api-key",
  };

  const createCustomAiModelOption = (model: string): GuiAiModelOptionView => ({
    id: model,
    label: model,
    providers: [],
  });

  const describeAiModelProviders = (providers: GuiAiModelOptionView["providers"]): string => {
    if (providers.length === 2) {
      return "Gateway + OpenRouter";
    }
    if (providers[0] === "openrouter") {
      return "OpenRouter only";
    }
    if (providers[0] === "gateway") {
      return "Gateway only";
    }
    return "Custom";
  };

  const formatAiModelOptionLabel = (option: GuiAiModelOptionView): string =>
    `${option.label} (${describeAiModelProviders(option.providers)})`;

  const providerHasKey = (provider: GuiAiSettingsView["provider"]): boolean => {
    const optionId = PROVIDER_KEY_OPTION_BY_ID[provider];
    const entry = secretEntries.find((candidate) => candidate.optionId === optionId);
    return Boolean(entry?.value.trim());
  };

  const formatAiProviderOptionLabel = (option: GuiAiProviderOptionView): string =>
    `${option.label}${providerHasKey(option.id) ? " | configured" : " | missing key"}`;

  const solanaRpcEntry = (): GuiSecretEntryView | undefined =>
    secretEntries.find((entry) => entry.optionId === SOLANA_RPC_OPTION_ID);

  const rpcProviderFor = (rpcProviderId: string | null): GuiRpcProviderOptionView | undefined =>
    rpcProviderOptions.find((provider) => provider.id === rpcProviderId) ?? rpcProviderOptions[0];

  const formatRpcProviderOptionLabel = (provider: GuiRpcProviderOptionView): string =>
    provider.id === "helius" ? `${provider.label} | recommended` : provider.label;

  const isKnownPublicRpcUrl = (value: string): boolean => {
    const normalizedValue = value.trim();
    return normalizedValue.length > 0 && publicRpcOptions.some((option) => option.url === normalizedValue);
  };

  const DEFAULT_AI_SETTINGS: GuiAiSettingsView = {
    provider: DEFAULT_AI_PROVIDER,
    model: DEFAULT_AI_MODEL,
    defaultMode: "primary",
    temperature: null,
    maxOutputTokens: null,
  };

  const DEFAULT_TRADING_SETTINGS: GuiTradingSettingsView = {
    defaultSwapProvider: "ultra",
    defaultSwapMode: "ExactIn",
    defaultAmountUnit: "ui",
    scheduleActionName: "scheduleManagedUltraSwap",
    quickBuyPresets: [],
    customPresets: [],
  };

  let aiSettingsDraft: GuiAiSettingsView = { ...DEFAULT_AI_SETTINGS };
  let tradingSettingsDraft: GuiTradingSettingsView = { ...DEFAULT_TRADING_SETTINGS };
  let aiSettingsHydrationSignature = "";
  let tradingSettingsHydrationSignature = "";
  let blockchainSettingsHydrationSignature = "";
  let aiSettingsDirty = false;
  let tradingSettingsDirty = false;
  let primaryRpcProviderIdDraft = "";
  let primaryRpcCredentialDraft = "";
  let primaryRpcDirty = false;

  const createAiSettingsHydrationSignature = (): string =>
    JSON.stringify({
      aiSettings,
      aiSettingsFilePath,
      aiSettingsTemplatePath,
    });

  const createTradingSettingsHydrationSignature = (): string =>
    JSON.stringify({
      tradingSettings,
      tradingSettingsFilePath,
    });

  const createBlockchainSettingsHydrationSignature = (): string =>
    JSON.stringify({
      secretEntries: secretEntries.map((entry) => [
        entry.optionId,
        entry.value,
        entry.source,
        entry.publicRpcId,
        entry.rpcProviderId,
      ]),
      publicRpcOptions: publicRpcOptions.map((option) => option.id),
      rpcProviderOptions: rpcProviderOptions.map((option) => option.id),
    });

  const onAiSettingChange = <K extends keyof GuiAiSettingsView>(key: K, value: GuiAiSettingsView[K]): void => {
    aiSettingsDraft = {
      ...aiSettingsDraft,
      [key]: value,
    };
    aiSettingsDirty = true;
  };

  const resolveCompatibleAiModels = (provider: GuiAiSettingsView["provider"]): GuiAiModelOptionView[] =>
    aiModelOptions.filter((option) => option.providers.includes(provider));

  const handleAiProviderChange = (provider: GuiAiSettingsView["provider"]): void => {
    const compatibleModels = resolveCompatibleAiModels(provider);
    const currentModel = aiSettingsDraft.model.trim();
    const nextModel = compatibleModels.some((option) => option.id === currentModel)
      ? currentModel
      : compatibleModels[0]?.id ?? currentModel;

    aiSettingsDraft = {
      ...aiSettingsDraft,
      provider,
      model: nextModel,
    };
    aiSettingsDirty = true;
  };

  const onTradingSettingChange = <K extends keyof GuiTradingSettingsView>(key: K, value: GuiTradingSettingsView[K]): void => {
    tradingSettingsDraft = {
      ...tradingSettingsDraft,
      [key]: value,
    };
    tradingSettingsDirty = true;
  };

  const handleReloadAiSettings = (): void => {
    if (aiSettingsDirty) {
      const proceed = window.confirm("You have unsaved AI settings changes. Reload and discard them?");
      if (!proceed) {
        return;
      }
    }
    aiSettingsDirty = false;
    onReloadAiSettings();
  };

  const handleReloadTradingSettings = (): void => {
    if (tradingSettingsDirty) {
      const proceed = window.confirm("You have unsaved trading settings changes. Reload and discard them?");
      if (!proceed) {
        return;
      }
    }
    tradingSettingsDirty = false;
    onReloadTradingSettings();
  };

  const handlePrimaryRpcProviderChange = (providerId: string): void => {
    primaryRpcProviderIdDraft = providerId;
    primaryRpcDirty = true;
  };

  const handlePrimaryRpcCredentialChange = (value: string): void => {
    primaryRpcCredentialDraft = value;
    primaryRpcDirty = true;
  };

  const savePrimaryRpcSettings = (): void => {
    const entry = solanaRpcEntry();
    const rpcProvider = rpcProviderFor(primaryRpcProviderIdDraft);
    if (!entry || !rpcProvider) {
      return;
    }

    Promise.resolve(
      onSaveSecret({
        optionId: SOLANA_RPC_OPTION_ID,
        value: primaryRpcCredentialDraft.trim(),
        source: "custom",
        publicRpcId: null,
        rpcProviderId: rpcProvider.id,
      }),
    )
      .then(() => {
        primaryRpcDirty = false;
      })
      .catch(() => {});
  };

  const saveAiSettings = (): void => {
    const temperature = typeof aiSettingsDraft.temperature === "number" && Number.isFinite(aiSettingsDraft.temperature)
      ? aiSettingsDraft.temperature
      : null;
    const maxOutputTokens =
      typeof aiSettingsDraft.maxOutputTokens === "number" && Number.isFinite(aiSettingsDraft.maxOutputTokens)
        ? Math.trunc(aiSettingsDraft.maxOutputTokens)
        : null;
    const normalized: GuiAiSettingsView = {
      provider: aiSettingsDraft.provider,
      model: aiSettingsDraft.model.trim(),
      defaultMode: aiSettingsDraft.defaultMode.trim() || "primary",
      temperature,
      maxOutputTokens,
    };
    Promise.resolve(onSaveAiSettings(normalized))
      .then(() => {
        aiSettingsDirty = false;
      })
      .catch(() => {});
  };

  const saveTradingSettings = (): void => {
    const normalized: GuiTradingSettingsView = {
      ...tradingSettingsDraft,
      defaultAmountUnit: "ui",
      scheduleActionName: "scheduleManagedUltraSwap",
      quickBuyPresets: [...tradingSettingsDraft.quickBuyPresets],
      customPresets: [...tradingSettingsDraft.customPresets],
    };
    Promise.resolve(onSaveTradingSettings(normalized))
      .then(() => {
        tradingSettingsDirty = false;
      })
      .catch(() => {});
  };

  $: {
    const signature = createAiSettingsHydrationSignature();
    if (signature !== aiSettingsHydrationSignature) {
      aiSettingsDraft = aiSettings ? { ...aiSettings } : { ...DEFAULT_AI_SETTINGS };
      aiSettingsHydrationSignature = signature;
      aiSettingsDirty = false;
    }
  }

  $: {
    const signature = createTradingSettingsHydrationSignature();
    if (signature !== tradingSettingsHydrationSignature) {
      tradingSettingsDraft = tradingSettings
        ? {
            ...tradingSettings,
            quickBuyPresets: [...tradingSettings.quickBuyPresets],
            customPresets: [...tradingSettings.customPresets],
          }
        : { ...DEFAULT_TRADING_SETTINGS };
      tradingSettingsHydrationSignature = signature;
      tradingSettingsDirty = false;
    }
  }

  $: {
    const signature = createBlockchainSettingsHydrationSignature();
    if (signature !== blockchainSettingsHydrationSignature) {
      const entry = solanaRpcEntry();
      const fallbackProviderId = rpcProviderOptions[0]?.id ?? "";
      primaryRpcProviderIdDraft = entry?.rpcProviderId ?? fallbackProviderId;
      primaryRpcCredentialDraft = entry && !(entry.source === "public" && isKnownPublicRpcUrl(entry.value))
        ? entry.value
        : "";
      blockchainSettingsHydrationSignature = signature;
      primaryRpcDirty = false;
    }
  }

  $: aiSettingsErrorText = aiSettingsError.trim();
  $: blockchainSettingsErrorText = secretsError.trim();
  $: tradingSettingsErrorText = tradingSettingsError.trim();
  $: selectableAiProviderOptions = aiProviderOptions.length > 0 ? [...aiProviderOptions] : [...DEFAULT_AI_PROVIDER_OPTIONS];
  $: filteredAiModelOptions = resolveCompatibleAiModels(aiSettingsDraft.provider);
  $: selectableAiModelOptions = aiSettingsDraft.model.trim().length > 0
    && !filteredAiModelOptions.some((option) => option.id === aiSettingsDraft.model.trim())
    ? [createCustomAiModelOption(aiSettingsDraft.model.trim()), ...filteredAiModelOptions]
    : [...filteredAiModelOptions];
  $: selectedAiProviderHasKey = providerHasKey(aiSettingsDraft.provider);
  $: selectedPrimaryRpcProvider = rpcProviderFor(primaryRpcProviderIdDraft);
  $: selectedPrimaryRpcProviderIsHelius = selectedPrimaryRpcProvider?.id === "helius";
  $: primaryRpcCredentialLabel = selectedPrimaryRpcProvider?.mode === "endpoint-url" ? "RPC endpoint URL" : "API key";
  $: primaryRpcCredentialPlaceholder = selectedPrimaryRpcProvider?.placeholder ?? "Enter RPC credential";
</script>

<section class="settings-panel" aria-label="Settings panel">
  <header class="settings-header">
    <RetroSectionHeader title="Settings" />
  </header>

  <div class="section-stack">
    <section class="settings-section" aria-label="AI settings">
      <div class="section-heading">
        <p class="section-label">AI settings</p>
        <div class="actions">
          <RetroButton variant="secondary" disabled={aiSettingsBusy} on:click={handleReloadAiSettings}>Reload</RetroButton>
          <RetroButton
            variant="primary"
            disabled={aiSettingsBusy || !selectedAiProviderHasKey || !aiSettingsDraft.model.trim()}
            on:click={saveAiSettings}
          >
            Save
          </RetroButton>
        </div>
      </div>

      <div class="settings-grid">
        <RetroField label="Provider">
          <RetroSelect
            value={aiSettingsDraft.provider}
            indicatorShape="triangle"
            chevronColor="var(--tc-color-lime)"
            disabled={aiSettingsBusy}
            on:change={(event) => {
              const target = event.currentTarget as HTMLSelectElement;
              handleAiProviderChange(target.value as GuiAiSettingsView["provider"]);
            }}
          >
            {#each selectableAiProviderOptions as providerOption}
              <option
                value={providerOption.id}
                disabled={!providerHasKey(providerOption.id) && providerOption.id !== aiSettingsDraft.provider}
              >
                {formatAiProviderOptionLabel(providerOption)}
              </option>
            {/each}
          </RetroSelect>
        </RetroField>

        <RetroField label="Model">
          <RetroSelect
            value={aiSettingsDraft.model}
            indicatorShape="triangle"
            chevronColor="var(--tc-color-lime)"
            disabled={aiSettingsBusy}
            on:change={(event) => {
              const target = event.currentTarget as HTMLSelectElement;
              onAiSettingChange("model", target.value);
            }}
          >
            {#each selectableAiModelOptions as modelOption}
              <option value={modelOption.id}>{formatAiModelOptionLabel(modelOption)}</option>
            {/each}
          </RetroSelect>
        </RetroField>

        <RetroField label="Temperature">
          <RetroInput
            value={aiSettingsDraft.temperature === null ? "" : String(aiSettingsDraft.temperature)}
            placeholder="Provider default"
            disabled={aiSettingsBusy}
            on:input={(event) => {
              const target = event.currentTarget as HTMLInputElement;
              const next = target.value.trim();
              onAiSettingChange("temperature", next.length === 0 ? null : Number(next));
            }}
          />
        </RetroField>

        <RetroField label="Max output tokens">
          <RetroInput
            value={aiSettingsDraft.maxOutputTokens === null ? "" : String(aiSettingsDraft.maxOutputTokens)}
            placeholder="Runtime default"
            disabled={aiSettingsBusy}
            on:input={(event) => {
              const target = event.currentTarget as HTMLInputElement;
              const next = target.value.trim();
              onAiSettingChange("maxOutputTokens", next.length === 0 ? null : Number(next));
            }}
          />
        </RetroField>
      </div>

    </section>

    <RetroStatusMessage tone="error" text={aiSettingsErrorText} />

    <RetroDivider />

    <section class="settings-section" aria-label="Blockchain settings">
      <div class="section-heading">
        <div class="section-copy">
          <p class="section-label">Blockchain settings</p>
          <p class="section-description">Choose the RPC provider here. Helius is the recommended option and gets the richest settings surface.</p>
        </div>
        <div class="actions">
          <RetroButton
            variant="primary"
            disabled={secretsBusy || !primaryRpcProviderIdDraft || !primaryRpcCredentialDraft.trim() || !primaryRpcDirty}
            on:click={savePrimaryRpcSettings}
          >
            Save
          </RetroButton>
        </div>
      </div>

      <div class="settings-grid">
        <RetroField label="RPC provider">
          <RetroSelect
            value={primaryRpcProviderIdDraft}
            indicatorShape="triangle"
            chevronColor="var(--tc-color-lime)"
            disabled={secretsBusy}
            on:change={(event) => {
              const target = event.currentTarget as HTMLSelectElement;
              handlePrimaryRpcProviderChange(target.value);
            }}
          >
            {#each rpcProviderOptions as providerOption}
              <option value={providerOption.id}>{formatRpcProviderOptionLabel(providerOption)}</option>
            {/each}
          </RetroSelect>
        </RetroField>

        <RetroField label={primaryRpcCredentialLabel}>
          <RetroInput
            value={primaryRpcCredentialDraft}
            placeholder={primaryRpcCredentialPlaceholder}
            disabled={secretsBusy}
            on:input={(event) => {
              const target = event.currentTarget as HTMLInputElement;
              handlePrimaryRpcCredentialChange(target.value);
            }}
          />
        </RetroField>
      </div>

      {#if selectedPrimaryRpcProviderIsHelius}
        <div class="provider-callout" aria-label="Helius provider settings">
          <p class="provider-callout-title">Helius gateway settings</p>
          <p class="provider-callout-copy">
            Coming soon.
          </p>
        </div>
      {:else if selectedPrimaryRpcProvider}
        <div class="provider-callout provider-callout-muted" aria-label="Provider settings note">
          <p class="provider-callout-title">{selectedPrimaryRpcProvider.label} settings</p>
          <p class="provider-callout-copy">
            Advanced provider-specific controls are centered on Helius. This provider currently uses the standard credential flow only.
          </p>
        </div>
      {/if}
    </section>

    <RetroStatusMessage tone="error" text={blockchainSettingsErrorText} />

    <RetroDivider />

    <section class="settings-section" aria-label="Trading settings">
      <div class="section-heading">
        <p class="section-label">Trading settings</p>
        <div class="actions">
          <RetroButton variant="secondary" disabled={tradingSettingsBusy} on:click={handleReloadTradingSettings}>Reload</RetroButton>
          <RetroButton variant="primary" disabled={tradingSettingsBusy} on:click={saveTradingSettings}>Save</RetroButton>
        </div>
      </div>

      <div class="settings-grid">
        <RetroField label="Default swap settings">
          <RetroSelect
            value={tradingSettingsDraft.defaultSwapProvider}
            indicatorShape="triangle"
            disabled={tradingSettingsBusy}
            on:change={(event) => {
              const target = event.currentTarget as HTMLSelectElement;
              onTradingSettingChange("defaultSwapProvider", target.value as GuiTradingSettingsView["defaultSwapProvider"]);
            }}
          >
            <option value="ultra">Ultra</option>
            <option value="standard">RPC</option>
          </RetroSelect>
        </RetroField>

      </div>
    </section>

    <RetroStatusMessage tone="error" text={tradingSettingsErrorText} />
  </div>
</section>

<style>
  .settings-panel {
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

  .settings-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--tc-space-3);
    min-width: 0;
  }

  .section-stack {
    display: grid;
    gap: var(--tc-space-4);
    min-width: 0;
  }

  .settings-section {
    display: grid;
    gap: var(--tc-space-3);
    min-width: 0;
  }

  .section-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--tc-space-3);
    flex-wrap: wrap;
  }

  .actions {
    display: flex;
    gap: var(--tc-space-2);
    flex-wrap: wrap;
  }

  .section-label {
    margin: 0;
    color: var(--tc-color-gray-3);
    font-size: var(--tc-field-label-size);
    letter-spacing: var(--tc-field-label-letter-spacing);
    text-transform: uppercase;
  }

  .section-copy {
    display: grid;
    gap: var(--tc-space-1);
    min-width: 0;
  }

  .section-description {
    margin: 0;
    color: var(--tc-color-gray-2);
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .settings-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--tc-space-3);
    min-width: 0;
  }

  .provider-callout {
    display: grid;
    gap: var(--tc-space-1);
    border: var(--tc-row-box-border);
    background: var(--tc-row-box-bg);
    padding: var(--tc-row-box-padding);
  }

  .provider-callout-muted {
    opacity: 0.92;
  }

  .provider-callout-title {
    margin: 0;
    color: var(--tc-color-lime);
    font-size: var(--tc-field-label-size);
    letter-spacing: var(--tc-field-label-letter-spacing);
    text-transform: uppercase;
  }

  .provider-callout-copy {
    margin: 0;
    color: var(--tc-color-gray-2);
    line-height: 1.45;
  }

</style>
