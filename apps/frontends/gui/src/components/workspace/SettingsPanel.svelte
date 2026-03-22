<script lang="ts">
  import type {
    GuiAiModelOptionView,
    GuiAiProviderOptionView,
    GuiAiSettingsView,
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
  const DEFAULT_AI_MODEL = "openai/gpt-5.4-nano";
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
  const SCHEDULE_ACTION_OPTIONS = [
    {
      value: "scheduleManagedUltraSwap",
      label: "Managed Ultra swap",
    },
  ] as const;

  let aiSettingsDraft: GuiAiSettingsView = { ...DEFAULT_AI_SETTINGS };
  let tradingSettingsDraft: GuiTradingSettingsView = { ...DEFAULT_TRADING_SETTINGS };
  let aiSettingsHydrationSignature = "";
  let tradingSettingsHydrationSignature = "";
  let blockchainSettingsHydrationSignature = "";
  let aiSettingsDirty = false;
  let tradingSettingsDirty = false;
  let primaryRpcProviderIdDraft = "";
  let primaryRpcDirty = false;

  type ValueInputEvent = CustomEvent<{ value: string }>;

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
      secretEntries: secretEntries.map((entry) => [entry.optionId, entry.rpcProviderId, entry.source, entry.publicRpcId, entry.value]),
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
      const proceed = window.confirm("You have unsaved blockchain settings changes. Reload and discard them?");
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
      scheduleActionName: tradingSettingsDraft.scheduleActionName.trim() || DEFAULT_TRADING_SETTINGS.scheduleActionName,
      quickBuyPresets: [...tradingSettingsDraft.quickBuyPresets],
      customPresets: [...tradingSettingsDraft.customPresets],
    };
    Promise.resolve(onSaveTradingSettings(normalized))
      .then(() => {
        tradingSettingsDirty = false;
      })
      .catch(() => {});
  };

  const savePrimaryRpcProvider = (): void => {
    const entry = solanaRpcEntry();
    if (!entry || !primaryRpcProviderIdDraft) {
      return;
    }

    Promise.resolve(
      onSaveSecret({
        optionId: SOLANA_RPC_OPTION_ID,
        value: entry.value,
        source: entry.source,
        publicRpcId: entry.publicRpcId,
        rpcProviderId: primaryRpcProviderIdDraft,
      }),
    )
      .then(() => {
        primaryRpcDirty = false;
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
      primaryRpcProviderIdDraft = solanaRpcEntry()?.rpcProviderId ?? rpcProviderOptions[0]?.id ?? "";
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
            on:valueChange={(event) => {
              handleAiProviderChange((event as ValueInputEvent).detail.value as GuiAiSettingsView["provider"]);
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
            on:valueChange={(event) => {
              onAiSettingChange("model", (event as ValueInputEvent).detail.value);
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
            on:valueInput={(event) => {
              const next = (event as ValueInputEvent).detail.value.trim();
              onAiSettingChange("temperature", next.length === 0 ? null : Number(next));
            }}
          />
        </RetroField>

        <RetroField label="Max output tokens">
          <RetroInput
            value={aiSettingsDraft.maxOutputTokens === null ? "" : String(aiSettingsDraft.maxOutputTokens)}
            placeholder="Runtime default"
            disabled={aiSettingsBusy}
            on:valueInput={(event) => {
              const next = (event as ValueInputEvent).detail.value.trim();
              onAiSettingChange("maxOutputTokens", next.length === 0 ? null : Number(next));
            }}
          />
        </RetroField>
      </div>

    </section>

    <RetroStatusMessage tone="error" text={aiSettingsErrorText} />

    <RetroDivider />

    <section class="settings-section" aria-label="RPC settings">
      <div class="section-heading">
        <div>
          <p class="section-label">RPC settings</p>
          <p class="section-description">Choose the RPC provider here. Enter the matching key in `Keys`.</p>
        </div>
        <div class="actions">
          <RetroButton
            variant="primary"
            disabled={secretsBusy || !primaryRpcProviderIdDraft || !primaryRpcDirty}
            on:click={savePrimaryRpcProvider}
          >
            Save
          </RetroButton>
        </div>
      </div>

      <div class="settings-grid settings-grid-single">
        <RetroField label="RPC provider">
          <RetroSelect
            value={primaryRpcProviderIdDraft}
            indicatorShape="triangle"
            chevronColor="var(--tc-color-lime)"
            disabled={secretsBusy}
            on:valueChange={(event) => {
              handlePrimaryRpcProviderChange((event as ValueInputEvent).detail.value);
            }}
          >
            {#each rpcProviderOptions as providerOption}
              <option value={providerOption.id}>{providerOption.label}</option>
            {/each}
          </RetroSelect>
        </RetroField>
      </div>
    </section>

    <RetroStatusMessage tone="error" text={blockchainSettingsErrorText} />

    <RetroDivider />

    <section class="settings-section" aria-label="Blockchain settings">
      <div class="section-heading">
        <p class="section-label">Blockchain settings</p>
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
            on:valueChange={(event) => {
              onTradingSettingChange(
                "defaultSwapProvider",
                (event as ValueInputEvent).detail.value as GuiTradingSettingsView["defaultSwapProvider"],
              );
            }}
          >
            <option value="ultra">Ultra</option>
            <option value="standard">Standard RPC</option>
          </RetroSelect>
        </RetroField>

        <RetroField label="Default scheduled action">
          <RetroSelect
            value={tradingSettingsDraft.scheduleActionName}
            indicatorShape="triangle"
            disabled={tradingSettingsBusy}
            on:valueChange={(event) => {
              onTradingSettingChange("scheduleActionName", (event as ValueInputEvent).detail.value);
            }}
          >
            {#each SCHEDULE_ACTION_OPTIONS as option}
              <option value={option.value}>{option.label}</option>
            {/each}
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

  .section-description {
    margin: var(--tc-space-1) 0 0;
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

  .settings-grid-single {
    grid-template-columns: minmax(0, 1fr);
  }
</style>
