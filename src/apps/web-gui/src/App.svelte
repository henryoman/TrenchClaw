<script>
  let activeTab = "chat";
  let runtimeStatus = "runtime: checking...";
  let queueJobs = [];
  let chatInput = "";
  let isSendingChat = false;
  let queueRefreshTimer = null;
  const operatorAlias = import.meta.env.VITE_OPERATOR_ALIAS || "operator";

  const chatRows = [
    {
      role: "assistant",
      text: "Web console ready. Use Chat for prompts and Queue for runtime jobs.",
    },
  ];

  const formatTime = (unixMs) => new Date(unixMs).toLocaleString();

  const addChatRow = (role, text) => {
    chatRows.push({ role, text });
    chatRows.splice(0, Math.max(0, chatRows.length - 200));
  };

  const loadBootstrap = async () => {
    try {
      const response = await fetch("/api/gui/bootstrap");
      const payload = await response.json();
      runtimeStatus = `runtime: ${payload.profile}${payload.llmEnabled ? " | llm on" : " | llm off"}`;
    } catch {
      runtimeStatus = "runtime: offline";
    }
  };

  const refreshQueue = async () => {
    try {
      const response = await fetch("/api/gui/queue");
      if (!response.ok) {
        throw new Error("queue request failed");
      }
      const payload = await response.json();
      queueJobs = Array.isArray(payload.jobs) ? payload.jobs : [];
    } catch {
      queueJobs = [];
    }
  };

  const submitChat = async () => {
    const nextMessage = chatInput.trim();
    if (!nextMessage || isSendingChat) {
      return;
    }

    addChatRow("user", nextMessage);
    chatInput = "";
    isSendingChat = true;

    try {
      const response = await fetch("/api/gui/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: nextMessage }),
      });
      const payload = await response.json();
      if (!response.ok) {
        addChatRow("system", payload.error || "Request failed");
        return;
      }

      addChatRow("assistant", payload.reply || "(empty response)");
    } catch {
      addChatRow("system", "Unable to reach runtime server");
    } finally {
      isSendingChat = false;
    }
  };

  const startPolling = () => {
    if (queueRefreshTimer) {
      return;
    }

    queueRefreshTimer = setInterval(() => {
      void refreshQueue();
    }, 3_000);
  };

  const stopPolling = () => {
    if (!queueRefreshTimer) {
      return;
    }

    clearInterval(queueRefreshTimer);
    queueRefreshTimer = null;
  };

  $: if (activeTab === "queue") {
    void refreshQueue();
  }
</script>

<svelte:window
  on:load={() => {
    void Promise.all([loadBootstrap(), refreshQueue()]);
    startPolling();
  }}
  on:beforeunload={stopPolling}
/>

<main class="layout">
  <aside class="sidebar">
    <div class="brand">
      <h1>TrenchClaw GUI</h1>
      <p>Operator: {operatorAlias}</p>
    </div>
    <nav class="tabs" aria-label="Primary">
      <button class:active={activeTab === "chat"} on:click={() => (activeTab = "chat")} type="button">Chat</button>
      <button class:active={activeTab === "queue"} on:click={() => (activeTab = "queue")} type="button">Queue</button>
    </nav>
    <div class="runtime-status">{runtimeStatus}</div>
  </aside>

  <section class="content">
    {#if activeTab === "chat"}
      <div class="panel">
        <header class="panel-header">
          <h2>Chat</h2>
        </header>
        <div class="chat-log">
          {#each chatRows as row}
            <p class={`chat-row ${row.role}`}>
              <span>{row.role === "assistant" ? "TrenchClaw" : row.role === "user" ? "You" : "System"}:</span>
              {row.text}
            </p>
          {/each}
        </div>
        <form
          class="chat-form"
          on:submit|preventDefault={() => {
            void submitChat();
          }}
        >
          <input bind:value={chatInput} placeholder="Ask TrenchClaw..." />
          <button type="submit" disabled={isSendingChat}>Send</button>
        </form>
      </div>
    {:else}
      <div class="panel">
        <header class="panel-header">
          <h2>Queue</h2>
          <button
            type="button"
            on:click={() => {
              void refreshQueue();
            }}
          >
            Refresh
          </button>
        </header>
        <div class="queue-wrap">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Bot</th>
                <th>Routine</th>
                <th>Cycles</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {#if queueJobs.length === 0}
                <tr>
                  <td colspan="5">No jobs queued yet.</td>
                </tr>
              {:else}
                {#each queueJobs as job}
                  <tr>
                    <td>{job.status}</td>
                    <td>{job.botId}</td>
                    <td>{job.routineName}</td>
                    <td>{job.cyclesCompleted}</td>
                    <td>{formatTime(job.updatedAt)}</td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  </section>
</main>
