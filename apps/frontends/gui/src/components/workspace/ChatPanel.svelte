<script lang="ts">
  import { onMount, tick } from "svelte";
  import { isToolUIPart, type UIMessage } from "ai";
  import { marked } from "marked";
  import type { GuiConversationView } from "@trenchclaw/types";
  import RetroButton from "../ui/RetroButton.svelte";

  type ChatPanelProps = {
    messages?: UIMessage[];
    input?: string;
    conversations?: GuiConversationView[];
    activeConversationId?: string | null;
    sending?: boolean;
    chatDisabledReason?: string;
    runtimeError?: string;
    onSelectConversation: (conversationId: string) => void;
    onCreateConversation: () => void;
    onSubmit: () => void;
  };

  let {
    messages = [],
    input = $bindable(""),
    conversations = [],
    activeConversationId = null,
    sending = false,
    chatDisabledReason = "",
    runtimeError = "",
    onSelectConversation,
    onCreateConversation,
    onSubmit,
  }: ChatPanelProps = $props();

  let showConversationModal = $state(false);
  const chatDisabled = $derived(chatDisabledReason.trim().length > 0);
  let messageViewport: HTMLDivElement | null = $state(null);
  let composer: HTMLTextAreaElement | null = $state(null);
  let shouldFollowStream = $state(true);
  const renderKey = $derived(`${messages.length}:${sending ? "1" : "0"}`);
  let lastRenderKey = "";
  const SCROLL_BOTTOM_TOLERANCE_PX = 20;
  const COMPOSER_MAX_LINES = 5;

  type MessagePart = UIMessage["parts"][number];

  interface ToolActivityLine {
    key: string;
    label: string;
  }

  interface AssistantMessageSegments {
    visibleTextParts: string[];
    errorTexts: string[];
    toolActivity: ToolActivityLine[];
  }

  const normalizeDisplayText = (value: string): string =>
    value
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  const renderMarkdown = (value: string): string => {
    const text = normalizeDisplayText(value);
    if (!text) {
      return "";
    }

    return marked.parse(text, { breaks: true }) as string;
  };

  const isTextPart = (part: MessagePart): part is Extract<MessagePart, { type: "text" }> => part.type === "text";

  const isErrorPart = (part: MessagePart): part is MessagePart & { errorText: string } =>
    "errorText" in part && typeof part.errorText === "string";

  const summarizeToolState = (state: string | undefined): string => {
    switch (state) {
      case "input-streaming":
        return "preparing";
      case "input-available":
        return "running";
      case "output-available":
        return "done";
      default:
        return state ?? "working";
    }
  };

  const getToolName = (part: MessagePart): string =>
    part.type.startsWith("tool-") ? part.type.slice(5) : part.type;

  const truncateText = (value: string, maxLength: number): string => {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
  };

  const summarizeErrorText = (value: string): string => {
    const text = normalizeDisplayText(value);
    if (!text) {
      return "Unknown error";
    }

    const unavailableToolMatch = text.match(/unavailable tool '([^']+)'/i);
    if (unavailableToolMatch) {
      return `Unavailable tool: ${unavailableToolMatch[1]}`;
    }

    const missingFileMatch = text.match(/ENOENT: no such file or directory, open '([^']+)'/i);
    if (missingFileMatch) {
      const pathParts = missingFileMatch[1].split("/");
      return `Missing file: ${pathParts[pathParts.length - 1]}`;
    }

    const rpcErrorMatch = text.match(/\bRPC error\b[:.]?\s*(.*)$/i);
    if (rpcErrorMatch) {
      return truncateText(`RPC error${rpcErrorMatch[1] ? `: ${rpcErrorMatch[1]}` : ""}`, 96);
    }

    const firstLine = text.split("\n")[0]?.trim() ?? text;
    const firstSentence = firstLine.split(/(?<=[.!?])\s+/)[0]?.trim() ?? firstLine;
    return truncateText(firstSentence.replace(/\s+/g, " "), 96);
  };

  const getAssistantMessageSegments = (message: UIMessage): AssistantMessageSegments => {
    const visibleTextParts: string[] = [];
    const errorTexts: string[] = [];
    const toolActivity: ToolActivityLine[] = [];

    message.parts.forEach((part, index) => {
      if (isTextPart(part)) {
        const text = normalizeDisplayText(part.text ?? "");
        if (!text) {
          return;
        }

        visibleTextParts.push(text);
        return;
      }

      if (isErrorPart(part)) {
        const text = normalizeDisplayText(part.errorText);
        if (text) {
          errorTexts.push(text);
        }
        return;
      }

      if (isToolUIPart(part)) {
        toolActivity.push({
          key: part.toolCallId,
          label: `${getToolName(part)}: ${summarizeToolState(part.state)}`,
        });
      }
    });

    return {
      visibleTextParts,
      errorTexts,
      toolActivity,
    };
  };

  const hasAssistantActivity = (segments: AssistantMessageSegments): boolean =>
    segments.errorTexts.length > 0
    || segments.toolActivity.length > 0;

  const isNearBottom = (): boolean => {
    if (!messageViewport) {
      return true;
    }
    const remaining = messageViewport.scrollHeight - messageViewport.scrollTop - messageViewport.clientHeight;
    return remaining <= SCROLL_BOTTOM_TOLERANCE_PX;
  };

  const scrollToBottom = (behavior: ScrollBehavior): void => {
    if (!messageViewport) {
      return;
    }
    messageViewport.scrollTo({
      top: messageViewport.scrollHeight,
      behavior,
    });
  };

  const onMessagesScroll = (): void => {
    shouldFollowStream = isNearBottom();
  };

  const syncScrollForLatestMessages = async (behavior: ScrollBehavior): Promise<void> => {
    await tick();
    if (!messageViewport) {
      return;
    }
    if (!shouldFollowStream && !sending) {
      return;
    }
    scrollToBottom(behavior);
  };

  const resizeComposer = (): void => {
    if (!composer) {
      return;
    }

    const styles = window.getComputedStyle(composer);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 18;
    const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
    const borderTop = Number.parseFloat(styles.borderTopWidth) || 0;
    const borderBottom = Number.parseFloat(styles.borderBottomWidth) || 0;
    const maxHeight = lineHeight * COMPOSER_MAX_LINES + paddingTop + paddingBottom + borderTop + borderBottom;

    composer.style.height = "auto";
    const nextHeight = Math.min(composer.scrollHeight, maxHeight);
    composer.style.height = `${nextHeight}px`;
    composer.style.overflowY = composer.scrollHeight > maxHeight ? "auto" : "hidden";
  };

  const submitChat = (): void => {
    if (chatDisabled || sending) {
      return;
    }
    onSubmit();
    void syncScrollForLatestMessages("smooth");
  };

  const onComposerKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    event.preventDefault();
    submitChat();
  };

  $effect(() => {
    if (renderKey !== lastRenderKey) {
      lastRenderKey = renderKey;
      void syncScrollForLatestMessages(messages.length <= 1 ? "auto" : "smooth");
    }
  });

  $effect(() => {
    void input;
    resizeComposer();
  });

  onMount(() => {
    scrollToBottom("auto");
    resizeComposer();
  });
