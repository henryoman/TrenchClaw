> ## Documentation Index
> Fetch the complete documentation index at: https://www.helius.dev/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Earn SOL Rebates from Your Transactions

> Earn automatic SOL rebates via post-trade backruns with no additional risk of toxic MEV.

<Note>
  **This is an optional feature.** Helius will never participate in backrun rebates without your explicit permission. You must opt in by adding the `rebate-address` parameter to your transaction requests.
</Note>

## What are Backrun Rebates?

Helius Backrun Rebates let you earn a share of the MEV (Maximum Extractable Value) your transactions create. When your trade generates profitable arbitrage opportunities, searchers compete to backrun your transaction - and you get paid a portion of their profits in SOL.

<CardGroup cols={2}>
  <Card title="No Additional MEV Risk" icon="shield-check">
    Your transaction executes first in bundles and MEV is extracted after execution
  </Card>

  <Card title="One Parameter" icon="code">
    Add `rebate-address` to your RPC URL - no code changes or contract modifications needed
  </Card>
</CardGroup>

## How It Works

The rebate system runs a private order-flow auction alongside the regular RPC flow.

For each transaction, Helius forwards an unsigned copy to the auction while submitting the signed transaction through the normal RPC path. Because both paths happen in parallel, there's no extra latency and the auction is never exclusive.

<Steps titleSize="h3">
  <Step title="Opt In">
    Add `rebate-address=<YOUR_SOL_ADDRESS>` query parameter to any `sendTransaction` call on mainnet. This feature is entirely optional - Helius only participates when you explicitly opt in.
  </Step>

  <Step title="Auction Process">
    While your transaction is processed through the standard RPC path, Helius also forwards an unsigned copy to our private order-flow auction where pre-approved, KYC'd searchers bid to backrun your trade
  </Step>

  <Step title="Bundle Creation">
    The highest bidder wins and a bundle is created: **\[your transaction, searcher transaction]**. Your transaction is always executed first
  </Step>

  <Step title="Automatic Payout">
    If the bundle lands on-chain, Helius automatically pays the agreed rebate directly to your specified address in SOL
  </Step>
</Steps>

### Understanding Backruns

Backrunning is a beneficial form of arbitrage that helps keep prices consistent across different exchanges. Unlike malicious MEV attacks, backrunning improves the network by correcting price imbalances created by large trades.

**Example**: When you buy BONK on Raydium, the price goes up on that exchange but stays the same on Orca. A searcher then buys BONK on Orca (cheaper) and sells on Raydium (higher price), capturing the difference as profit. With Helius rebates, you earn from this profit your trade created.

<Tip>
  **Bundle Execution**: Your transaction always executes first in the bundle before any searcher transactions.
</Tip>

<Card title="How much can I earn?" icon="question">
  **You earn 50% of the MEV your trade creates**

  * Larger trades with higher price impact generate more MEV and higher rebates
  * Payments are immediate - you receive SOL in the same block as execution
</Card>

<Info>
  **MEV Protection**: Your transaction executes first in bundles and MEV is extracted after execution, letting you profit from arbitrage opportunities you create.
</Info>

## Quickstart Guide

Ready to start earning rebates from your trades? Get started in under 5 minutes with your existing transaction code.

