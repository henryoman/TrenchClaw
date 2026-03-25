---
title: Getting Started
description: Install TrenchClaw, launch the runtime, sign into an instance, add one AI key, and get to a clean first chat.
order: 1
featured: true
---

TrenchClaw is a local runtime with a GUI on top of it. The clean setup is simple: install it, start it, sign into an instance, save one AI key, and begin from there.

Use [Keys and Settings](/docs/keys-and-settings) for the exact key matrix. Use [Architecture](/docs/architecture) when you want the runtime model underneath the GUI.

## Fast Path

1. Install TrenchClaw.
2. Run `trenchclaw`.
3. Create or sign into an instance.
4. Open **Keys** and save your `OpenRouter API Key`.
5. Open **Settings** and choose `OpenRouter` plus the model your build recommends.
6. Click **Test AI connection**.
7. Start chatting.

That is the default path for most users.

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

## Launch

Start the app:

```bash
trenchclaw
```

When something feels off, run:

```bash
trenchclaw doctor
```

Use `doctor` when the GUI shows offline status, AI will not connect, or you changed keys or RPC settings and want a quick reality check.

## First Launch

The GUI is a client of the local runtime. Until the runtime is reachable and you pick an instance, you stay in the sign-in flow rather than the full workspace.

### Create or sign into an instance

An instance is the boundary for your vault, settings, managed wallets, logs, workspace files, and chat context. Create one if you are starting fresh, or sign into an existing one if you already have local state on disk.

When you create an instance, you choose the operating profile you want the runtime to use. When you sign into an existing instance, the GUI loads that instance's runtime state.

## The Workspace

```text
┌─────────────┬──────────────────────────────┬──────────────────┐
│   Sidebar   │     Main panel (tab content) │   Right column   │
│   (tabs)    │   Chat, Keys, Settings, etc. │  SOL + optional  │
│             │                              │  queue + Console │
└─────────────┴──────────────────────────────┴──────────────────┘
```

- **Sidebar** selects the active surface and shows the current instance plus runtime status.
- **Main panel** holds the active view: chat, keys, settings, wallets, schedule, or in-app info.
- **Right column** keeps live context visible: SOL price, optional queue state, and the Console.

Chat gives you the full narrative. The Console gives you the compact operational feed.

## Main Surfaces

### Chat

This is the operator surface. You send prompts here, read the transcript here, and watch tool-backed responses stream here.

### Keys

This is the instance vault UI for API keys and provider credentials. Save your AI key here first. The runtime stores those values for the active instance.

### Settings

This is the runtime configuration surface. The important day-one settings are the AI provider and model. Leave the rest alone until you need them.

### Wakeup

This is the periodic wakeup surface for recurring checks and scheduled prompts.

### Wallets

This is the read-focused view of managed wallet files for the active instance.

### Schedule

This is the read-only schedule view for queued and recurring runtime work.

### Info

This is the lightweight orientation surface inside the app. It links back to docs and explains the build at a high level.

## Right Column

### SOL price strip

The SOL price strip stays visible across the workspace so you always have market context while signed in.

### Queue panel

Some builds expose a queue panel above the Console. When it is present, it shows background jobs and runtime work in flight. When it is absent, nothing is wrong.

### Console

The Console is not a shell. It is a structured activity feed for the runtime and agent.

Use it when you want to see what just happened without reading the full transcript. It is the fastest place to check tool runs, confirmations, errors, and runtime notices.

## Recommended Defaults

- Save your `OpenRouter API Key`.
- Set AI provider to `OpenRouter`.
- Pick the model your build recommends.
- Leave private RPC settings alone unless you already have private RPC credentials.
- Add a `Jupiter Ultra API Key` only when you want swap flows.

That gets you to the clean first-run configuration.

## If Something Fails

1. Run `trenchclaw doctor`.
2. Make sure you are signed into the correct instance.
3. Confirm the key in **Keys** matches the provider in **Settings**.
4. Click **Test AI connection** again.
5. Check the **Console** while reproducing the issue.

For the exact key and settings matrix, use [Keys and Settings](/docs/keys-and-settings).
