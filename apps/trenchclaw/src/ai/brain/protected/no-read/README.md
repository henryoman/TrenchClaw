# Vault Secrets

`vault.json` is intentionally untracked and local-only. The runtime auto-creates it from `vault.template.json` if missing.

Used references in `src/ai/brain/user-blockchain-settings/settings.yaml` and runtime LLM config:

- `vault://rpc/helius/http-url`
- `vault://rpc/helius/ws-url`
- `vault://rpc/helius/api-key`
- `vault://rpc/quicknode/http-url`
- `vault://rpc/quicknode/ws-url`
- `vault://rpc/quicknode/api-key`
- `vault://llm/openrouter/api-key`
- `vault://llm/openai/api-key`
- `vault://llm/openai-compatible/api-key`
- `vault://llm/gateway/api-key`
- `vault://integrations/dexscreener/api-key`
- `vault://integrations/jupiter/api-key`
- `vault://wallet/ultra-signer/private-key`
- `vault://wallet/ultra-signer/private-key-encoding`

Recommended Helius endpoint values (gateway-first):

- `rpc.helius.http-url`: `https://beta.helius-rpc.com/?api-key=`
- `rpc.helius.ws-url`: `wss://beta.helius-rpc.com/?api-key=`

Recommended permissions (POSIX):

```bash
chmod 700 src/ai/brain/protected/no-read
chmod 600 src/ai/brain/protected/no-read/vault.json
```
