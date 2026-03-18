# Settings Reference

## Purpose

This file explains where runtime configuration comes from right now.

## Main Settings Files

- `.runtime-state/instances/<id>/settings/ai.json`
  - provider selection: `gateway` or `openrouter`
  - selected LLM provider
  - selected model
  - default mode
  - temperature
  - max output tokens

- `.runtime-state/instances/<id>/vault.json`
  - secrets only
  - API keys
  - RPC URLs
  - private key material

- `.runtime-state/instances/<id>/settings/settings.json`
  - active-instance compatibility settings and overrides

- `.runtime-state/instances/<id>/settings/trading.json`
  - active-instance trading preferences

## Load Order

The runtime resolves settings in this order:

1. bundled base safety profile
2. sanitized agent overlay
3. active-instance compatibility settings
4. active instance trading settings
5. protected-path reapplication
6. schema normalization

## Ownership Rules

- `ai.json` decides provider and model
- the active instance vault supplies secrets for the chosen provider
- active-instance compatibility settings win over agent overlays
- instance trading settings only affect the active instance

## Model Operating Rule

- Read injected `Resolved Runtime Settings` before guessing configuration
- If a provider/model mismatch exists, report it directly
- Do not assume a key exists just because a provider is selected
