---
title: Getting Started
description: Install TrenchClaw, open the GUI, understand every panel and the Console, then connect keys and run your first chat.
order: 1
featured: true
---

This page is the full onboarding path: **terminal setup first**, then **what each part of the desktop GUI is for**, with extra detail on the **Console** and how it relates to chat and the runtime.

If you only want the minimal checklist, jump to [The shortest setup](#the-shortest-setup). For key names and provider choices, use [Keys and Settings](/docs/keys-and-settings). For how the runtime fits together, see [Architecture](/docs/architecture).

---

## The shortest setup

Do this in order:

1. Install the release (see [Install](#install)).
2. Run `trenchclaw`.
3. Create or sign into an **instance** (your isolated vault + settings + workspace; see [First screens](#first-screens-before-the-workspace)).
4. Open **Keys** and save your **OpenRouter API Key**.
5. Open **Settings** and set AI provider to **OpenRouter** and model to **GPT-5.4 Nano** (or the model your build lists).
6. In **Keys**, click **Test AI connection** (or use `trenchclaw doctor` from a terminal).
7. Stop there unless you need a private RPC or Jupiter Ultra swaps.

That is the clean default setup.

---

## Install

### macOS

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/macos-bootstrap.sh | bash
```

### Linux

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/linux-bootstrap.sh | bash
```

### Pin a release

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/macos-bootstrap.sh | TRENCHCLAW_VERSION=v0.0.0 bash
```

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://trenchclaw.vercel.app/install/linux-bootstrap.sh | TRENCHCLAW_VERSION=v0.0.0 bash
```

---

## Launch and check readiness

Start the app:

```bash
trenchclaw
```

Then, whenever something feels misconfigured:

```bash
trenchclaw doctor
```

Use `doctor` when the GUI shows offline status, AI will not connect, you changed keys, or you changed RPC-related setup.

---

## First screens (before the workspace)

The GUI is a **client** for the local runtime. Until the runtime is reachable and you pick an instance, you stay on splash screens—not the full workspace.

### 1. Loading

You briefly see a loading state while the GUI checks whether the runtime is up and what instances exist. If this hangs, the runtime may not be listening on the URL the GUI expects (see your install notes or `trenchclaw doctor`).

### 2. Landing (“Choose an instance to continue”)

- **Create instance** — Opens a modal: you choose a **name**, a **safety profile**, and optionally a **PIN**.
  - **View only** — Trading and wallet-changing actions are blocked.
  - **Confirm trading** — Trading is allowed; high-impact actions typically need confirmation.
  - **Allow trading without confirmation** — The strongest mode; use only if you understand the risk.
- **Log In** — Go to instance selection for an existing instance.
- **Retry connection** — Ask the GUI to talk to the runtime again after a network or process issue.

The small **runtime status** line on the card is the same signal you will later see summarized in the sidebar (online vs offline).

### 3. Log In / Sign in

Pick an **instance** from the list. If the instance requires it, enter the **PIN**, then **Sign in**. You can also choose **Create new instance** from this form to go back to creation flow.

After a successful sign-in, you enter the **main workspace**: left navigation, large central panel, and a **right column** that always includes context for Solana price and the **Console**.

---

## The workspace layout

Think of the signed-in UI as three vertical zones:

```text
┌─────────────┬──────────────────────────────┬──────────────────┐
│   Sidebar   │     Main panel (tab content)   │   Right column   │
│  (tabs)     │   Chat, Keys, Settings, etc.   │  SOL + optional  │
│             │                                │  queue + Console │
└─────────────┴──────────────────────────────┴──────────────────┘
```

- **Left — Sidebar** — Which *mode* you are in (Chat, Keys, …) plus **instance name**, **build version**, and **ONLINE / OFFLINE**.
- **Center — Main panel** — Everything for the active tab: conversation UI, forms, tables, or docs links.
- **Right — Column** — Always-on **context**: live **SOL/USD** (refreshed on a timer), optionally a **queue jobs** table if your build enabled it, and the **Console** panel at the bottom.

The center and right column work together: **Chat** shows the transcript and composer; the **Console** on the right shows a **compact feed** of what the agent and runtime are doing, including confirmations and timing summaries.

---

## Left sidebar: what each tab is for

### Chat

The operator surface: **conversations**, the **message list**, and the **composer** where you send prompts. The model streams replies and can invoke **tools** (on-chain actions, data fetches, workspace commands, and so on, depending on your runtime build).

You can **switch conversations**, **start a new one**, and manage **delete** options from the chat header controls. If AI is not configured, the composer may be disabled and you will see a reason from the runtime (fix keys and **Settings**, then **Test AI connection** in **Keys**).

### Keys

The **vault UI** for secrets: API keys, RPC credentials, Jupiter Ultra key, etc. Values are stored by the runtime for the **active instance**—not in the browser’s local storage as the source of truth.

Use **Reload** if you changed files on disk elsewhere, **Save** per field when you edit, and **Clear** when you want to remove a stored secret. **Test AI connection** verifies that the configured AI provider can be reached with what you saved.

Details of each key type live in [Keys and Settings](/docs/keys-and-settings).

### Settings

**Authoritative configuration** the runtime reads from disk (paths are shown in the panel):

- **AI** — Provider (e.g. OpenRouter vs Vercel AI Gateway), model id, and related options. The UI warns when the provider’s key is missing in **Keys**.
- **Trading** — Defaults for swap provider (Ultra is the supported path today), modes, presets, and scheduled action name.
- **RPC** — Which RPC provider option applies when you use a private RPC; only matters after you configure the matching secret in **Keys**.

Use **Reload** after external edits; **Save** writes your draft back for the runtime to use on the next operation.

### Wakeup

**Periodic “wake the agent”** behavior: interval and prompt text the runtime can use to run scheduled-style checks (paired with what the runtime exposes as wakeup settings). The panel can show a **preview** of how wakeup relates to **Schedule** data. **Save** persists; use **Reload** if the file changed outside the GUI.

### Info

Static **in-app orientation**: experimental warnings, what to assume about the build, and **links to the docs site** (including this page). It does not change runtime state.

### Wallets

A **read-focused tree** of wallet files under the instance’s wallet directory. You see **folder structure**, **wallet file count**, and can **reload** from disk. Typical use: confirm where keys live, copy an address, sanity-check that the runtime sees the same files you expect. Creation and advanced wallet operations may be driven by the agent or other flows depending on your version.

### Schedule

A **read-only table** of **scheduled jobs**: status, routine name, optional bot id, and **next run** time (or **Paused**). Use **Wakeup** (and runtime automation) to change behavior; this tab is for visibility.

---

## Right column: SOL price, queue (optional), and Console

### SOL price strip

A small strip showing **SOL/USD** and last update time, with a manual refresh control. It is independent of the active tab: you always see market context while signed in.

### Queue panel (not always visible)

Some **development or custom builds** enable a **queue** table above the Console by setting the environment variable `TRENCHCLAW_GUI_ENABLE_QUEUE_PANEL` to a truthy value (`1`, `true`, `yes`, `on`) when building the GUI. When present, it lists **background jobs**: status, bot id, routine name, queue time, and cycle counts.

Release builds often ship **without** this panel; if you do not see it, the Console simply uses more vertical space.

### Console (always present while signed in)

The **Console** is a **RetroPanel** titled “Console”. It is **not** a Unix shell. It is a **structured activity feed** for:

1. **Live agent activity** for the current chat turn — tool names, states, errors, and short summaries (labeled **`agent`** on the left).
2. **Historical / runtime-backed lines** — timestamped entries from the runtime’s activity log (various **source** labels), including things like **initialization** and **confirmation-related** messages.

When nothing has happened yet, you see **“No confirmations yet.”** That is normal on a fresh instance before the first substantive runtime events.

#### How the Console relates to the chat panel

- **Chat (center)** — Full **transcript**: your messages, the assistant’s markdown, expandable **reasoning / thought** blocks when the model exposes them, and tool UI embedded in the stream.
- **Console (right)** — A **dense, scrolling-friendly log** of **what just happened** in operational terms: which tool ran, whether something failed, how long a response took, and **runtime-level** notices.

If you are debugging “it did something but I missed it,” check the **Console** first; if you need the full narrative, scroll the **Chat** transcript.

#### Order of lines

Newer **live** agent lines appear **above** the **feed** rows that come from stored activity. Feed rows include a **time** (for most entries) and a **source** tag so you can tell **agent** vs **runtime** (and other labels your build emits).

---

## Chat: what you see while the agent works

When you send a message:

1. The UI enters a **pending** state (submitted / streaming) until the model finishes.
2. **Tool calls** show as activity: queued, running, completed, or error. Errors are summarized for quick reading; the full text may appear in the transcript or runtime logs.
3. **Thought** or **reasoning** blocks (when present) can be expanded or collapsed; the Console still gives a parallel **operational** view.

If chat is disabled, fix **Keys** + **Settings** and verify **Test AI connection** and `trenchclaw doctor`.

---

## Sidebar status: ONLINE vs OFFLINE

The bottom of the sidebar shows **ONLINE** or **OFFLINE** with an indicator. **ONLINE** means the GUI considers the runtime reachable for routine polling (status, activity, queue, schedule, wallets, etc.). **OFFLINE** usually means the runtime process is down, the wrong host/port is configured, or something is blocking the connection—use **Retry** on the splash screen or restart `trenchclaw` and run `trenchclaw doctor`.

The runtime status string can also reflect your **safety profile** and whether **AI** is on, so you can tell at a glance how the instance is configured.

---

## What to do inside the app (setup recap)

### 1. Create or sign into an instance

Do this first. The instance is where TrenchClaw stores your vault, trading settings, and workspace data.

### 2. Open **Keys**

For most users, only one key matters on day one:

- **OpenRouter API Key** — Recommended for the default chat path.

Optional:

- **Private RPC credential** — When you want Helius or another private RPC instead of public RPC.
- **Jupiter Ultra API Key** — When you want Ultra swaps.
- **Vercel AI Gateway API Key** — Alternative AI path; most people start with OpenRouter.

### 3. Open **Settings**

Defaults that work for most people:

- AI provider: **OpenRouter**
- Model: **GPT-5.4 Nano** (or the equivalent your UI lists)
- Leave default swap on **Ultra** if you trade.

Leave private RPC alone in **Settings** until you saved a matching credential in **Keys**.

---

## When you need extra keys

### Private RPC credential

Add when you want Helius-backed reads or a private RPC. Optional for first chat.

### Jupiter Ultra API Key

Add when you want swaps through Jupiter Ultra. Optional if you are not swapping.

---

## What **Ultra** means

**Ultra** means TrenchClaw uses Jupiter’s managed Ultra swap flow: routing, slippage behavior, and execution details are handled through that product path. It is the supported swap mode today; other paths are still evolving.

More detail: [Keys and Settings](/docs/keys-and-settings).

---

## If something fails

1. Run `trenchclaw doctor`.
2. Confirm an instance is active and signed in.
3. Confirm the key you saved matches the provider you selected in **Settings**.
4. Click **Test AI connection** again after saving.
5. Watch the **Console** for runtime or tool errors while reproducing the issue.

For the exact key and settings matrix, use [Keys and Settings](/docs/keys-and-settings).

---

## Experimental software warning

This project is **experimental**. Unexpected behavior is possible. Use small balances, prefer explicit confirmations where offered, and read [Architecture](/docs/architecture) when you want to understand boundaries between the GUI, runtime, and on-chain actions.
