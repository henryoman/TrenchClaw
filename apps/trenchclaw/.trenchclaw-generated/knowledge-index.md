# Knowledge Index

Generated at: 2026-03-19T20:16:35.068Z
Root: src/ai/brain/knowledge

Use this index to see what knowledge exists before opening any specific file.

## Routing Rules

- Treat the live runtime contract, enabled tool allowlist, release readiness, and resolved settings as higher authority than docs.
- Start with repo-authored reference docs for runtime, settings, wallet, and workspace behavior.
- Use repo-authored guides for local workflows, command patterns, and integration shortcuts.
- Escalate to deep vendor references only when exact API/provider detail is required.
- Use skill packs when the task clearly matches a skill workflow; the `SKILL.md` file is the entry point.

## Core Docs

| path | title | kind | priority | read when |
| --- | --- | --- | --- | --- |
| `src/ai/brain/knowledge/bash-tool-docs.md` | Bash Tool Docs | guide | read-second | the task matches this topic and the smaller reference docs do not fully answer it |
| `src/ai/brain/knowledge/helius-cli-docs.md` | Helius Cli Docs | guide | read-second | the task matches this topic and the smaller reference docs do not fully answer it |
| `src/ai/brain/knowledge/runtime-reference.md` | Runtime Reference | reference | read-first | runtime architecture, bootstrap flow, capability exposure, or state-root questions |
| `src/ai/brain/knowledge/settings-reference.md` | Settings Reference | reference | read-first | provider selection, settings ownership, overlay order, or vault lookup questions |
| `src/ai/brain/knowledge/solana-cli-docs.md` | Solana Cli Docs | guide | read-second | the task matches this topic and the smaller reference docs do not fully answer it |
| `src/ai/brain/knowledge/solana-cli-filesystem-wallet-docs.md` | Solana Cli Filesystem Wallet Docs | guide | read-second | the task matches this topic and the smaller reference docs do not fully answer it |
| `src/ai/brain/knowledge/wallet-reference.md` | Wallet Reference | reference | read-first | wallet organization, key material handling, or signing-path questions |

## Deep References

| path | title | topics | read when |
| --- | --- | --- | --- |
| `src/ai/brain/knowledge/deep-knowledge/ai-and-runtime/bun-secrets-docs.md` | Bun Secrets Reference | bun, secrets, env, runtime | Bun secrets API details are needed beyond the repo-authored short references |
| `src/ai/brain/knowledge/deep-knowledge/ai-and-runtime/bun-shell-docs.md` | Bun Shell Reference | bun, shell, cli, scripts | Bun shell syntax, escaping, streaming, or command-behavior details are needed |
| `src/ai/brain/knowledge/deep-knowledge/ai-and-runtime/bun-sqlite-docs.md` | Bun SQLite Reference | bun, sqlite, database, sql | Bun SQLite APIs, transactions, prepared statements, or schema details are needed |
| `src/ai/brain/knowledge/deep-knowledge/ai-and-runtime/data-structures-as-json.md` | Data Structures as JSON | json, data-structures, serialization | JSON serialization behavior or data-shape conversion details are needed |
| `src/ai/brain/knowledge/deep-knowledge/solana/dexscreener/api-reference.md` | Dexscreener API Reference | dexscreener, api, market-data | Dexscreener endpoints, parameters, or response-shape details are needed |
| `src/ai/brain/knowledge/deep-knowledge/solana/dexscreener/data-retreival-docs.md` | Dexscreener Data Retrieval Guide | dexscreener, actions, market-data | Dexscreener request flows, action patterns, or data retrieval details are needed |
| `src/ai/brain/knowledge/deep-knowledge/solana/helius/helius-agents-llms.md` | Helius Agents Docs Index | helius, agents, docs-index | you need to discover which Helius agents docs pages exist before opening a deeper reference |
| `src/ai/brain/knowledge/deep-knowledge/solana/helius/helius-cli-commands.md` | Helius CLI Commands | helius, cli, commands, reference | you need the command-family lookup for the Helius CLI |
| `src/ai/brain/knowledge/deep-knowledge/solana/helius/helius-cli-readme.md` | Helius CLI README | helius, cli, examples, readme | you want upstream CLI repo examples or to cross-check docs against the README |
| `src/ai/brain/knowledge/deep-knowledge/solana/helius/helius-cli.md` | Helius CLI Guide | helius, cli, onboarding, commands | Helius CLI install, signup, config, or shell-automation details are needed |
| `src/ai/brain/knowledge/deep-knowledge/solana/helius/helius-docs-llms-full.md` | Helius Full Docs Index | helius, docs-index, discovery | you need broad Helius doc discovery across multiple product areas |
| `src/ai/brain/knowledge/deep-knowledge/solana/helius/helius-typescript-sdk.md` | Helius TypeScript SDK | helius, typescript, sdk | TypeScript SDK method shapes, examples, or client behavior are needed |
| `src/ai/brain/knowledge/deep-knowledge/solana/helius/helius.md` | Helius Reference | helius, rpc, das, sdk | Helius API or SDK details exceed the short ops guide |

## Skill Packs

| path | title | refs | topics | read when |
| --- | --- | --- | --- | --- |
| `src/ai/brain/knowledge/skills/agent-browser/SKILL.md` | Agent Browser Skill | 7 | browser, automation, auth, snapshots | browser automation, authenticated sessions, profiling, or web capture work is requested |
| `src/ai/brain/knowledge/skills/helius-dflow/SKILL.md` | Helius DFlow Skill | 12 | helius, dflow, trading, websockets | DFlow market integrations or combined Helius+DFlow flows are requested |
| `src/ai/brain/knowledge/skills/helius-phantom/SKILL.md` | Helius Phantom Skill | 16 | helius, phantom, wallet, frontend | Phantom wallet integrations, frontend flows, or wallet app patterns are requested |
| `src/ai/brain/knowledge/skills/helius/SKILL.md` | Helius Skill | 10 | helius, rpc, das, sender | Helius API, SDK, onboarding, webhooks, or RPC workflows are requested |
| `src/ai/brain/knowledge/skills/svm/SKILL.md` | SVM Skill | 10 | solana, svm, programs, transactions | Solana VM architecture, execution, or low-level protocol topics are requested |

## Support Files

| path | title | kind | read when |
| --- | --- | --- | --- |
| `src/ai/brain/knowledge/skills/helius-docs-llms.txt` | Helius Docs Index Snapshot | skill-support | you need a raw Helius docs index snapshot to find deeper docs quickly |

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
|-- bash-tool-docs.md
|-- helius-cli-docs.md
|-- KNOWLEDGE_MANIFEST.md
|-- runtime-reference.md
|-- settings-reference.md
|-- solana-cli-docs.md
|-- solana-cli-filesystem-wallet-docs.md
`-- wallet-reference.md
```
