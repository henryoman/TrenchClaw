# Knowledge Manifest

Generated at: 2026-03-16T22:42:16.914Z
Root: src/ai/brain/knowledge

Use this manifest to choose the smallest correct doc set before opening files.

## Routing Rules

- Treat the live runtime contract, enabled tool allowlist, and resolved settings as higher authority than docs.
- Start with repo-authored reference docs for runtime, settings, wallet, and workspace behavior.
- Use repo-authored guides for local workflows, command patterns, and integration shortcuts.
- Escalate to deep vendor references only when exact API/provider detail is required.
- Use skill packs when the task clearly matches a skill workflow; the `SKILL.md` file is the entry point.

## Core Docs

| path | kind | priority | authority | read when |
| --- | --- | --- | --- | --- |
| `src/ai/brain/knowledge/bash-tool.md` | guide | read-second | repo-authored | workspace bash/read/write tool usage, shell discovery, or file inspection questions |
| `src/ai/brain/knowledge/helius-agents.md` | guide | read-second | repo-authored | Helius onboarding, RPC operations, DAS usage, or TrenchClaw Helius integration work |
| `src/ai/brain/knowledge/runtime-reference.md` | reference | read-first | repo-authored | runtime architecture, bootstrap flow, capability exposure, or state-root questions |
| `src/ai/brain/knowledge/settings-reference.md` | reference | read-first | repo-authored | provider selection, settings ownership, overlay order, or vault lookup questions |
| `src/ai/brain/knowledge/solana-cli.md` | guide | read-second | repo-authored | Solana CLI commands, validator inspection, or local wallet shell workflows |
| `src/ai/brain/knowledge/solanacli-file-system-wallet.md` | guide | read-second | repo-authored | filesystem wallet creation, keypair verification, or Solana CLI wallet-file questions |
| `src/ai/brain/knowledge/wallet-reference.md` | reference | read-first | repo-authored | wallet organization, key material handling, or signing-path questions |

## Deep References

| path | topics | priority | read when |
| --- | --- | --- | --- |
| `src/ai/brain/knowledge/deep-knowledge/ai-and-runtime/bun-secrets-docs.md` | bun, secrets, env, runtime | escalate | Bun secrets API details are needed beyond the repo-authored short references |
| `src/ai/brain/knowledge/deep-knowledge/ai-and-runtime/bun-shell-docs.md` | bun, shell, cli, scripts | escalate | Bun shell syntax, escaping, streaming, or command-behavior details are needed |
| `src/ai/brain/knowledge/deep-knowledge/ai-and-runtime/bun-sqlite-docs.md` | bun, sqlite, database, sql | escalate | Bun SQLite APIs, transactions, prepared statements, or schema details are needed |
| `src/ai/brain/knowledge/deep-knowledge/ai-and-runtime/data-structures-as-json.md` | json, data-structures, serialization | escalate | JSON serialization behavior or data-shape conversion details are needed |
| `src/ai/brain/knowledge/deep-knowledge/solana/dexscreener/api-reference.md` | dexscreener, api, market-data | escalate | Dexscreener endpoints, parameters, or response-shape details are needed |
| `src/ai/brain/knowledge/deep-knowledge/solana/dexscreener/data-retreival-docs.md` | dexscreener, actions, market-data | escalate | Dexscreener request flows, action patterns, or data retrieval details are needed |
| `src/ai/brain/knowledge/deep-knowledge/solana/helius/helius-agents-llms.md` | helius, agents, docs-index | specialized | you need to discover which Helius agents docs pages exist before opening a deeper reference |
| `src/ai/brain/knowledge/deep-knowledge/solana/helius/helius-cli-commands.md` | helius, cli, commands, reference | escalate | you need the command-family lookup for the Helius CLI |
| `src/ai/brain/knowledge/deep-knowledge/solana/helius/helius-cli-readme.md` | helius, cli, examples, readme | specialized | you want upstream CLI repo examples or to cross-check docs against the README |
| `src/ai/brain/knowledge/deep-knowledge/solana/helius/helius-cli.md` | helius, cli, onboarding, commands | escalate | Helius CLI install, signup, config, or shell-automation details are needed |
| `src/ai/brain/knowledge/deep-knowledge/solana/helius/helius-docs-llms-full.md` | helius, docs-index, discovery | specialized | you need broad Helius doc discovery across multiple product areas |
| `src/ai/brain/knowledge/deep-knowledge/solana/helius/helius-typescript-sdk.md` | helius, typescript, sdk | escalate | TypeScript SDK method shapes, examples, or client behavior are needed |
| `src/ai/brain/knowledge/deep-knowledge/solana/helius/helius.md` | helius, rpc, das, sdk | escalate | Helius API or SDK details exceed the short ops guide |

## Skill Packs

