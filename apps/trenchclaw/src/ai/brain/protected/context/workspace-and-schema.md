# Workspace Context Snapshot

Generated at: 2026-03-11T20:33:49.501Z
Root: apps/trenchclaw/

This file is generated. Refresh with:
`bun run context:refresh`

## Workspace Map (apps/trenchclaw/)
```text
# WORKSPACE ROOT: apps/trenchclaw/
apps/trenchclaw/
|-- src/
|   |-- ai/
|   |   |-- brain/
|   |   |   |-- db/
|   |   |   |   |-- .tests/
|   |   |   |   |   `-- memory-92446690-a66f-490d-b282-76cf88adab1d/
|   |   |   |   |       `-- memory/
|   |   |   |   |           `-- MEMORY.md
|   |   |   |   |-- memory/
|   |   |   |   |   |-- 2026-03-02.md
|   |   |   |   |   |-- 2026-03-03.md
|   |   |   |   |   |-- 2026-03-04.md
|   |   |   |   |   |-- 2026-03-05.md
|   |   |   |   |   |-- 2026-03-07.md
|   |   |   |   |   |-- 2026-03-08.md
|   |   |   |   |   |-- 2026-03-09.md
|   |   |   |   |   |-- 2026-03-10.md
|   |   |   |   |   |-- 2026-03-11.md
|   |   |   |   |   `-- MEMORY.md
|   |   |   |   |-- queue/
|   |   |   |   |   |-- bunqueue.sqlite
|   |   |   |   |   |-- bunqueue.sqlite-shm
|   |   |   |   |   `-- bunqueue.sqlite-wal
|   |   |   |   |-- sessions/
|   |   |   |   |   |-- .keep
|   |   |   |   |   |-- 8cf7109f-a009-4e26-87c1-61a21f166932.jsonl
|   |   |   |   |   `-- sessions.json
|   |   |   |   |-- summaries/
|   |   |   |   |   |-- .keep
|   |   |   |   |   `-- 8cf7109f-a009-4e26-87c1-61a21f166932.md
|   |   |   |   |-- summary/
|   |   |   |   |   |-- .keep
|   |   |   |   |   |-- 2026-03-02.log
|   |   |   |   |   |-- 2026-03-03.log
|   |   |   |   |   |-- 2026-03-04.log
|   |   |   |   |   |-- 2026-03-05.log
|   |   |   |   |   |-- 2026-03-07.log
|   |   |   |   |   |-- 2026-03-08.log
|   |   |   |   |   |-- 2026-03-09.log
|   |   |   |   |   |-- 2026-03-10.log
|   |   |   |   |   `-- 2026-03-11.log
|   |   |   |   |-- system/
|   |   |   |   |   |-- .keep
|   |   |   |   |   |-- 2026-03-02.log
|   |   |   |   |   |-- 2026-03-03.log
|   |   |   |   |   |-- 2026-03-04.log
|   |   |   |   |   |-- 2026-03-05.log
|   |   |   |   |   |-- 2026-03-07.log
|   |   |   |   |   |-- 2026-03-08.log
|   |   |   |   |   |-- 2026-03-09.log
|   |   |   |   |   |-- 2026-03-10.log
|   |   |   |   |   `-- 2026-03-11.log
|   |   |   |   |-- .gitignore
|   |   |   |   |-- README.md
|   |   |   |   |-- runtime.sqlite
|   |   |   |   |-- runtime.sqlite-shm
|   |   |   |   |-- runtime.sqlite-wal
|   |   |   |   |-- trenchclaw-chat-runtime-01fd27c0-fa31-4fac-8332-f7b8bb389494.db-wal
|   |   |   |   |-- trenchclaw-chat-runtime-a30c7ad9-3767-405e-b130-48f920e7a6e3.db
|   |   |   |   |-- trenchclaw-chat-runtime-a30c7ad9-3767-405e-b130-48f920e7a6e3.db-shm
|   |   |   |   `-- trenchclaw-chat-runtime-a30c7ad9-3767-405e-b130-48f920e7a6e3.db-wal
|   |   |   |-- instance-blockchain-settings/
|   |   |   |   |-- alerts.yaml
|   |   |   |   |-- settings.yaml
|   |   |   |   `-- swaps.yaml
|   |   |   |-- knowledge/
|   |   |   |   |-- deep-knowledge/
|   |   |   |   |   |-- dexscreener/
|   |   |   |   |   |   |-- dexscreener-actions.md
|   |   |   |   |   |   `-- dexscreener-api-reference.md
|   |   |   |   |   |-- bun-secrets-docs.md
|   |   |   |   |   |-- bun-shell-docs.md
|   |   |   |   |   |-- bun-sqlite-docs.md
|   |   |   |   |   |-- data-structures-as-json.md
|   |   |   |   |   |-- helius-agents-llms.md
|   |   |   |   |   |-- helius-docs-llms-full.md
|   |   |   |   |   |-- helius-typescript-sdk.md
|   |   |   |   |   `-- helius.md
|   |   |   |   |-- skills/
|   |   |   |   |   |-- agent-browser/
|   |   |   |   |   |   |-- references/
|   |   |   |   |   |   |   |-- authentication.md
|   |   |   |   |   |   |   |-- commands.md
|   |   |   |   |   |   |   |-- profiling.md
|   |   |   |   |   |   |   |-- proxy-support.md
|   |   |   |   |   |   |   |-- session-management.md
|   |   |   |   |   |   |   |-- snapshot-refs.md
|   |   |   |   |   |   |   `-- video-recording.md
|   |   |   |   |   |   |-- templates/
|   |   |   |   |   |   |   |-- authenticated-session.sh
|   |   |   |   |   |   |   |-- capture-workflow.sh
|   |   |   |   |   |   |   `-- form-automation.sh
|   |   |   |   |   |   `-- SKILL.md
|   |   |   |   |   |-- helius/
|   |   |   |   |   |   |-- references/
|   |   |   |   |   |   |   |-- das.md
|   |   |   |   |   |   |   |-- enhanced-transactions.md
|   |   |   |   |   |   |   |-- laserstream.md
|   |   |   |   |   |   |   |-- onboarding.md
|   |   |   |   |   |   |   |-- priority-fees.md
|   |   |   |   |   |   |   |-- sender.md
|   |   |   |   |   |   |   |-- wallet-api.md
|   |   |   |   |   |   |   |-- webhooks.md
|   |   |   |   |   |   |   `-- websockets.md
|   |   |   |   |   |   |-- install.sh
|   |   |   |   |   |   `-- SKILL.md
|   |   |   |   |   |-- helius-dflow/
|   |   |   |   |   |   |-- references/
|   |   |   |   |   |   |   |-- dflow-prediction-markets.md
|   |   |   |   |   |   |   |-- dflow-proof-kyc.md
|   |   |   |   |   |   |   |-- dflow-spot-trading.md
|   |   |   |   |   |   |   |-- dflow-websockets.md
|   |   |   |   |   |   |   |-- helius-das.md
|   |   |   |   |   |   |   |-- helius-laserstream.md
|   |   |   |   |   |   |   |-- helius-onboarding.md
|   |   |   |   |   |   |   |-- helius-priority-fees.md
|   |   |   |   |   |   |   |-- helius-sender.md
|   |   |   |   |   |   |   |-- helius-wallet-api.md
|   |   |   |   |   |   |   |-- helius-websockets.md
|   |   |   |   |   |   |   `-- integration-patterns.md
|   |   |   |   |   |   |-- install.sh
|   |   |   |   |   |   `-- SKILL.md
|   |   |   |   |   |-- helius-phantom/
|   |   |   |   |   |   |-- references/
|   |   |   |   |   |   |   |-- browser-sdk.md
|   |   |   |   |   |   |   |-- frontend-security.md
|   |   |   |   |   |   |   |-- helius-das.md
|   |   |   |   |   |   |   |-- helius-enhanced-transactions.md
|   |   |   |   |   |   |   |-- helius-onboarding.md
|   |   |   |   |   |   |   |-- helius-priority-fees.md
|   |   |   |   |   |   |   |-- helius-sender.md
|   |   |   |   |   |   |   |-- helius-wallet-api.md
|   |   |   |   |   |   |   |-- helius-websockets.md
|   |   |   |   |   |   |   |-- integration-patterns.md
|   |   |   |   |   |   |   |-- nft-minting.md
|   |   |   |   |   |   |   |-- payments.md
|   |   |   |   |   |   |   |-- react-native-sdk.md
|   |   |   |   |   |   |   |-- react-sdk.md
|   |   |   |   |   |   |   |-- token-gating.md
|   |   |   |   |   |   |   `-- transactions.md
|   |   |   |   |   |   |-- install.sh
|   |   |   |   |   |   `-- SKILL.md
|   |   |   |   |   |-- svm/
|   |   |   |   |   |   |-- references/
|   |   |   |   |   |   |   |-- accounts.md
|   |   |   |   |   |   |   |-- compilation.md
|   |   |   |   |   |   |   |-- consensus.md
|   |   |   |   |   |   |   |-- data.md
|   |   |   |   |   |   |   |-- development.md
|   |   |   |   |   |   |   |-- execution.md
|   |   |   |   |   |   |   |-- programs.md
|   |   |   |   |   |   |   |-- tokens.md
|   |   |   |   |   |   |   |-- transactions.md
|   |   |   |   |   |   |   `-- validators.md
|   |   |   |   |   |   |-- install.sh
|   |   |   |   |   |   `-- SKILL.md
|   |   |   |   |   |-- helius-docs-llms.txt
|   |   |   |   |   `-- skills-lock.json
|   |   |   |   |-- bash-tool.md
|   |   |   |   |-- file-system-wallet.md
|   |   |   |   |-- helius-agents.md
|   |   |   |   |-- KNOWLEDGE_MANIFEST.md
|   |   |   |   `-- knowledge-tree.ts
|   |   |   |-- protected/
|   |   |   |   |-- agent-modes/
|   |   |   |   |   |-- operator.md
|   |   |   |   |   `-- summarize-and-extract.md
|   |   |   |   |-- context/
|   |   |   |   |   `-- workspace-and-schema.md
|   |   |   |   |-- instance/
|   |   |   |   |   |-- i-01/
|   |   |   |   |   |   |-- keypairs/
|   |   |   |   |   |   |   `-- practice-wallets/
|   |   |   |   |   |   |       |-- practice001-0001.json
|   |   |   |   |   |   |       |-- practice001-0001.label.json
|   |   |   |   |   |   |       |-- practice002-0002.json
|   |   |   |   |   |   |       `-- practice002-0002.label.json
|   |   |   |   |   |   `-- wallet-library.jsonl
|   |   |   |   |   |-- i-debug-wallets/
|   |   |   |   |   |   `-- keypairs/
|   |   |   |   |   |       `-- core_debug_group/
|   |   |   |   |   `-- i-test-wallet-groups/
|   |   |   |   |       `-- keypairs/
|   |   |   |   |-- no-read/
|   |   |   |   |   |-- .gitkeep
|   |   |   |   |   |-- ai.json
|   |   |   |   |   |-- README.md
|   |   |   |   |   |-- vault.json
|   |   |   |   |   `-- vault.template.json
|   |   |   |   |-- system/
|   |   |   |   |   |-- modes/
|   |   |   |   |   |   `-- operator.md
|   |   |   |   |   |-- safety-modes/
|   |   |   |   |   |   |-- dangerous.yaml
|   |   |   |   |   |   |-- safe.yaml
|   |   |   |   |   |   `-- veryDangerous.yaml
|   |   |   |   |   |-- filesystem-manifest.yaml
|   |   |   |   |   |-- INSTRUCTIONS.md
|   |   |   |   |   |-- payload-manifest.yaml
|   |   |   |   |   `-- system.md
|   |   |   |   `-- wallet-library.jsonl
|   |   |   |-- workspace/
|   |   |   |   |-- .tests/
|   |   |   |   |-- configs/
|   |   |   |   |-- notes/
|   |   |   |   |-- output/
|   |   |   |   |-- routines/
|   |   |   |   |   `-- example.routine.json
|   |   |   |   |-- scratch/
|   |   |   |   |-- strategies/
|   |   |   |   |   `-- .tests/
|   |   |   |   |-- typescript/
|   |   |   |   `-- routineRegistry.json
|   |   |   |-- rules.md
|   |   |   `-- soul.md
|   |   |-- core/
|   |   |   |-- action-registry.ts
|   |   |   |-- dispatcher.ts
|   |   |   |-- event-bus.ts
|   |   |   |-- index.ts
|   |   |   |-- policy-engine.ts
|   |   |   |-- scheduler.ts
|   |   |   `-- state-store.ts
|   |   |-- llm/
|   |   |   |-- client.ts
|   |   |   |-- config.ts
|   |   |   |-- index.ts
|   |   |   |-- prompt-loader.ts
|   |   |   |-- prompt-manifest.ts
|   |   |   |-- shared.ts
|   |   |   |-- types.ts
|   |   |   |-- user-settings-loader.ts
|   |   |   |-- vault-file.ts
|   |   |   `-- workspace-map.ts
|   |   |-- runtime/
|   |   |   |-- types/
|   |   |   |   |-- action.ts
|   |   |   |   |-- context.ts
|   |   |   |   |-- events.ts
|   |   |   |   |-- index.ts
|   |   |   |   |-- policy.ts
|   |   |   |   |-- scheduler.ts
|   |   |   |   `-- state.ts
|   |   |   `-- index.ts
|   |   |-- tools/
|   |   |   |-- catalog.ts
|   |   |   |-- chat-tools.ts
|   |   |   `-- index.ts
|   |   |-- index.ts
|   |   `-- README.md
|   |-- lib/
|   |   |-- agent-scripts/
|   |   |   |-- clean-runtime-artifacts.ts
|   |   |   |-- refresh-knowledge-manifest.ts
|   |   |   `-- refresh-workspace-context.ts
|   |   `-- commands.txt
|   |-- runtime/
|   |   |-- capabilities/
|   |   |   |-- action-definitions.ts
|   |   |   |-- index.ts
|   |   |   |-- selectors.ts
|   |   |   |-- snapshot.ts
|   |   |   |-- types.ts
|   |   |   `-- workspace-tool-definitions.ts
|   |   |-- gui-transport/
|   |   |   |-- domains/
|   |   |   |   |-- chat.ts
|   |   |   |   |-- instances.ts
|   |   |   |   |-- llm-check.ts
|   |   |   |   |-- runtime-panels.ts
|   |   |   |   |-- tests.ts
|   |   |   |   |-- vault-secrets.ts
|   |   |   |   `-- wallets.ts
|   |   |   |-- constants.ts
|   |   |   |-- contracts.ts
|   |   |   |-- parsers.ts
|   |   |   |-- router.ts
|   |   |   `-- runtime-gui-transport.ts
|   |   |-- load/
|   |   |   |-- authority.ts
|   |   |   |-- index.ts
|   |   |   |-- loader.ts
|   |   |   `-- schema.ts
|   |   |-- logging/
|   |   |   |-- index.ts
|   |   |   `-- runtime-logger.ts
|   |   |-- security/
|   |   |   |-- filesystem-manifest.ts
|   |   |   `-- write-scope.ts
|   |   |-- storage/
|   |   |   |-- index.ts
|   |   |   |-- log-io-worker.ts
|   |   |   |-- log-io.worker.ts
|   |   |   |-- memory-log-store.ts
|   |   |   |-- README.md
|   |   |   |-- schema.ts
|   |   |   |-- session-log-store.ts
|   |   |   |-- session-summary-store.ts
|   |   |   |-- sqlite-orm.ts
|   |   |   |-- sqlite-schema.ts
|   |   |   |-- sqlite-state-store.ts
|   |   |   |-- summary-log-store.ts
|   |   |   `-- system-log-store.ts
|   |   |-- bootstrap.ts
|   |   |-- chat.ts
|   |   |-- gui-transport.ts
|   |   |-- index.ts
|   |   |-- instance-state.ts
|   |   |-- runtime-paths.ts
|   |   |-- start-runtime-server.ts
|   |   |-- wallet-model-context.ts
|   |   `-- workspace-bash.ts
|   |-- solana/
|   |   |-- actions/
|   |   |   |-- agentic-signup/
|   |   |   |   `-- helius.ts
|   |   |   |-- data-fetch/
|   |   |   |   |-- alerts/
|   |   |   |   |   |-- createBlockchainAlert.ts
|   |   |   |   |   `-- index.ts
|   |   |   |   |-- api/
|   |   |   |   |   |-- dexscreener-actions.ts
|   |   |   |   |   |-- dexscreener.ts
|   |   |   |   |   `-- swapHistory.ts
|   |   |   |   |-- rpc/
|   |   |   |   |   |-- getAccountInfo.ts
|   |   |   |   |   |-- getBalance.ts
|   |   |   |   |   |-- getMarketData.ts
|   |   |   |   |   |-- getMultipleAccounts.ts
|   |   |   |   |   |-- getTokenMetadata.ts
|   |   |   |   |   |-- getTokenPrice.ts
|   |   |   |   |   `-- shared.ts
|   |   |   |   |-- runtime/
|   |   |   |   |   |-- enqueueRuntimeJob.ts
|   |   |   |   |   |-- index.ts
|   |   |   |   |   |-- instance-memory-shared.ts
|   |   |   |   |   |-- manageRuntimeJob.ts
|   |   |   |   |   |-- mutateInstanceMemory.ts
|   |   |   |   |   |-- pingRuntime.ts
|   |   |   |   |   |-- queryInstanceMemory.ts
|   |   |   |   |   |-- queryRuntimeStore.ts
|   |   |   |   |   |-- sleep.ts
|   |   |   |   |   `-- upsertInstanceFact.ts
|   |   |   |   `-- index.ts
|   |   |   |-- devnet/
|   |   |   |   `-- airdrop.ts
|   |   |   |-- wallet-based/
|   |   |   |   |-- airdrop/
|   |   |   |   |   `-- devnetAirdrop.ts
|   |   |   |   |-- create-wallets/
|   |   |   |   |   |-- create-vanity-wallet.sh
|   |   |   |   |   |-- create-vanity-wallet.ts
|   |   |   |   |   |-- createWalletGroupDirectory.ts
|   |   |   |   |   |-- createWallets.ts
|   |   |   |   |   |-- index.ts
|   |   |   |   |   |-- renameWallets.ts
|   |   |   |   |   `-- wallet-storage.ts
|   |   |   |   |-- read-only/
|   |   |   |   |   |-- checkBalance.ts
|   |   |   |   |   |-- checkSolBalance.ts
|   |   |   |   |   |-- getWalletState.ts
|   |   |   |   |   `-- index.ts
|   |   |   |   |-- swap/
|   |   |   |   |   |-- rpc/
|   |   |   |   |   |   |-- executeSwap.ts
|   |   |   |   |   |   |-- index.ts
|   |   |   |   |   |   `-- quoteSwap.ts
|   |   |   |   |   |-- ultra/
|   |   |   |   |   |   |-- confirmationTracker.ts
|   |   |   |   |   |   |-- executeSwap.ts
|   |   |   |   |   |   |-- index.ts
|   |   |   |   |   |   |-- managedSwap.ts
|   |   |   |   |   |   |-- quoteSwap.ts
|   |   |   |   |   |   |-- shared.ts
|   |   |   |   |   |   `-- swap.ts
|   |   |   |   |   `-- index.ts
|   |   |   |   |-- token/
|   |   |   |   |   `-- mint/
|   |   |   |   |       `-- createToken.ts
|   |   |   |   |-- transfer/
|   |   |   |   |   |-- index.ts
|   |   |   |   |   |-- privacyCash.ts
|   |   |   |   |   `-- transfer.ts
|   |   |   |   `-- index.ts
|   |   |   `-- index.ts
|   |   |-- devnet/
|   |   |   `-- airdrop.ts
|   |   |-- lib/
|   |   |   |-- adapters/
|   |   |   |   |-- index.ts
|   |   |   |   |-- jupiter-ultra.ts
|   |   |   |   |-- jupiter.ts
|   |   |   |   |-- rpc-pool.ts
|   |   |   |   |-- token-account.ts
|   |   |   |   `-- ultra-signer.ts
|   |   |   |-- rpc/
|   |   |   |   `-- urls.ts
|   |   |   |-- ultra/
|   |   |   |   `-- parsing.ts
|   |   |   `-- wallet/
|   |   |       |-- encryption.ts
|   |   |       |-- hd-derivation.ts
|   |   |       |-- index.ts
|   |   |       |-- protected-write-policy.ts
|   |   |       |-- wallet-manager.ts
|   |   |       |-- wallet-policy.ts
|   |   |       |-- wallet-signer.ts
|   |   |       |-- wallet-store.ts
|   |   |       `-- wallet-types.ts
|   |   |-- routines/
|   |   |   |-- action-sequence.ts
|   |   |   |-- create-wallets.ts
|   |   |   |-- execute.ts
|   |   |   |-- load.ts
|   |   |   `-- routines.json
|   |   |-- triggers/
|   |   |   |-- index.ts
|   |   |   |-- on-chain.ts
|   |   |   |-- price.ts
|   |   |   `-- timer.ts
|   |   `-- index.ts
|   `-- index.ts
|-- types/
|   `-- index.ts
|-- .gitignore
|-- package.json
|-- README.md
`-- tsconfig.json
```

