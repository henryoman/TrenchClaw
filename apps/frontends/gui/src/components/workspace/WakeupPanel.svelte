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

  const DEFAULT_WAKEUP_SETTINGS: GuiWakeupSettingsView = {
    intervalMinutes: 0,
    prompt: "",
  };

  let draft: GuiWakeupSettingsView = $state({ ...DEFAULT_WAKEUP_SETTINGS });
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
    const normalized: GuiWakeupSettingsView = {
      intervalMinutes: normalizeInterval(String(draft.intervalMinutes)),
      prompt: draft.prompt,
    };
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
    <RetroField label="Wakeup interval (minutes)">
      <input
        type="number"
        class="numeric-input"
        min="0"
        max="1440"
        step="1"
        value={String(draft.intervalMinutes)}
        disabled={busy}
        oninput={(event) => {
          draft = {
            ...draft,
            intervalMinutes: normalizeInterval((event.currentTarget as HTMLInputElement).value),
          };
          dirty = true;
        }}
      />
    </RetroField>
    <p class="hint">
      `0` disables wakeups. Higher values make this behave more like a periodic review instead of a frequent check.
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

    <RetroSectionHeader title="JSON Shape" />
    <pre class="json-preview">{JSON.stringify({ intervalMinutes: draft.intervalMinutes, prompt: draft.prompt }, null, 2)}</pre>
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

  .prompt-textarea {
    min-height: 18rem;
    resize: vertical;
    line-height: 1.5;
  }

  .numeric-input:focus,
  .prompt-textarea:focus {
    border-color: var(--tc-color-turquoise);
  }

  .json-preview {
    margin: 0;
    border: var(--tc-border-muted);
    background: color-mix(in srgb, var(--tc-color-black) 85%, var(--tc-color-turquoise) 15%);
    color: var(--tc-color-gray-3);
    padding: var(--tc-space-3);
    overflow: auto;
    font-size: 12px;
    line-height: 1.5;
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
