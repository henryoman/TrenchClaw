// Action: checkBalance
// Category: wallet-based
// Subcategory: read-only
// Wallet required: Yes (public key only, no signing)
//
// Returns the balance of a specific SPL token for the active wallet.
//
// Input:
//   mintAddress: string — The token mint to check balance for.
//
// Output:
//   balance: number       — Token balance in human-readable units.
//   rawBalance: number    — Raw token amount (smallest units).
//   decimals: number      — Token decimals used for conversion.
//   mintAddress: string   — The mint checked.
//   ataAddress: string    — The Associated Token Account address.
//   walletAddress: string — The wallet public key checked.
//
// Used by:
//   - Swing/percentage routines (check token balance before sell phase).
//   - Policy engine (verify post-trade balance sanity).
//   - TUI portfolio view.
//
// Calls token-account adapter's getTokenBalance() through the RPC pool.


const options = {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: '1',
      method: 'getBalance',
      params: ['83astBRguLMdt2h5U1Tpdq5tjFoJ6noeGwaY3mDLVcri']
    })
  };
  
  fetch("https://beta.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY", options)
    .then(res => res.json())
    .then(res => console.log(res))
    .catch(err => console.error(err));