</script>

<section class="chat-root">
  <header class="chat-header">
    <span>Chat</span>
    <div class="chat-header-actions">
      <button
        type="button"
        class="conversation-picker-button"
        aria-label="Create new conversation"
        onclick={() => {
          onCreateConversation();
          showConversationModal = false;
        }}
      >
        <svg class="plus-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M8 3.5v9M3.5 8h9" />
        </svg></button
      >
      <button
        type="button"
        class="conversation-picker-button conversation-picker-toggle"
        aria-label="Open conversations"
        onclick={() => {
          showConversationModal = !showConversationModal;
        }}
      >
        <span
          class="conversation-picker-caret"
          class:is-open={showConversationModal}
          aria-hidden="true">▼</span
        >
      </button
      >
    </div>
  </header>

  {#if showConversationModal}
    <section class="conversation-modal" aria-label="Conversations">
      <header class="conversation-modal-header">
        <span class="conversation-modal-title">conversations</span>
        <button
          type="button"
          class="conversation-modal-close"
          aria-label="Close conversations"
          onclick={() => {
            showConversationModal = false;
          }}
        >
          <svg class="conversation-modal-close-icon" viewBox="0 0 8 8" aria-hidden="true" focusable="false">
            <path d="M1 1L7 7M7 1L1 7" />
          </svg>
        </button
        >
      </header>
      <div class="conversation-modal-list">
        {#if conversations.length === 0}
          <p class="conversation-empty">No conversations yet</p>
        {:else}
          {#each conversations as conversation (conversation.id)}
            <button
              type="button"
              class="conversation-option {activeConversationId === conversation.id ? 'active' : ''}"
              onclick={() => {
                onSelectConversation(conversation.id);
                showConversationModal = false;
              }}
            >
              {conversation.title}
            </button>
          {/each}
        {/if}
      </div>
    </section>
  {/if}

  <div class="chat-messages" bind:this={messageViewport} onscroll={onMessagesScroll}>
    {#each messages as message (message.id)}
      {#if message.role === "assistant"}
        {@const segments = getAssistantMessageSegments(message)}

        {#if hasAssistantActivity(segments)}
          <div class="message-row assistant activity-row">
            <details class="activity-panel">
              <summary>
                <span>Activity</span>
                <span class="activity-summary-caret" aria-hidden="true">▼</span>
              </summary>
              <div class="activity-body">
                {#each segments.toolActivity as tool (`${message.id}:tool:${tool.key}`)}
                  <p class="tool-activity">{tool.label}</p>
                {/each}

                {#each segments.errorTexts as errorText, errorIndex (`${message.id}:error:${errorIndex}`)}
                  <p class="error-text" title={errorText}>Error: {summarizeErrorText(errorText)}</p>
                {/each}
              </div>
            </details>
          </div>
        {/if}

        {#if segments.visibleTextParts.length > 0}
          <div class="message-row assistant">
            <div class="bubble assistant">
              {#each segments.visibleTextParts as text, textIndex (`${message.id}:visible:${textIndex}`)}
                {@const html = renderMarkdown(text)}
                {#if html}
                  <div class="markdown-content">{@html html}</div>
                {/if}
              {/each}
            </div>
          </div>
        {/if}
      {:else}
        <div class="message-row {message.role}">
          <div class="bubble {message.role}">
            {#each message.parts as part, partIndex (`${message.id}:${partIndex}:${part.type}`)}
              {#if part.type === "text"}
                <p>{normalizeDisplayText(part.text ?? "")}</p>
              {:else if "errorText" in part && typeof part.errorText === "string"}
                {@const normalizedErrorText = normalizeDisplayText(part.errorText)}
                <p class="error-text" title={normalizedErrorText}>Error: {summarizeErrorText(normalizedErrorText)}</p>
              {/if}
            {/each}
          </div>
        </div>
      {/if}
    {/each}
    {#if sending}
      <div class="message-row assistant">
        <div class="bubble assistant thinking-bubble">
          <p>Working...</p>
        </div>
      </div>
    {/if}
  </div>

  {#if chatDisabled}
    <p class="chat-disabled">{chatDisabledReason}</p>
  {/if}

  {#if runtimeError.trim().length > 0}
    <p class="chat-runtime-error">{runtimeError}</p>
  {/if}

  <form
    class="chat-form"
    onsubmit={(event) => {
      event.preventDefault();
      submitChat();
    }}
  >
    <textarea
      bind:this={composer}
      bind:value={input}
      class="chat-composer"
      placeholder="Type a message"
      disabled={chatDisabled}
      rows="1"
      spellcheck="false"
      oninput={resizeComposer}
      onkeydown={onComposerKeyDown}
    ></textarea>
    <RetroButton type="submit" disabled={sending || chatDisabled}>Send</RetroButton>
  </form>
</section>

<style>
  .chat-root {
    border: var(--tc-border);
    background: var(--tc-color-black-2);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
    position: relative;
  }

  .chat-header {
    flex-shrink: 0;
    border-bottom: var(--tc-border-muted);
    color: var(--tc-color-turquoise);
    padding: 10px 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.86rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .conversation-picker-button {
    width: 22px;
    height: 22px;
    border: var(--tc-border-muted);
    background: transparent;
    color: var(--tc-color-turquoise);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    cursor: pointer;
    font-size: 0.68rem;
    line-height: 1;
  }

  .conversation-picker-toggle {
    color: var(--tc-color-lime);
  }

  .conversation-picker-caret {
    display: inline-flex;
    line-height: 1;
    transform-origin: center;
    transition: transform 160ms ease;
  }

  .conversation-picker-caret.is-open {
    transform: rotate(180deg);
  }

  .plus-icon {
    width: 10px;
    height: 10px;
    display: block;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: square;
    fill: none;
  }

  .chat-header-actions {
    display: inline-flex;
    gap: var(--tc-space-1);
  }

  .conversation-modal {
    position: absolute;
    top: 42px;
    right: 12px;
    z-index: 10;
    width: min(280px, 100%);
    border: var(--tc-border);
    background: var(--tc-color-black-2);
  }

  .conversation-modal-header {
    border-bottom: var(--tc-border-muted);
    padding: var(--tc-space-2);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .conversation-modal-title {
    color: var(--tc-color-cream);
    font-size: var(--tc-type-md);
    font-weight: 700;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .conversation-modal-close {
    border: var(--tc-border-muted);
    background: transparent;
    color: var(--tc-color-gray-2);
    width: 18px;
    height: 18px;
    padding: 0;
    cursor: pointer;
    display: grid;
    place-items: center;
  }

  .conversation-modal-close-icon {
    width: 8px;
    height: 8px;
    stroke: currentColor;
    stroke-width: 1.25;
    fill: none;
  }

  .conversation-modal-list {
    display: flex;
    flex-direction: column;
  }

  .conversation-empty {
    margin: 0;
    padding: var(--tc-space-2);
    color: var(--tc-color-gray-2);
    font-size: 0.72rem;
    text-transform: uppercase;
  }

  .conversation-option {
    border: 0;
    border-bottom: var(--tc-border-muted);
    background: transparent;
    color: var(--tc-color-gray-1);
    padding: var(--tc-space-2);
    font-family: inherit;
    font-size: 0.72rem;
    text-transform: uppercase;
    text-align: left;
    cursor: pointer;
  }

  .conversation-option:last-child {
    border-bottom: 0;
  }

  .conversation-option.active {
    color: var(--tc-color-turquoise);
  }

  .chat-messages {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--tc-space-1) var(--tc-space-2) var(--tc-space-2);
    display: flex;
    flex-direction: column;
    gap: var(--tc-space-2);
  }

  .message-row {
    display: flex;
  }

  .message-row.user {
    justify-content: flex-end;
  }

  .message-row.assistant,
  .message-row.system {
    justify-content: flex-start;
  }

  .bubble {
    max-width: 90%;
    border: var(--tc-border-muted);
    padding: var(--tc-space-2) var(--tc-space-3);
    font-size: var(--tc-chat-text-size);
    line-height: 1.4;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .bubble.user {
    color: var(--tc-color-lime);
    background: var(--tc-color-gray-2);
    border-color: var(--tc-color-gray-2);
    font-weight: 100;
  }

  .bubble.assistant {
    color: var(--tc-color-gray-3);
    background: var(--tc-color-black-2);
    font-weight: 100;
  }

  .thinking-bubble {
    opacity: 0.9;
    animation: pulse 1.1s ease-in-out infinite;
  }

  .activity-row {
    margin-bottom: calc(var(--tc-space-1) * -1);
  }

  .activity-panel {
    width: min(90%, 32rem);
    border: var(--tc-border-muted);
    color: var(--tc-color-gray-2);
    background: var(--tc-color-black-light);
    font-size: 0.78rem;
  }

  .activity-panel summary {
    cursor: pointer;
    list-style: none;
    padding: var(--tc-space-2) var(--tc-space-3);
    color: var(--tc-color-turquoise);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--tc-space-2);
  }

  .activity-panel summary::-webkit-details-marker {
    display: none;
  }

  .activity-summary-caret {
    color: var(--tc-color-lime);
    font-size: 0.7rem;
    line-height: 1;
    display: inline-flex;
    flex-shrink: 0;
    transform-origin: center;
    transition: transform 160ms ease;
  }

  .activity-panel[open] .activity-summary-caret {
    transform: rotate(180deg);
  }

  .activity-body {
    border-top: var(--tc-border-muted);
    padding: var(--tc-space-2) var(--tc-space-3);
    display: grid;
    gap: var(--tc-space-2);
  }

  .activity-body p {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .tool-activity {
    color: var(--tc-color-gray-3);
  }

  .bubble.system {
    color: var(--tc-color-red);
    background: var(--tc-color-black-2);
  }

  .bubble p {
    margin: 0;
  }

  .markdown-content {
    white-space: normal;
  }

  .markdown-content + .markdown-content {
    margin-top: var(--tc-space-2);
  }

  .markdown-content :global(*) {
    max-width: 100%;
  }

  .markdown-content :global(p),
  .markdown-content :global(ul),
  .markdown-content :global(ol),
  .markdown-content :global(pre),
  .markdown-content :global(blockquote),
  .markdown-content :global(h1),
  .markdown-content :global(h2),
  .markdown-content :global(h3),
  .markdown-content :global(h4),
  .markdown-content :global(h5),
  .markdown-content :global(h6) {
    margin: 0 0 var(--tc-space-2) 0;
  }

  .markdown-content :global(:last-child) {
    margin-bottom: 0;
  }

  .markdown-content :global(ul),
  .markdown-content :global(ol) {
    padding-left: 1.25rem;
  }

  .markdown-content :global(li + li) {
    margin-top: 0.2rem;
  }

  .markdown-content :global(code) {
    font-family: inherit;
  }

  .markdown-content :global(strong),
  .markdown-content :global(b) {
    font-weight: 600;
  }

  .markdown-content :global(pre) {
    overflow-x: auto;
    border: var(--tc-border-muted);
    padding: var(--tc-space-2);
  }

  .markdown-content :global(pre code) {
    white-space: pre;
  }

  .markdown-content :global(a) {
    color: var(--tc-color-turquoise);
  }

  .markdown-content :global(blockquote) {
    margin-left: 0;
    padding-left: var(--tc-space-2);
    border-left: var(--tc-border-muted);
    color: var(--tc-color-gray-2);
  }

  .error-text {
    color: var(--tc-color-red);
  }

  @keyframes pulse {
    0% {
      opacity: 0.45;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0.45;
    }
  }

  .chat-form {
    flex-shrink: 0;
    padding: var(--tc-space-2);
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--tc-space-2);
  }

  .chat-disabled {
    margin: 0;
    border-top: var(--tc-border-muted);
    color: var(--tc-color-red);
    padding: var(--tc-space-2) var(--tc-space-3);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: var(--tc-sidebar-letter-spacing);
  }

  .chat-runtime-error {
    margin: 0;
    border-top: var(--tc-border-muted);
    color: var(--tc-color-red);
    padding: var(--tc-space-2) var(--tc-space-3);
    font-size: 0.72rem;
    letter-spacing: var(--tc-sidebar-letter-spacing);
  }

  .chat-composer {
    width: 100%;
    min-width: 0;
    min-height: calc(1.4em + (var(--tc-control-padding-y) * 2));
    max-height: calc((1.4em * 5) + (var(--tc-control-padding-y) * 2) + 2px);
    border: var(--tc-border-muted);
    background: var(--tc-color-black-2);
    color: var(--tc-color-gray-3);
    padding: var(--tc-control-padding-y) var(--tc-control-padding-x);
    font-family: inherit;
    font-size: var(--tc-chat-text-size);
    line-height: 1.4;
    resize: none;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
    scrollbar-width: none;
  }

  .chat-composer:focus {
    border-color: var(--tc-color-turquoise);
    outline: none;
  }

  .chat-composer::-webkit-scrollbar {
    display: none;
  }

  .chat-composer::placeholder {
    color: var(--tc-color-turquoise);
  }
</style>
