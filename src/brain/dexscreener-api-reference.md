# Dexscreener API Reference (Snapshot)

Source: https://docs.dexscreener.com/api/reference

## Endpoints

- `GET /token-profiles/latest/v1`
- `GET /community-takeovers/latest/v1`
- `GET /ads/latest/v1`
- `GET /token-boosts/latest/v1`
- `GET /token-boosts/top/v1`
- `GET /orders/v1/{chainId}/{tokenAddress}`
- `GET /latest/dex/pairs/{chainId}/{pairId}`
- `GET /latest/dex/search?q=text`
- `GET /token-pairs/v1/{chainId}/{tokenAddress}`
- `GET /tokens/v1/{chainId}/{tokenAddresses}`

## Raw Page Text

Reference | DEX Screener - Docs
bars
DEX Screener - Docs
search
circle-xmark
⌘
Ctrl
k
DEX Screener - Docs
❓
FAQ
📱
Mobile App
🔥
Trending
⚡
Boosting
Token Listing
DEX Listing
Chain Listing
TradingView Charts
🤖
API
Reference
API Terms & Conditions
🔓
Privacy
Disclaimer
Terms & Conditions
Privacy policy
App privacy policy
Refund Policy
Boosting Terms & Conditions
📧
Contact us
Advertise
API survey
arrow-up-right
Partnerships
arrow-up-right
chevron-up
chevron-down
gitbook
Powered by GitBook
xmark
block-quote
On this page
chevron-down
copy
Copy
chevron-down
🤖
API
Reference
DEX Screener API reference
hashtag
Get the latest token profiles (rate-limit 60 requests per minute)
get
https://api.dexscreener.com
/token-profiles/latest/v1
Responses
chevron-right
200
Ok
application/json
url
string · uri
Optional
chainId
string
Optional
tokenAddress
string
Optional
icon
string · uri
Optional
header
string · uri
· nullable
Optional
description
string
· nullable
Optional
links
object[]
· nullable
Optional
Show properties
plus
get
/token-profiles/latest/v1
HTTP
chevron-down
HTTP
cURL
JavaScript
Python
Test it
200
Ok
hashtag
Get the latest token community takeovers (rate-limit 60 requests per minute)
get
https://api.dexscreener.com
/community-takeovers/latest/v1
Responses
chevron-right
200
Ok
application/json
url
string · uri
Optional
chainId
string
Optional
tokenAddress
string
Optional
icon
string · uri
Optional
header
string · uri
· nullable
Optional
description
string
· nullable
Optional
links
object[]
· nullable
Optional
Show properties
plus
claimDate
string · date-time
Optional
get
/community-takeovers/latest/v1
HTTP
chevron-down
HTTP
cURL
JavaScript
Python
Test it
200
Ok
hashtag
Get the latest ads (rate-limit 60 requests per minute)
get
https://api.dexscreener.com
/ads/latest/v1
Responses
chevron-right
200
Ok
application/json
url
string · uri
Optional
chainId
string
Optional
tokenAddress
string
Optional
date
string · date-time
Optional
type
string
Optional
durationHours
number
· nullable
Optional
impressions
number
· nullable
Optional
get
/ads/latest/v1
HTTP
chevron-down
HTTP
cURL
JavaScript
Python
Test it
200
Ok
hashtag
Get the latest boosted tokens (rate-limit 60 requests per minute)
get
https://api.dexscreener.com
/token-boosts/latest/v1
Responses
chevron-right
200
Ok
application/json
url
string · uri
Optional
chainId
string
Optional
tokenAddress
string
Optional
amount
number
Optional
totalAmount
number
Optional
icon
string · uri
· nullable
Optional
header
string · uri
· nullable
Optional
description
string
· nullable
Optional
links
object[]
· nullable
Optional
Show properties
plus
get
/token-boosts/latest/v1
HTTP
chevron-down
HTTP
cURL
JavaScript
Python
Test it
200
Ok
hashtag
Get the tokens with most active boosts (rate-limit 60 requests per minute)
get
https://api.dexscreener.com
/token-boosts/top/v1
Responses
chevron-right
200
Ok
application/json
url
string · uri
Optional
chainId
string
Optional
tokenAddress
string
Optional
amount
number
Optional
totalAmount
number
Optional
icon
string · uri
· nullable
Optional
header
string · uri
· nullable
Optional
description
string
· nullable
Optional
links
object[]
· nullable
Optional
Show properties
plus
get
/token-boosts/top/v1
HTTP
chevron-down
HTTP
cURL
JavaScript
Python
Test it
200
Ok
hashtag
Check paid orders for a token (rate-limit 60 requests per minute)
get
https://api.dexscreener.com
/orders/v1/
{chainId}
/
{tokenAddress}
Path parameters
chainId
string
Required
Example:
solana
tokenAddress
string
Required
Example:
A55XjvzRU4KtR3Lrys8PpLZQvPojPqvnv5bJVHMYy3Jv
Responses
chevron-right
200
Ok
application/json
type
string · enum
Optional
Possible values
:
tokenProfile
communityTakeover
tokenAd
trendingBarAd
status
string · enum
Optional
Possible values
:
processing
cancelled
on-hold
approved
rejected
paymentTimestamp
number
Optional
get
/orders/v1/
{chainId}
/
{tokenAddress}
HTTP
chevron-down
HTTP
cURL
JavaScript
Python
Test it
200
Ok
hashtag
Get one or multiple pairs by chain and pair address (rate-limit 300 requests per minute)
get
https://api.dexscreener.com
/latest/dex/pairs/
{chainId}
/
{pairId}
Path parameters
chainId
string
Required
Example:
solana
pairId
string
Required
Example:
JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN
Responses
chevron-right
200
Ok
application/json
schemaVersion
string
Optional
pairs
object[]
· nullable
Optional
Show properties
plus
get
/latest/dex/pairs/
{chainId}
/
{pairId}
HTTP
chevron-down
HTTP
cURL
JavaScript
Python
Test it
200
Ok
hashtag
Search for pairs matching query (rate-limit 300 requests per minute)
get
https://api.dexscreener.com
/latest/dex/search
Query parameters
q
string
Required
Example:
SOL/USDC
Responses
chevron-right
200
Ok
application/json
schemaVersion
string
Optional
pairs
object[]
Optional
Show properties
plus
get
/latest/dex/search
HTTP
chevron-down
HTTP
cURL
JavaScript
Python
Test it
200
Ok
hashtag
Get the pools of a given token address (rate-limit 300 requests per minute)
get
https://api.dexscreener.com
/token-pairs/v1/
{chainId}
/
{tokenAddress}
Path parameters
chainId
string
Required
Example:
solana
tokenAddress
string
Required
A token addresses
Example:
JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN
Responses
chevron-right
200
Ok
application/json
chainId
string
Optional
dexId
string
Optional
url
string · uri
Optional
pairAddress
string
Optional
labels
string[]
· nullable
Optional
baseToken
object
Optional
Show properties
plus
quoteToken
object
Optional
Show properties
plus
priceNative
string
Optional
priceUsd
string
· nullable
Optional
txns
object
Optional
Show properties
plus
volume
object
Optional
Show properties
plus
priceChange
object
· nullable
Optional
Show properties
plus
liquidity
object
· nullable
Optional
Show properties
plus
fdv
number
· nullable
Optional
marketCap
number
· nullable
Optional
pairCreatedAt
integer
· nullable
Optional
info
object
Optional
Show properties
plus
boosts
object
Optional
Show properties
plus
get
/token-pairs/v1/
{chainId}
/
{tokenAddress}
HTTP
chevron-down
HTTP
cURL
JavaScript
Python
Test it
200
Ok
hashtag
Get one or multiple pairs by token address (rate-limit 300 requests per minute)
get
https://api.dexscreener.com
/tokens/v1/
{chainId}
/
{tokenAddresses}
Path parameters
chainId
string
Required
Example:
solana
tokenAddresses
string
Required
One or multiple, comma-separated token addresses (up to 30 addresses)
Example:
So11111111111111111111111111111111111111112,EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
Responses
chevron-right
200
Ok
application/json
chainId
string
Optional
dexId
string
Optional
url
string · uri
Optional
pairAddress
string
Optional
labels
string[]
· nullable
Optional
baseToken
object
Optional
Show properties
plus
quoteToken
object
Optional
Show properties
plus
priceNative
string
Optional
priceUsd
string
· nullable
Optional
txns
object
Optional
Show properties
plus
volume
object
Optional
Show properties
plus
priceChange
object
· nullable
Optional
Show properties
plus
liquidity
object
· nullable
Optional
Show properties
plus
fdv
number
· nullable
Optional
marketCap
number
· nullable
Optional
pairCreatedAt
integer
· nullable
Optional
info
object
Optional
Show properties
plus
boosts
object
Optional
Show properties
plus
get
/tokens/v1/
{chainId}
/
{tokenAddresses}
HTTP
chevron-down
HTTP
cURL
JavaScript
Python
Test it
200
Ok
Last updated
3 months ago
GET
Get the latest token profiles (rate-limit 60 requests per minute)
GET
Get the latest token community takeovers (rate-limit 60 requests per minute)
GET
Get the latest ads (rate-limit 60 requests per minute)
GET
Get the latest boosted tokens (rate-limit 60 requests per minute)
GET
Get the tokens with most active boosts (rate-limit 60 requests per minute)
GET
Check paid orders for a token (rate-limit 60 requests per minute)
GET
Get one or multiple pairs by chain and pair address (rate-limit 300 requests per minute)
GET
Search for pairs matching query (rate-limit 300 requests per minute)
GET
Get the pools of a given token address (rate-limit 300 requests per minute)
GET
Get one or multiple pairs by token address (rate-limit 300 requests per minute)
sun-bright
desktop
moon
Copy
GET /token-profiles/latest/v1 HTTP/1.1
Host: api.dexscreener.com
Accept: */*
Copy
{
"url": "https://example.com",
"chainId": "text",
"tokenAddress": "text",
"icon": "https://example.com",
"header": "https://example.com",
"description": "text",
"links": [
{
"type": "text",
"label": "text",
"url": "https://example.com"
}
]
}
Copy
GET /community-takeovers/latest/v1 HTTP/1.1
Host: api.dexscreener.com
Accept: */*
Copy
[
{
"url": "https://example.com",
"chainId": "text",
"tokenAddress": "text",
"icon": "https://example.com",
"header": "https://example.com",
"description": "text",
"links": [
{
"type": "text",
"label": "text",
"url": "https://example.com"
}
],
"claimDate": "2026-02-23T09:08:57.856Z"
}
]
Copy
GET /ads/latest/v1 HTTP/1.1
Host: api.dexscreener.com
Accept: */*
Copy
[
{
"url": "https://example.com",
"chainId": "text",
"tokenAddress": "text",
"date": "2026-02-23T09:08:57.856Z",
"type": "text",
"durationHours": 1,
"impressions": 1
}
]
Copy
GET /token-boosts/latest/v1 HTTP/1.1
Host: api.dexscreener.com
Accept: */*
Copy
{
"url": "https://example.com",
"chainId": "text",
"tokenAddress": "text",
"amount": 1,
"totalAmount": 1,
"icon": "https://example.com",
"header": "https://example.com",
"description": "text",
"links": [
{
"type": "text",
"label": "text",
"url": "https://example.com"
}
]
}
Copy
GET /token-boosts/top/v1 HTTP/1.1
Host: api.dexscreener.com
Accept: */*
Copy
{
"url": "https://example.com",
"chainId": "text",
"tokenAddress": "text",
"amount": 1,
"totalAmount": 1,
"icon": "https://example.com",
"header": "https://example.com",
"description": "text",
"links": [
{
"type": "text",
"label": "text",
"url": "https://example.com"
}
]
}
Copy
GET /orders/v1/{chainId}/{tokenAddress} HTTP/1.1
Host: api.dexscreener.com
Accept: */*
Copy
[
{
"type": "tokenProfile",
"status": "processing",
"paymentTimestamp": 1
}
]
Copy
GET /latest/dex/pairs/{chainId}/{pairId} HTTP/1.1
Host: api.dexscreener.com
Accept: */*
Copy
{
"schemaVersion": "text",
"pairs": [
{
"chainId": "text",
"dexId": "text",
"url": "https://example.com",
"pairAddress": "text",
"labels": [
"text"
],
"baseToken": {
"address": "text",
"name": "text",
"symbol": "text"
},
"quoteToken": {
"address": "text",
"name": "text",
"symbol": "text"
},
"priceNative": "text",
"priceUsd": "text",
"txns": {
"ANY_ADDITIONAL_PROPERTY": {
"buys": 1,
"sells": 1
}
},
"volume": {
"ANY_ADDITIONAL_PROPERTY": 1
},
"priceChange": {
"ANY_ADDITIONAL_PROPERTY": 1
},
"liquidity": {
"usd": 1,
"base": 1,
"quote": 1
},
"fdv": 1,
"marketCap": 1,
"pairCreatedAt": 1,
"info": {
"imageUrl": "https://example.com",
"websites": [
{
"url": "https://example.com"
}
],
"socials": [
{
"platform": "text",
"handle": "text"
}
]
},
"boosts": {
"active": 1
}
}
]
}
Copy
GET /latest/dex/search?q=text HTTP/1.1
Host: api.dexscreener.com
Accept: */*
Copy
{
"schemaVersion": "text",
"pairs": [
{
"chainId": "text",
"dexId": "text",
"url": "https://example.com",
"pairAddress": "text",
"labels": [
"text"
],
"baseToken": {
"address": "text",
"name": "text",
"symbol": "text"
},
"quoteToken": {
"address": "text",
"name": "text",
"symbol": "text"
},
"priceNative": "text",
"priceUsd": "text",
"txns": {
"ANY_ADDITIONAL_PROPERTY": {
"buys": 1,
"sells": 1
}
},
"volume": {
"ANY_ADDITIONAL_PROPERTY": 1
},
"priceChange": {
"ANY_ADDITIONAL_PROPERTY": 1
},
"liquidity": {
"usd": 1,
"base": 1,
"quote": 1
},
"fdv": 1,
"marketCap": 1,
"pairCreatedAt": 1,
"info": {
"imageUrl": "https://example.com",
"websites": [
{
"url": "https://example.com"
}
],
"socials": [
{
"platform": "text",
"handle": "text"
}
]
},
"boosts": {
"active": 1
}
}
]
}
Copy
GET /token-pairs/v1/{chainId}/{tokenAddress} HTTP/1.1
Host: api.dexscreener.com
Accept: */*
Copy
[
{
"chainId": "text",
"dexId": "text",
"url": "https://example.com",
"pairAddress": "text",
"labels": [
"text"
],
"baseToken": {
"address": "text",
"name": "text",
"symbol": "text"
},
"quoteToken": {
"address": "text",
"name": "text",
"symbol": "text"
},
"priceNative": "text",
"priceUsd": "text",
"txns": {
"ANY_ADDITIONAL_PROPERTY": {
"buys": 1,
"sells": 1
}
},
"volume": {
"ANY_ADDITIONAL_PROPERTY": 1
},
"priceChange": {
"ANY_ADDITIONAL_PROPERTY": 1
},
"liquidity": {
"usd": 1,
"base": 1,
"quote": 1
},
"fdv": 1,
"marketCap": 1,
"pairCreatedAt": 1,
"info": {
"imageUrl": "https://example.com",
"websites": [
{
"url": "https://example.com"
}
],
"socials": [
{
"platform": "text",
"handle": "text"
}
]
},
"boosts": {
"active": 1
}
}
]
Copy
GET /tokens/v1/{chainId}/{tokenAddresses} HTTP/1.1
Host: api.dexscreener.com
Accept: */*
Copy
[
{
"chainId": "text",
"dexId": "text",
"url": "https://example.com",
"pairAddress": "text",
"labels": [
"text"
],
"baseToken": {
"address": "text",
"name": "text",
"symbol": "text"
},
"quoteToken": {
"address": "text",
"name": "text",
"symbol": "text"
},
"priceNative": "text",
"priceUsd": "text",
"txns": {
"ANY_ADDITIONAL_PROPERTY": {
"buys": 1,
"sells": 1
}
},
"volume": {
"ANY_ADDITIONAL_PROPERTY": 1
},
"priceChange": {
"ANY_ADDITIONAL_PROPERTY": 1
},
"liquidity": {
"usd": 1,
"base": 1,
"quote": 1
},
"fdv": 1,
"marketCap": 1,
"pairCreatedAt": 1,
"info": {
"imageUrl": "https://example.com",
"websites": [
{
"url": "https://example.com"
}
],
"socials": [
{
"platform": "text",
"handle": "text"
}
]
},
"boosts": {
"active": 1
}
}
]
sun-bright
desktop
moon