<Tabs>
  <Tab title="JavaScript/TypeScript">
    ```javascript  theme={"system"}
    // Create and serialize your transaction first
    const serializedTransaction = transaction.serialize().toString('base64');

    // Send transaction with rebate-address parameter
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${API_KEY}&rebate-address=${REBATE_ADDRESS}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sendTransaction',
        params: [
          serializedTransaction,
          {
            skipPreflight: true,
            preflightCommitment: 'processed'
          }
        ]
      })
    });

    const result = await response.json();
    console.log('Transaction sent:', result.result);
    console.log('Rebates will be paid to:', REBATE_ADDRESS);
    ```
  </Tab>

  <Tab title="Python">
    ```python  theme={"system"}
    import requests
    import json

    # Serialize your transaction first
    serialized_transaction = transaction.serialize().decode('utf-8')

    # Send transaction with rebate-address parameter
    url = f"https://mainnet.helius-rpc.com/?api-key={API_KEY}&rebate-address={REBATE_ADDRESS}"

    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "sendTransaction",
        "params": [
            serialized_transaction,
            {
                "skipPreflight": true,
                "preflightCommitment": "processed"
            }
        ]
    }

    response = requests.post(url, json=payload)
    result = response.json()
    print(f"Transaction sent: {result['result']}")
    print(f"Rebates will be paid to: {REBATE_ADDRESS}")
    ```
  </Tab>

  <Tab title="Rust">
    ```rust  theme={"system"}
    use reqwest::Client;
    use serde_json::json;

    // Serialize your transaction first
    let serialized_transaction = bs58::encode(&transaction.serialize()).into_string();

    // Send transaction with rebate-address parameter
    let url = format!(
        "https://mainnet.helius-rpc.com/?api-key={}&rebate-address={}", 
        api_key, rebate_address
    );

    let client = Client::new();
    let payload = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "sendTransaction",
        "params": [
            serialized_transaction,
            {
                "skipPreflight": true,
                "preflightCommitment": "processed"
            }
        ]
    });

    let response = client.post(&url)
        .json(&payload)
        .send()
        .await?;

    let result: serde_json::Value = response.json().await?;
    println!("Transaction sent: {}", result["result"]);
    println!("Rebates will be paid to: {}", rebate_address);
    ```
  </Tab>

  <Tab title="cURL">
    ```bash  theme={"system"}
    # Send transaction with rebate-address parameter
    curl -X POST \
      "https://mainnet.helius-rpc.com/?api-key=${API_KEY}&rebate-address=${REBATE_ADDRESS}" \
      -H "Content-Type: application/json" \
      -d '{
        "jsonrpc": "2.0",
        "id": 1,
        "method": "sendTransaction",
        "params": [
          "YOUR_SERIALIZED_TRANSACTION_BASE64",
          {
            "skipPreflight": false,
            "preflightCommitment": "processed"
          }
        ]
      }'
    ```
  </Tab>
</Tabs>

<Note>
  **Important**: Only single-transaction requests on **mainnet** qualify for rebates. Batch RPC calls and devnet transactions are automatically skipped.
</Note>

## How Helius Protects You

Unlike other validators who could engage in malicious forms of MEV, your transaction is only shared with vetted searchers in a private auction. No other parties can see or modify your transaction before execution. Helius only permits searchers engaging in post-trade backruns.

<CardGroup cols={2}>
  <Card title="Private Auction Only" icon="shield-check">
    Transaction shared with **pre-approved, KYC'd searchers** only
  </Card>

  <Card title="Post-Trade Only" icon="user-check">
    Helius only permits **post-trade backruns** - no frontrunning allowed
  </Card>

  <Card title="No Additional MEV Risk" icon="shield">
    Your transaction executes first in bundles with vetted searchers only
  </Card>

  <Card title="Fully Verifiable" icon="magnifying-glass">
    All bundle activity visible **on-chain** for complete transparency
  </Card>
</CardGroup>

## FAQs

<AccordionGroup>
  <Accordion title="What is MEV?">
    MEV is Maximal Extractable Value. It's the profit validators can make by reordering transactions in blocks.
  </Accordion>

  <Accordion title="How do bundles work?">
    Your transaction goes to a private auction with pre-approved, KYC'd searchers who can only engage in post-trade backruns. The winning searcher's transaction is bundled with yours - your transaction executes first, then theirs. If the bundle succeeds, you automatically receive your SOL rebate in the same block.
  </Accordion>

  <Accordion title="How much will I earn?">
    You earn 50% of the MEV your transaction creates. Helius keeps 50% for providing the infrastructure.
  </Accordion>

  <Accordion title="When do I get paid?">
    Rebates are paid automatically in SOL in the same block as your transaction.
  </Accordion>

  <Accordion title="Is this safe?">
    Yes. Your transaction executes first in bundles with pre-approved searchers who can only perform post-trade backruns.
  </Accordion>
</AccordionGroup>

## Support

Have questions or need help getting started? Reach out to our support team:

<CardGroup cols={2}>
  <Card title="Developer Community" icon="discord" href="https://discord.com/invite/6GXdee3gBj">
    Join thousands of developers building on Solana. Share knowledge,
    get help, and connect with peers.
  </Card>

  <Card title="Direct Support" icon="headset" href="https://dashboard.helius.dev/support">
    Get help directly from the Helius team. Available to Developer plan
    subscribers and above.
  </Card>
</CardGroup>


Built with [Mintlify](https://mintlify.com).