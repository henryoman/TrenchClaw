<script lang="ts">
  import type { GuiAiSettingsView, GuiTradingSettingsView } from "@trenchclaw/types";
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

  const DEFAULT_AI_SETTINGS: GuiAiSettingsView = {
    model: "",
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
  let aiSettingsDirty = false;
  let tradingSettingsDirty = false;

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

  const onAiSettingChange = <K extends keyof GuiAiSettingsView>(key: K, value: GuiAiSettingsView[K]): void => {
    aiSettingsDraft = {
      ...aiSettingsDraft,
      [key]: value,
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

  const saveAiSettings = (): void => {
    const temperature = typeof aiSettingsDraft.temperature === "number" && Number.isFinite(aiSettingsDraft.temperature)
      ? aiSettingsDraft.temperature
      : null;
    const maxOutputTokens =
      typeof aiSettingsDraft.maxOutputTokens === "number" && Number.isFinite(aiSettingsDraft.maxOutputTokens)
        ? Math.trunc(aiSettingsDraft.maxOutputTokens)
        : null;
    const normalized: GuiAiSettingsView = {
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
      scheduleActionName: tradingSettingsDraft.scheduleActionName.trim() || "scheduleManagedUltraSwap",
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

  $: aiSettingsErrorText = aiSettingsError.trim();
  $: tradingSettingsErrorText = tradingSettingsError.trim();
</script>

<section class="settings-panel" aria-label="Settings panel">
  <header class="settings-header">
    <RetroSectionHeader title="Settings" />
  </header>

  <div class="section-stack">
    <section class="settings-section" aria-label="AI settings">
      <div class="section-heading">
        <div>
          <p class="section-label">AI settings</p>
          <p class="section-meta">{aiSettingsFilePath || "No AI settings file detected."}</p>
          <p class="section-meta">Transport resolves automatically from your Gateway or OpenRouter key.</p>
        </div>
        <div class="actions">
          <RetroButton variant="secondary" disabled={aiSettingsBusy} on:click={handleReloadAiSettings}>Reload AI settings</RetroButton>
          <RetroButton
            variant="primary"
            disabled={aiSettingsBusy || !aiSettingsDraft.model.trim() || !aiSettingsDraft.defaultMode.trim()}
            on:click={saveAiSettings}
          >
            Save AI settings
          </RetroButton>
        </div>
      </div>

      <div class="settings-grid">
        <RetroField label="Model">
          <RetroInput
            value={aiSettingsDraft.model}
            placeholder="anthropic/claude-sonnet-4.6"
            disabled={aiSettingsBusy}
            on:input={(event) => {
              const target = event.currentTarget as HTMLInputElement;
              onAiSettingChange("model", target.value);
            }}
          />
        </RetroField>

        <RetroField label="Default mode">
          <RetroInput
            value={aiSettingsDraft.defaultMode}
            placeholder="primary"
            disabled={aiSettingsBusy}
            on:input={(event) => {
              const target = event.currentTarget as HTMLInputElement;
              onAiSettingChange("defaultMode", target.value);
            }}
          />
        </RetroField>

        <RetroField label="Temperature">
          <RetroInput
            value={aiSettingsDraft.temperature === null ? "" : String(aiSettingsDraft.temperature)}
            placeholder="blank = provider default"
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
            placeholder="blank = runtime default"
            disabled={aiSettingsBusy}
            on:input={(event) => {
              const target = event.currentTarget as HTMLInputElement;
              const next = target.value.trim();
              onAiSettingChange("maxOutputTokens", next.length === 0 ? null : Number(next));
            }}
          />
        </RetroField>
      </div>

      {#if aiSettingsTemplatePath}
        <p class="section-meta">Template: {aiSettingsTemplatePath}</p>
      {/if}
    </section>

    <RetroStatusMessage tone="error" text={aiSettingsErrorText} />

    <RetroDivider />

    <section class="settings-section" aria-label="Trading settings">
      <div class="section-heading">
        <div>
          <p class="section-label">Trading settings</p>
          <p class="section-meta">{tradingSettingsFilePath || "No trading settings file detected."}</p>
        </div>
        <div class="actions">
          <RetroButton variant="secondary" disabled={tradingSettingsBusy} on:click={handleReloadTradingSettings}>
            Reload trading settings
          </RetroButton>
          <RetroButton
            variant="primary"
            disabled={tradingSettingsBusy || !tradingSettingsDraft.scheduleActionName.trim()}
            on:click={saveTradingSettings}
          >
            Save trading settings
          </RetroButton>
        </div>
      </div>

      <div class="settings-grid">
        <RetroField label="Default swap provider">
          <RetroSelect
            value={tradingSettingsDraft.defaultSwapProvider}
            disabled={tradingSettingsBusy}
            on:change={(event) => {
              const target = event.currentTarget as HTMLSelectElement;
              onTradingSettingChange("defaultSwapProvider", target.value as GuiTradingSettingsView["defaultSwapProvider"]);
            }}
          >
            <option value="ultra">Ultra</option>
            <option value="standard">Standard</option>
          </RetroSelect>
        </RetroField>

        <RetroField label="Default swap mode">
          <RetroSelect
            value={tradingSettingsDraft.defaultSwapMode}
            disabled={tradingSettingsBusy}
            on:change={(event) => {
              const target = event.currentTarget as HTMLSelectElement;
              onTradingSettingChange("defaultSwapMode", target.value as GuiTradingSettingsView["defaultSwapMode"]);
            }}
          >
            <option value="ExactIn">ExactIn</option>
            <option value="ExactOut">ExactOut</option>
          </RetroSelect>
        </RetroField>

        <RetroField label="Default amount unit">
          <RetroSelect
            value={tradingSettingsDraft.defaultAmountUnit}
            disabled={tradingSettingsBusy}
            on:change={(event) => {
              const target = event.currentTarget as HTMLSelectElement;
              onTradingSettingChange("defaultAmountUnit", target.value as GuiTradingSettingsView["defaultAmountUnit"]);
            }}
          >
            <option value="ui">UI</option>
            <option value="native">Native</option>
            <option value="percent">Percent</option>
          </RetroSelect>
        </RetroField>

        <RetroField label="Schedule action">
          <RetroInput
            value={tradingSettingsDraft.scheduleActionName}
            placeholder="scheduleManagedUltraSwap"
            disabled={tradingSettingsBusy}
            on:input={(event) => {
              const target = event.currentTarget as HTMLInputElement;
              onTradingSettingChange("scheduleActionName", target.value);
            }}
          />
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

  .section-meta {
    margin: 0.35rem 0 0;
    color: var(--tc-color-gray-1);
    font-size: 0.8rem;
    word-break: break-all;
  }

  .settings-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--tc-space-3);
    min-width: 0;
  }

  @media (max-width: var(--tc-layout-breakpoint)) {
    .settings-header {
      flex-direction: column;
    }

    .section-heading {
      flex-direction: column;
    }

    .settings-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