Omitted generated/vendor directories: node_modules, .vite, .next, .turbo, .svelte-kit, dist, build, coverage

## Runtime Action Catalog (Generated)
| actionName | category | subcategory | enabledBySettings | chatExposed | requiresConfirmation | inputSchema | outputSchema |
| --- | --- | --- | --- | --- | --- | --- | --- |
| createBlockchainAlert | data-based | read-only | yes | yes | no | yes | no |
| createWalletGroupDirectory | wallet-based |  | yes | yes | no | yes | no |
| createWallets | wallet-based |  | yes | yes | no | yes | no |
| devnetAirdrop | wallet-based |  | yes | yes | no | yes | no |
| enqueueRuntimeJob | data-based |  | yes | yes | no | yes | no |
| getDexscreenerLatestAds | data-based |  | yes | yes | no | yes | no |
| getDexscreenerLatestCommunityTakeovers | data-based |  | yes | yes | no | yes | no |
| getDexscreenerLatestTokenBoosts | data-based |  | yes | yes | no | yes | no |
| getDexscreenerLatestTokenProfiles | data-based |  | yes | yes | no | yes | no |
| getDexscreenerOrdersByToken | data-based |  | yes | yes | no | yes | no |
| getDexscreenerPairByChainAndPairId | data-based |  | yes | yes | no | yes | no |
| getDexscreenerTokenPairsByChain | data-based |  | yes | yes | no | yes | no |
| getDexscreenerTokensByChain | data-based |  | yes | yes | no | yes | no |
| getDexscreenerTopTokenBoosts | data-based |  | yes | yes | no | yes | no |
| getSwapHistory | data-based |  | yes | yes | no | yes | no |
| manageRuntimeJob | data-based |  | yes | yes | no | yes | no |
| mutateInstanceMemory | data-based |  | yes | yes | no | yes | no |
| pingRuntime | data-based | read-only | yes | yes | no | yes | no |
| privacyAirdrop | wallet-based | transfer | yes | yes | yes | yes | no |
| privacyTransfer | wallet-based | transfer | yes | yes | yes | yes | no |
| queryInstanceMemory | data-based | read-only | yes | yes | no | yes | no |
| queryRuntimeStore | data-based | read-only | yes | yes | no | yes | no |
| renameWallets | wallet-based |  | yes | yes | no | yes | no |
| searchDexscreenerPairs | data-based |  | yes | yes | no | yes | no |
| sleep | data-based |  | yes | yes | no | yes | no |
| transfer | wallet-based | transfer | yes | yes | yes | yes | no |

