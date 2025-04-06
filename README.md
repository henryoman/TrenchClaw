# Solana DCA Bot

A Dollar-Cost Averaging (DCA) bot for Solana that automatically executes token swaps at scheduled intervals using Jupiter Swap API.

## Features

- **Multiple DCA Strategies**: Configure multiple strategies to buy different tokens at different intervals
- **Customizable Intervals**: Set how frequently you want to buy (in minutes)
- **Buy Limits**: Optionally set a total number of buys after which the strategy will stop
- **Error Handling**: Built-in retry mechanism when swaps fail
- **Solana Blockchain**: Built on the Solana blockchain for fast and low-cost transactions
- **Jupiter Swap Integration**: Uses Jupiter Swap for optimal token swaps with low slippage

## Requirements

- Node.js (v16+)
- npm or yarn
- Solana wallet with private key
- Helius API Key for RPC access
- QuickNode API Key (optional, for metrics)

## Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create configuration files:
   - Create `config/.env` file with your API keys and private key
   - Modify `config/strategies.json` for your DCA strategies

### Environment Variables

Create a `config/.env` file with the following variables:

```
HELIUS_API_KEY=your_helius_api_key_here
QUICKNODE_API_KEY=your_quicknode_api_key_here
PRIVATE_KEY=your_base58_encoded_private_key_or_json_array
```

### Strategy Configuration

Edit `config/strategies.json` to configure your DCA strategies:

```json
[
  {
    "swap": {
      "buyTokenMint": "So11111111111111111111111111111111111111112", // SOL token
      "sellTokenMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // USDC token
    },
    "dca": {
      "amount": 0.1, // Amount of sell token per swap
      "intervalMinutes": 60, // Buy every hour
      "totalBuys": 24 // Stop after 24 purchases (optional)
    }
  }
]
```

## Usage

Start the DCA bot:

```
npm start
```

The bot will automatically:
1. Load your configurations
2. Connect to the Solana network
3. Schedule and execute swaps according to your strategies
4. Continue running in the background 

## Development Mode

For testing without performing actual swaps, the bot includes a development mode that simulates transactions without sending them to the blockchain.

## License

MIT