| path | refs | topics | read when |
| --- | --- | --- | --- |
| `src/ai/brain/knowledge/skills/agent-browser/SKILL.md` | 7 | browser, automation, auth, snapshots | browser automation, authenticated sessions, profiling, or web capture work is requested |
| `src/ai/brain/knowledge/skills/helius-dflow/SKILL.md` | 12 | helius, dflow, trading, websockets | DFlow market integrations or combined Helius+DFlow flows are requested |
| `src/ai/brain/knowledge/skills/helius-phantom/SKILL.md` | 16 | helius, phantom, wallet, frontend | Phantom wallet integrations, frontend flows, or wallet app patterns are requested |
| `src/ai/brain/knowledge/skills/helius/SKILL.md` | 10 | helius, rpc, das, sender | Helius API, SDK, onboarding, webhooks, or RPC workflows are requested |
| `src/ai/brain/knowledge/skills/svm/SKILL.md` | 10 | solana, svm, programs, transactions | Solana VM architecture, execution, or low-level protocol topics are requested |

## Support Files

| path | kind | read when |
| --- | --- | --- |
| `src/ai/brain/knowledge/skills/helius-docs-llms.txt` | skill-support | you need a raw Helius docs index snapshot to find deeper docs quickly |

## Directory Tree

```text
knowledge/
|-- deep-knowledge/
|   |-- ai-and-runtime/
|   |   |-- bun-secrets-docs.md
|   |   |-- bun-shell-docs.md
|   |   |-- bun-sqlite-docs.md
|   |   `-- data-structures-as-json.md
|   `-- solana/
|       |-- dexscreener/
|       |   |-- api-reference.md
|       |   `-- data-retreival-docs.md
|       `-- helius/
|           |-- helius-agents-llms.md
|           |-- helius-cli-commands.md
|           |-- helius-cli-readme.md
|           |-- helius-cli.md
|           |-- helius-docs-llms-full.md
|           |-- helius-typescript-sdk.md
|           `-- helius.md
|-- skills/
|   |-- agent-browser/
|   |   |-- references/
|   |   |   |-- authentication.md
|   |   |   |-- commands.md
|   |   |   |-- profiling.md
|   |   |   |-- proxy-support.md
|   |   |   |-- session-management.md
|   |   |   |-- snapshot-refs.md
|   |   |   `-- video-recording.md
|   |   |-- templates/
|   |   |   |-- authenticated-session.sh
|   |   |   |-- capture-workflow.sh
|   |   |   `-- form-automation.sh
|   |   `-- SKILL.md
|   |-- helius/
|   |   |-- references/
|   |   |   |-- cli.md
|   |   |   |-- das.md
|   |   |   |-- enhanced-transactions.md
|   |   |   |-- laserstream.md
|   |   |   |-- onboarding.md
|   |   |   |-- priority-fees.md
|   |   |   |-- sender.md
|   |   |   |-- wallet-api.md
|   |   |   |-- webhooks.md
|   |   |   `-- websockets.md
|   |   |-- install.sh
|   |   `-- SKILL.md
|   |-- helius-dflow/
|   |   |-- references/
|   |   |   |-- dflow-prediction-markets.md
|   |   |   |-- dflow-proof-kyc.md
|   |   |   |-- dflow-spot-trading.md
|   |   |   |-- dflow-websockets.md
|   |   |   |-- helius-das.md
|   |   |   |-- helius-laserstream.md
|   |   |   |-- helius-onboarding.md
|   |   |   |-- helius-priority-fees.md
|   |   |   |-- helius-sender.md
|   |   |   |-- helius-wallet-api.md
|   |   |   |-- helius-websockets.md
|   |   |   `-- integration-patterns.md
|   |   |-- install.sh
|   |   `-- SKILL.md
|   |-- helius-phantom/
|   |   |-- references/
|   |   |   |-- browser-sdk.md
|   |   |   |-- frontend-security.md
|   |   |   |-- helius-das.md
|   |   |   |-- helius-enhanced-transactions.md
|   |   |   |-- helius-onboarding.md
|   |   |   |-- helius-priority-fees.md
|   |   |   |-- helius-sender.md
|   |   |   |-- helius-wallet-api.md
|   |   |   |-- helius-websockets.md
|   |   |   |-- integration-patterns.md
|   |   |   |-- nft-minting.md
|   |   |   |-- payments.md
|   |   |   |-- react-native-sdk.md
|   |   |   |-- react-sdk.md
|   |   |   |-- token-gating.md
|   |   |   `-- transactions.md
|   |   |-- install.sh
|   |   `-- SKILL.md
|   |-- svm/
|   |   |-- references/
|   |   |   |-- accounts.md
|   |   |   |-- compilation.md
|   |   |   |-- consensus.md
|   |   |   |-- data.md
|   |   |   |-- development.md
|   |   |   |-- execution.md
|   |   |   |-- programs.md
|   |   |   |-- tokens.md
|   |   |   |-- transactions.md
|   |   |   `-- validators.md
|   |   |-- install.sh
|   |   `-- SKILL.md
|   |-- helius-docs-llms.txt
|   `-- skills-lock.json
|-- bash-tool.md
|-- helius-agents.md
|-- KNOWLEDGE_MANIFEST.md
|-- runtime-reference.md
|-- settings-reference.md
|-- solana-cli.md
|-- solanacli-file-system-wallet.md
`-- wallet-reference.md
```