## Runtime Chat Tool Catalog (Generated)
| toolName | kind | enabledBySettings | requiresConfirmation |
| --- | --- | --- | --- |
| createBlockchainAlert | action | yes | no |
| createWalletGroupDirectory | action | yes | no |
| createWallets | action | yes | no |
| devnetAirdrop | action | yes | no |
| enqueueRuntimeJob | action | yes | no |
| getDexscreenerLatestAds | action | yes | no |
| getDexscreenerLatestCommunityTakeovers | action | yes | no |
| getDexscreenerLatestTokenBoosts | action | yes | no |
| getDexscreenerLatestTokenProfiles | action | yes | no |
| getDexscreenerOrdersByToken | action | yes | no |
| getDexscreenerPairByChainAndPairId | action | yes | no |
| getDexscreenerTokenPairsByChain | action | yes | no |
| getDexscreenerTokensByChain | action | yes | no |
| getDexscreenerTopTokenBoosts | action | yes | no |
| getSwapHistory | action | yes | no |
| manageRuntimeJob | action | yes | no |
| mutateInstanceMemory | action | yes | no |
| pingRuntime | action | yes | no |
| privacyAirdrop | action | yes | yes |
| privacyTransfer | action | yes | yes |
| queryInstanceMemory | action | yes | no |
| queryRuntimeStore | action | yes | no |
| renameWallets | action | yes | no |
| searchDexscreenerPairs | action | yes | no |
| sleep | action | yes | no |
| transfer | action | yes | yes |
| workspaceBash | workspace-tool | yes | no |
| workspaceReadFile | workspace-tool | yes | no |
| workspaceWriteFile | workspace-tool | yes | no |

