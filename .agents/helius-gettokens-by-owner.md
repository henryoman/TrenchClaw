const getTokensByOwner = async (ownerAddress) => {
  const response = await fetch("https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY", {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: '1',
      method: 'getTokenAccountsByOwner',
      params: [
        ownerAddress,
        {
          programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
        },
        {
          encoding: 'jsonParsed'
        }
      ]
    })
  });
  
  const data = await response.json();
  return data;
};

// Example usage
getTokensByOwner("86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY");