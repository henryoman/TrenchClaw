<script lang="ts">
  import type { GuiWakeupSettingsView } from "@trenchclaw/types";
  import RetroButton from "../ui/RetroButton.svelte";
  import RetroField from "../ui/RetroField.svelte";
  import RetroPanel from "../ui/RetroPanel.svelte";
  import RetroSectionHeader from "../ui/RetroSectionHeader.svelte";
  import RetroStatusMessage from "../ui/RetroStatusMessage.svelte";

  type WakeupPanelProps = {
    wakeupSettingsFilePath?: string;
    wakeupSettings?: GuiWakeupSettingsView | null;
    defaultPrompt?: string;
    busy?: boolean;
    error?: string;
    onReload?: () => void;
    onSave?: (settings: GuiWakeupSettingsView) => Promise<void> | void;
  };

  let {
    wakeupSettingsFilePath = "",
    wakeupSettings = null,
    defaultPrompt = "",
    busy = false,
    error = "",
    onReload = () => {},
    onSave = () => {},
  }: WakeupPanelProps = $props();

  const DEFAULT_ENABLED_INTERVAL_MINUTES = 60;
  const DEFAULT_WAKEUP_SETTINGS: GuiWakeupSettingsView = {
    intervalMinutes: 0,
    prompt: "",
  };

  let draft: GuiWakeupSettingsView = $state({ ...DEFAULT_WAKEUP_SETTINGS });
  let enabledIntervalMinutes = $state(DEFAULT_ENABLED_INTERVAL_MINUTES);
  let enabledIntervalInput = $state(String(DEFAULT_ENABLED_INTERVAL_MINUTES));
  let hydrationSignature = $state("");
  let dirty = $state(false);

  const createHydrationSignature = (): string =>
    JSON.stringify({
      wakeupSettings,
      wakeupSettingsFilePath,
      defaultPrompt,
    });

  const normalizeInterval = (value: string): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    return Math.max(0, Math.min(24 * 60, Math.trunc(parsed)));
  };

  const normalizeEnabledInterval = (value: string): number => {
    const normalized = normalizeInterval(value);
    if (normalized === 0) {
      return DEFAULT_ENABLED_INTERVAL_MINUTES;
    }
    return Math.max(1, normalized);
  };

  const sanitizeIntervalInput = (value: string): string => value.replace(/\D+/g, "").slice(0, 4);

  const reload = (): void => {
    if (dirty) {
      const proceed = window.confirm("You have unsaved wakeup changes. Reload and discard them?");
      if (!proceed) {
        return;
      }
    }
    dirty = false;
    onReload();
  };

  const useDefaultPrompt = (): void => {
    draft = {
      ...draft,
      prompt: defaultPrompt,
    };
    dirty = true;
  };

  const save = (): void => {
    const wakeupsEnabled = draft.intervalMinutes > 0;
    const normalizedEnabledInterval = normalizeEnabledInterval(String(enabledIntervalMinutes));
    const normalized: GuiWakeupSettingsView = {
      intervalMinutes: wakeupsEnabled ? normalizedEnabledInterval : 0,
      prompt: draft.prompt,
    };
    enabledIntervalMinutes = normalizedEnabledInterval;
    enabledIntervalInput = String(normalizedEnabledInterval);
    Promise.resolve(onSave(normalized))
      .then(() => {
        dirty = false;
      })
      .catch(() => {});
  };

  $effect(() => {
    const signature = createHydrationSignature();
    if (signature === hydrationSignature) {
      return;
    }

    draft = wakeupSettings
      ? { ...wakeupSettings }
      : {
          ...DEFAULT_WAKEUP_SETTINGS,
          prompt: defaultPrompt || DEFAULT_WAKEUP_SETTINGS.prompt,
        };
    enabledIntervalMinutes = draft.intervalMinutes > 0 ? draft.intervalMinutes : DEFAULT_ENABLED_INTERVAL_MINUTES;
    enabledIntervalInput = String(enabledIntervalMinutes);
    hydrationSignature = signature;
    dirty = false;
  });
</script>

<RetroPanel title="Wakeup">
  <div class="wakeup-panel">
    <div class="wakeup-toolbar">
      <div class="meta">
        <p class="meta-label">File</p>
        <p class="meta-value">{wakeupSettingsFilePath || "No active wakeup file"}</p>
      </div>
      <div class="actions">
        <RetroButton variant="secondary" disabled={busy} on:click={reload}>Reload</RetroButton>
        <RetroButton variant="secondary" disabled={busy} on:click={useDefaultPrompt}>Use Default</RetroButton>
        <RetroButton disabled={busy || !dirty} on:click={save}>{busy ? "Saving..." : "Save"}</RetroButton>
      </div>
    </div>

    <RetroStatusMessage tone="error" text={error} />

    <RetroSectionHeader title="Interval" />
    <RetroField label="Wakeups">
      <div class="wakeup-controls">
        <button
          type="button"
          class={`toggle-button ${draft.intervalMinutes > 0 ? "is-active" : ""}`}
          aria-pressed={draft.intervalMinutes > 0}
          disabled={busy}
          onclick={() => {
            const wakeupsEnabled = draft.intervalMinutes > 0;
            const nextIntervalMinutes = wakeupsEnabled ? 0 : normalizeEnabledInterval(String(enabledIntervalMinutes));
            draft = {
              ...draft,
              intervalMinutes: nextIntervalMinutes,
            };
            enabledIntervalMinutes = wakeupsEnabled ? enabledIntervalMinutes : nextIntervalMinutes;
            enabledIntervalInput = String(enabledIntervalMinutes);
            dirty = true;
          }}
        >
          {draft.intervalMinutes > 0 ? "On" : "Off"}
        </button>
        <input
          type="text"
          inputmode="numeric"
          maxlength="4"
          class="numeric-input compact"
          aria-label="Wakeup interval in minutes"
          value={enabledIntervalInput}
          disabled={busy || draft.intervalMinutes === 0}
          oninput={(event) => {
            const input = event.currentTarget as HTMLInputElement;
            const sanitized = sanitizeIntervalInput(input.value);
            input.value = sanitized;
            enabledIntervalInput = sanitized;
            if (sanitized.length > 0) {
              const intervalMinutes = normalizeEnabledInterval(sanitized);
              enabledIntervalMinutes = intervalMinutes;
              draft = {
                ...draft,
                intervalMinutes: draft.intervalMinutes > 0 ? intervalMinutes : draft.intervalMinutes,
              };
            }
            dirty = true;
          }}
          onblur={() => {
            enabledIntervalInput = String(enabledIntervalMinutes);
          }}
        />
        <span class="interval-suffix">min</span>
      </div>
    </RetroField>
    <p class="hint">
      Leave wakeups off to disable them. When you turn them on, the interval starts at 60 minutes unless you change it.
    </p>

    <RetroSectionHeader title="Prompt" />
    <RetroField label="Wakeup message">
      <textarea
        class="prompt-textarea"
        rows="14"
        placeholder="IF there is something important, say what it is. IF not, do nothing."
        disabled={busy}
        value={draft.prompt}
        oninput={(event) => {
          draft = {
            ...draft,
            prompt: (event.currentTarget as HTMLTextAreaElement).value,
          };
          dirty = true;
        }}
      ></textarea>
    </RetroField>
    <p class="hint">
      Write the prompt like conditional operator logic. Example: “IF a pending job is safe to resume, explain it. IF a job looks
      risky, say why it should stay paused. IF nothing matters right now, do nothing.”
    </p>
  </div>
</RetroPanel>

<style>
  .wakeup-panel {
    display: grid;
    gap: var(--tc-space-3);
  }

  .wakeup-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--tc-space-3);
    align-items: start;
  }

  .actions {
    display: flex;
    gap: var(--tc-space-2);
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .meta {
    min-width: 0;
  }

  .meta-label,
  .meta-value,
  .hint {
    margin: 0;
  }

  .meta-label {
    color: var(--tc-color-gray-2);
    font-size: var(--tc-status-font-size);
    text-transform: uppercase;
    letter-spacing: var(--tc-status-letter-spacing);
  }

  .meta-value {
    color: var(--tc-color-gray-3);
    overflow-wrap: anywhere;
  }

  .hint {
    color: var(--tc-color-gray-2);
    font-size: var(--tc-status-font-size);
    line-height: 1.5;
  }

  .numeric-input,
  .prompt-textarea {
    width: 100%;
    border: var(--tc-border-muted);
    background: var(--tc-color-black-2);
    color: var(--tc-color-gray-3);
    padding: var(--tc-control-padding-y) var(--tc-control-padding-x);
    font-size: var(--tc-control-font-size);
    min-width: 0;
    box-sizing: border-box;
    font-family: inherit;
  }

  .wakeup-controls {
    display: flex;
    align-items: center;
    gap: var(--tc-space-2);
    flex-wrap: wrap;
  }

  .numeric-input.compact {
    width: 6ch;
    min-width: 6ch;
    text-align: right;
  }

  .interval-suffix {
    color: var(--tc-color-gray-2);
    font-size: var(--tc-status-font-size);
    letter-spacing: normal;
    text-transform: none;
  }

  .prompt-textarea {
    min-height: 18rem;
    resize: vertical;
    line-height: 1.5;
  }

  .toggle-button {
    width: fit-content;
    min-width: 7rem;
    border: var(--tc-border-muted);
    background: var(--tc-color-black-2);
    color: var(--tc-color-gray-3);
    padding: var(--tc-control-padding-y) var(--tc-control-padding-x);
    font-size: var(--tc-control-font-size);
    text-transform: uppercase;
    letter-spacing: var(--tc-button-letter-spacing);
    cursor: pointer;
  }

  .toggle-button.is-active {
    border-color: var(--tc-color-turquoise);
    color: var(--tc-color-turquoise);
  }

  .numeric-input:focus,
  .prompt-textarea:focus,
  .toggle-button:focus {
    border-color: var(--tc-color-turquoise);
  }

  @media (max-width: 900px) {
    .wakeup-toolbar {
      grid-template-columns: 1fr;
    }

    .actions {
      justify-content: flex-start;
    }
  }
</style>