## GUI API Route Catalog (Generated)
| routePath |
| --- |
| /api/chat |
| /api/gui/activity |
| /api/gui/bootstrap |
| /api/gui/client-error |
| /api/gui/conversations |
| /api/gui/events |
| /api/gui/instances |
| /api/gui/instances/sign-in |
| /api/gui/llm/check |
| /api/gui/queue |
| /api/gui/schedule |
| /api/gui/secrets |
| /api/gui/tests/dispatcher |
| /api/gui/vault |
| /api/gui/wallets |
| /api/gui/wallets/download |
| /v1/chat/stream |
| /v1/chat/turn |
| /v1/health |
| /v1/runtime |

## SQLite Schema Snapshot
```text
SQLite schema snapshot (11 tables)
- schema_migrations: version:INTEGER[pk], applied_at:INTEGER[not_null]
- jobs: id:TEXT[pk], serial_number:INTEGER, bot_id:TEXT[not_null], routine_name:TEXT[not_null], status:TEXT[not_null], config_json:TEXT[not_null], next_run_at:INTEGER, last_run_at:INTEGER, cycles_completed:INTEGER[not_null], total_cycles:INTEGER, last_result_json:TEXT, attempt_count:INTEGER, lease_owner:TEXT, lease_expires_at:INTEGER, last_error:TEXT, created_at:INTEGER[not_null], updated_at:INTEGER[not_null]
- action_receipts: idempotency_key:TEXT[pk], payload_json:TEXT[not_null], timestamp:INTEGER[not_null]
- conversations: id:TEXT[pk], session_id:TEXT, title:TEXT, summary:TEXT, created_at:INTEGER[not_null], updated_at:INTEGER[not_null]
- chat_messages: id:TEXT[pk], conversation_id:TEXT[not_null,fk->conversations.id], role:TEXT[not_null], content:TEXT[not_null], metadata_json:TEXT, created_at:INTEGER[not_null]
- instance_profiles: instance_id:TEXT[pk], display_name:TEXT, summary:TEXT, trading_style:TEXT, risk_tolerance:TEXT, preferred_assets_json:TEXT, disliked_assets_json:TEXT, metadata_json:TEXT, created_at:INTEGER[not_null], updated_at:INTEGER[not_null]
- instance_facts: id:TEXT[pk], instance_id:TEXT[not_null], fact_key:TEXT[not_null], fact_value_json:TEXT[not_null], confidence:REAL[not_null], source:TEXT[not_null], source_message_id:TEXT, created_at:INTEGER[not_null], updated_at:INTEGER[not_null], expires_at:INTEGER
- market_instruments: id:INTEGER[pk], chain:TEXT[not_null], address:TEXT[not_null], symbol:TEXT, name:TEXT, decimals:INTEGER, created_at:INTEGER[not_null], updated_at:INTEGER[not_null]
- ohlcv_bars: instrument_id:INTEGER[not_null,fk->market_instruments.id], source:TEXT[not_null], interval:TEXT[not_null], open_time:INTEGER[not_null], close_time:INTEGER[not_null], open:REAL[not_null], high:REAL[not_null], low:REAL[not_null], close:REAL[not_null], volume:REAL, trades:INTEGER, vwap:REAL, fetched_at:INTEGER[not_null], raw_json:TEXT
- market_snapshots: id:TEXT[pk], instrument_id:INTEGER[not_null,fk->market_instruments.id], source:TEXT[not_null], snapshot_type:TEXT[not_null], data_json:TEXT[not_null], timestamp:INTEGER[not_null]
- http_cache: cache_key:TEXT[pk], source:TEXT[not_null], endpoint:TEXT[not_null], request_hash:TEXT[not_null], response_json:TEXT[not_null], status_code:INTEGER[not_null], etag:TEXT, last_modified:TEXT, fetched_at:INTEGER[not_null], expires_at:INTEGER
```

## SQLite SQL Schema Snapshot (Canonical)
```sql
CREATE TABLE "action_receipts" (
  "idempotency_key" TEXT PRIMARY KEY,
  "payload_json" TEXT NOT NULL,
  "timestamp" INTEGER NOT NULL
);

CREATE TABLE "chat_messages" (
  "id" TEXT PRIMARY KEY,
  "conversation_id" TEXT NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  "content" TEXT NOT NULL,
  "metadata_json" TEXT,
  "created_at" INTEGER NOT NULL
);

CREATE TABLE "conversations" (
  "id" TEXT PRIMARY KEY,
  "session_id" TEXT,
  "title" TEXT,
  "summary" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);

CREATE TABLE "http_cache" (
  "cache_key" TEXT PRIMARY KEY,
  "source" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "response_json" TEXT NOT NULL,
  "status_code" INTEGER NOT NULL,
  "etag" TEXT,
  "last_modified" TEXT,
  "fetched_at" INTEGER NOT NULL,
  "expires_at" INTEGER
);

CREATE TABLE "instance_facts" (
  "id" TEXT PRIMARY KEY,
  "instance_id" TEXT NOT NULL,
  "fact_key" TEXT NOT NULL,
  "fact_value_json" TEXT NOT NULL,
  "confidence" REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  "source" TEXT NOT NULL,
  "source_message_id" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "expires_at" INTEGER CHECK (expires_at IS NULL OR expires_at >= 0),
  UNIQUE(instance_id, fact_key)
);

CREATE TABLE "instance_profiles" (
  "instance_id" TEXT PRIMARY KEY,
  "display_name" TEXT,
  "summary" TEXT,
  "trading_style" TEXT,
  "risk_tolerance" TEXT,
  "preferred_assets_json" TEXT,
  "disliked_assets_json" TEXT,
  "metadata_json" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);

CREATE TABLE "jobs" (
  "id" TEXT PRIMARY KEY,
  "serial_number" INTEGER CHECK (serial_number IS NULL OR serial_number > 0),
  "bot_id" TEXT NOT NULL,
  "routine_name" TEXT NOT NULL,
  "status" TEXT NOT NULL CHECK (status IN ('pending', 'running', 'paused', 'stopped', 'failed')),
  "config_json" TEXT NOT NULL,
  "next_run_at" INTEGER,
  "last_run_at" INTEGER,
  "cycles_completed" INTEGER NOT NULL CHECK (cycles_completed >= 0),
  "total_cycles" INTEGER CHECK (total_cycles IS NULL OR total_cycles >= 0),
  "last_result_json" TEXT,
  "attempt_count" INTEGER CHECK (attempt_count IS NULL OR attempt_count >= 0),
  "lease_owner" TEXT,
  "lease_expires_at" INTEGER CHECK (lease_expires_at IS NULL OR lease_expires_at >= 0),
  "last_error" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);

CREATE TABLE "market_instruments" (
  "id" INTEGER PRIMARY KEY,
  "chain" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "symbol" TEXT,
  "name" TEXT,
  "decimals" INTEGER CHECK (decimals IS NULL OR decimals >= 0),
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  UNIQUE(chain, address)
);

CREATE TABLE "market_snapshots" (
  "id" TEXT PRIMARY KEY,
  "instrument_id" INTEGER NOT NULL REFERENCES "market_instruments"("id") ON DELETE CASCADE,
  "source" TEXT NOT NULL,
  "snapshot_type" TEXT NOT NULL,
  "data_json" TEXT NOT NULL,
  "timestamp" INTEGER NOT NULL
);

CREATE TABLE "ohlcv_bars" (
  "instrument_id" INTEGER NOT NULL REFERENCES "market_instruments"("id") ON DELETE CASCADE,
  "source" TEXT NOT NULL,
  "interval" TEXT NOT NULL,
  "open_time" INTEGER NOT NULL,
  "close_time" INTEGER NOT NULL,
  "open" REAL NOT NULL,
  "high" REAL NOT NULL,
  "low" REAL NOT NULL,
  "close" REAL NOT NULL,
  "volume" REAL,
  "trades" INTEGER,
  "vwap" REAL,
  "fetched_at" INTEGER NOT NULL,
  "raw_json" TEXT,
  PRIMARY KEY(instrument_id, source, interval, open_time)
);

CREATE TABLE "schema_migrations" (
  "version" INTEGER PRIMARY KEY,
  "applied_at" INTEGER NOT NULL
);

CREATE INDEX "idx_action_receipts_timestamp" ON "action_receipts"("timestamp");

CREATE INDEX "idx_chat_messages_conversation_created_at" ON "chat_messages"("conversation_id", "created_at");

CREATE INDEX "idx_conversations_updated_at" ON "conversations"("updated_at");

CREATE INDEX "idx_http_cache_expires_at" ON "http_cache"("expires_at");

CREATE INDEX "idx_http_cache_source_endpoint" ON "http_cache"("source", "endpoint");

CREATE INDEX "idx_instance_facts_expires_at" ON "instance_facts"("expires_at");

CREATE INDEX "idx_instance_facts_instance_updated" ON "instance_facts"("instance_id", "updated_at");

CREATE INDEX "idx_instance_profiles_updated_at" ON "instance_profiles"("updated_at");

CREATE INDEX "idx_jobs_bot_id_status" ON "jobs"("bot_id", "status");

CREATE INDEX "idx_jobs_lease_expires_at" ON "jobs"("status", "lease_expires_at");

CREATE UNIQUE INDEX "idx_jobs_serial_number" ON "jobs"("serial_number");

CREATE INDEX "idx_jobs_status_next_run_at" ON "jobs"("status", "next_run_at");

CREATE INDEX "idx_market_instruments_chain_symbol" ON "market_instruments"("chain", "symbol");

CREATE INDEX "idx_market_snapshots_lookup" ON "market_snapshots"("instrument_id", "source", "snapshot_type", "timestamp");

CREATE INDEX "idx_ohlcv_fetched_at" ON "ohlcv_bars"("fetched_at");

CREATE INDEX "idx_ohlcv_lookup" ON "ohlcv_bars"("instrument_id", "source", "interval", "open_time");
```

## SQLite SQL Schema Snapshot (Live DB)
Source DB: `/Volumes/T9/cursor/TrenchClaw/apps/trenchclaw/src/ai/brain/db/runtime.sqlite`
```sql
CREATE TABLE "action_receipts" (
  "idempotency_key" TEXT PRIMARY KEY,
  "payload_json" TEXT NOT NULL,
  "timestamp" INTEGER NOT NULL
);

CREATE TABLE "chat_messages" (
  "id" TEXT PRIMARY KEY,
  "conversation_id" TEXT NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  "content" TEXT NOT NULL,
  "metadata_json" TEXT,
  "created_at" INTEGER NOT NULL
);

CREATE TABLE "conversations" (
  "id" TEXT PRIMARY KEY,
  "session_id" TEXT,
  "title" TEXT,
  "summary" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);

CREATE TABLE "http_cache" (
  "cache_key" TEXT PRIMARY KEY,
  "source" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "response_json" TEXT NOT NULL,
  "status_code" INTEGER NOT NULL,
  "etag" TEXT,
  "last_modified" TEXT,
  "fetched_at" INTEGER NOT NULL,
  "expires_at" INTEGER
);

CREATE TABLE "instance_facts" (
  "id" TEXT PRIMARY KEY,
  "instance_id" TEXT NOT NULL,
  "fact_key" TEXT NOT NULL,
  "fact_value_json" TEXT NOT NULL,
  "confidence" REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  "source" TEXT NOT NULL,
  "source_message_id" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "expires_at" INTEGER CHECK (expires_at IS NULL OR expires_at >= 0),
  UNIQUE(instance_id, fact_key)
);

CREATE TABLE "instance_profiles" (
  "instance_id" TEXT PRIMARY KEY,
  "display_name" TEXT,
  "summary" TEXT,
  "trading_style" TEXT,
  "risk_tolerance" TEXT,
  "preferred_assets_json" TEXT,
  "disliked_assets_json" TEXT,
  "metadata_json" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);

CREATE TABLE "jobs" (
  "id" TEXT PRIMARY KEY,
  "bot_id" TEXT NOT NULL,
  "routine_name" TEXT NOT NULL,
  "status" TEXT NOT NULL CHECK (status IN ('pending', 'running', 'paused', 'stopped', 'failed')),
  "config_json" TEXT NOT NULL,
  "next_run_at" INTEGER,
  "last_run_at" INTEGER,
  "cycles_completed" INTEGER NOT NULL CHECK (cycles_completed >= 0),
  "total_cycles" INTEGER CHECK (total_cycles IS NULL OR total_cycles >= 0),
  "last_result_json" TEXT,
  "attempt_count" INTEGER CHECK (attempt_count IS NULL OR attempt_count >= 0),
  "lease_owner" TEXT,
  "lease_expires_at" INTEGER CHECK (lease_expires_at IS NULL OR lease_expires_at >= 0),
  "last_error" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
, "serial_number" INTEGER CHECK (serial_number IS NULL OR serial_number > 0));

CREATE TABLE "market_instruments" (
  "id" INTEGER PRIMARY KEY,
  "chain" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "symbol" TEXT,
  "name" TEXT,
  "decimals" INTEGER CHECK (decimals IS NULL OR decimals >= 0),
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  UNIQUE(chain, address)
);

CREATE TABLE "market_snapshots" (
  "id" TEXT PRIMARY KEY,
  "instrument_id" INTEGER NOT NULL REFERENCES "market_instruments"("id") ON DELETE CASCADE,
  "source" TEXT NOT NULL,
  "snapshot_type" TEXT NOT NULL,
  "data_json" TEXT NOT NULL,
  "timestamp" INTEGER NOT NULL
);

CREATE TABLE "ohlcv_bars" (
  "instrument_id" INTEGER NOT NULL REFERENCES "market_instruments"("id") ON DELETE CASCADE,
  "source" TEXT NOT NULL,
  "interval" TEXT NOT NULL,
  "open_time" INTEGER NOT NULL,
  "close_time" INTEGER NOT NULL,
  "open" REAL NOT NULL,
  "high" REAL NOT NULL,
  "low" REAL NOT NULL,
  "close" REAL NOT NULL,
  "volume" REAL,
  "trades" INTEGER,
  "vwap" REAL,
  "fetched_at" INTEGER NOT NULL,
  "raw_json" TEXT,
  PRIMARY KEY(instrument_id, source, interval, open_time)
);

CREATE TABLE "schema_migrations" (
  "version" INTEGER PRIMARY KEY,
  "applied_at" INTEGER NOT NULL
);

CREATE INDEX "idx_action_receipts_timestamp" ON "action_receipts"("timestamp");

CREATE INDEX "idx_chat_messages_conversation_created_at" ON "chat_messages"("conversation_id", "created_at");

CREATE INDEX "idx_conversations_updated_at" ON "conversations"("updated_at");

CREATE INDEX "idx_http_cache_expires_at" ON "http_cache"("expires_at");

CREATE INDEX "idx_http_cache_source_endpoint" ON "http_cache"("source", "endpoint");

CREATE INDEX "idx_instance_facts_expires_at" ON "instance_facts"("expires_at");

CREATE INDEX "idx_instance_facts_instance_updated" ON "instance_facts"("instance_id", "updated_at");

CREATE INDEX "idx_instance_profiles_updated_at" ON "instance_profiles"("updated_at");

CREATE INDEX "idx_jobs_bot_id_status" ON "jobs"("bot_id", "status");

CREATE INDEX "idx_jobs_lease_expires_at" ON "jobs"("status", "lease_expires_at");

CREATE UNIQUE INDEX "idx_jobs_serial_number" ON "jobs"("serial_number");

CREATE INDEX "idx_jobs_status_next_run_at" ON "jobs"("status", "next_run_at");

CREATE INDEX "idx_market_instruments_chain_symbol" ON "market_instruments"("chain", "symbol");

CREATE INDEX "idx_market_snapshots_lookup" ON "market_snapshots"("instrument_id", "source", "snapshot_type", "timestamp");

CREATE INDEX "idx_ohlcv_fetched_at" ON "ohlcv_bars"("fetched_at");

CREATE INDEX "idx_ohlcv_lookup" ON "ohlcv_bars"("instrument_id", "source", "interval", "open_time");
```
