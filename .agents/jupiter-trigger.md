> ## Documentation Index
> Fetch the complete documentation index at: https://dev.jup.ag/llms.txt
> Use this file to discover all available pages before exploring further.

# Trigger Order API Overview

> Create advanced trigger orders on Solana with vault-based execution, including limit orders, take-profit/stop-loss (OCO), and conditional chains (OTOCO).

The Jupiter Trigger Order API enables advanced order types on Solana, allowing users to set price conditions for token swaps that execute automatically when market conditions are met.

V1 required traders to think in pool ratios — calculating how many tokens per SOL a pool needed to reach before an order would trigger. V2 replaces this with USD price triggers: set a dollar price and Jupiter handles conversion, routing, and execution. Orders are stored off-chain and private by default, closing the most common MEV attack vector of visible pending orders.

## What's New in V2

| Feature             | V1                                               | V2                                                                  |
| :------------------ | :----------------------------------------------- | :------------------------------------------------------------------ |
| **Trigger type**    | Pool rate only (e.g. "1 Fartcoin = 0.00025 SOL") | USD price                                                           |
| **Order direction** | Buy below, sell above                            | Buy above, buy below, sell above, sell below                        |
| **TP/SL**           | Not supported                                    | Take-profit and stop-loss with OCO bundling                         |
| **Edit orders**     | Must cancel and recreate                         | Edit trigger price and slippage in-place                            |
| **Partial fills**   | Not supported                                    | Orders fill partially for optimal execution prices                  |
| **Output amount**   | Guaranteed (fixed pool rate)                     | Not guaranteed (prioritises trigger execution, pool price may vary) |
| **Authentication**  | API key only                                     | Challenge-response JWT + API key                                    |
| **Order privacy**   | Pending orders visible on-chain (PDA accounts)   | Orders stored off-chain, private until execution                    |
| **Deposits**        | Program-derived address (PDA) order accounts     | Vault accounts (custodial) by Privy                                 |
| **Route prefix**    | `/trigger/v1`                                    | `/trigger/v2`                                                       |

<Note>
  There are no current plans to deprecate V1. However, all development efforts, research, and maintenance are focused entirely on V2. V1 will only receive updates for critical issues.
</Note>

## Order Types

| Type       | Description                                                                                                     | Use case                                                                                          |
| :--------- | :-------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------ |
| **Single** | Triggers when USD price crosses above or below a threshold                                                      | Standard limit orders, stop-loss                                                                  |
| **OCO**    | Two orders sharing one deposit: one take-profit, one stop-loss. When one fills, the other cancels automatically | Risk management with TP/SL brackets (e.g. sell SOL at \$300 TP or \$200 SL while market is \$250) |
| **OTOCO**  | A parent order triggers first, then activates a TP/SL pair (OCO) on the output                                  | Conditional entry with automatic exit strategy                                                    |

## How It Works

```
Your Wallet ──→ Vault (1 per wallet) ──→ Order A
                                    ──→ Order B
                                    ──→ Order C
```

Each wallet gets a single vault (a Privy-managed custodial account). When you create orders, tokens are deposited from your wallet into your vault. The vault holds funds for all your active orders.

1. [**Authenticate**](/docs/trigger/authentication): Sign a challenge with your wallet to receive a JWT token
2. [**Get your vault**](/docs/trigger/create-order#step-1-get-your-vault): Retrieve your vault, or register one on first use
3. [**Create an order**](/docs/trigger/create-order): Deposit tokens into your vault and submit order parameters
4. **Monitor**: Track order state and history via the [history endpoint](/docs/trigger/order-history)
5. [**Manage**](/docs/trigger/manage-orders): Update order parameters, or cancel with a two-step withdrawal flow

## Base URL

```
https://api.jup.ag/trigger/v2
```

All endpoints require an API key via the `x-api-key` header. Authenticated endpoints additionally require a JWT token via the `Authorization: Bearer <token>` header.

<Card title="Get an API key" href="https://portal.jup.ag" icon="key" iconType="solid" horizontal />

## FAQ

<AccordionGroup>
  <Accordion title="What happens to my funds if an order expires?">
    Funds remain in the vault. To retrieve them, use the same two-step cancel flow: initiate cancellation on the expired order, sign the withdrawal transaction, and confirm. See [Expired Order Withdrawal](/docs/trigger/manage-orders#expired-order-withdrawal).
  </Accordion>

  <Accordion title="Can I edit an order after creating it?">
    Yes. You can update trigger prices and slippage in-place without cancelling and recreating the order. See [Update an Order](/docs/trigger/manage-orders#update-an-order).
  </Accordion>

  <Accordion title="Why is the output amount not guaranteed?">
    V2 uses USD price triggers rather than pool rate triggers. When the price condition is met, the order executes a swap at the current market rate via Jupiter routing. The actual output depends on liquidity and slippage at execution time.
  </Accordion>

  <Accordion title="What is the minimum order size?">
    10 USD equivalent.
  </Accordion>

  <Accordion title="What happens if my JWT expires while I have open orders?">
    Open orders continue to be monitored and will execute normally. The JWT is only required for API calls (creating, editing, cancelling orders). When your token expires, re-authenticate to manage your orders.
  </Accordion>

  <Accordion title="What is an OCO order?">
    A One-Cancels-Other order creates a take-profit and stop-loss pair that share one deposit. When one side fills, the other cancels automatically, returning unused funds to the vault.
  </Accordion>

  <Accordion title="What is an OTOCO order?">
    A One-Triggers-One-Cancels-Other order has a parent trigger that executes first. Once the parent fills, it automatically activates a TP/SL pair (OCO) on the output tokens. If the parent expires or fails, the child orders are never created.
  </Accordion>

  <Accordion title="What is the default slippage?">
    Take-profit and buy-below orders use auto slippage via RTSE (Real-Time Slippage Estimator). Stop-loss and buy-above orders default to 20% (2000 bps) because execution certainty is more important when cutting losses. You can always set a custom slippage.
  </Accordion>

  <Accordion title="Can I set a trigger based on market cap?">
    The API accepts USD price triggers only (`triggerPriceUsd`). Market cap targeting is a convenience feature on the jup.ag frontend — it converts the market cap to a USD price before submitting to the API. To replicate this, divide the target market cap by the token's total supply to get the per-token USD price.
  </Accordion>

  <Accordion title="Are my pending orders visible to MEV bots?">
    No. V2 orders are stored off-chain and private by default. Order details (price, size, direction) are not revealed until the trigger condition is met and execution begins. In V1, pending orders were stored in on-chain PDA accounts, giving bots a roadmap to front-run profitable trades.
  </Accordion>
</AccordionGroup>


Built with [Mintlify](https://mintlify.com).