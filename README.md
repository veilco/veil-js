# `veil-js`

`veil-js` is a TypeScript/Javascript library for interacting with the Veil markets and trading API.

Install:
```bash
yarn add veil-js
```

## Questions?

Join us on [Discord](https://discord.gg/aBfTCVU) or email us at `hello@veil.market`. If you encounter a problem using `veil-js`, feel free to [open an issue](https://github.com/veilmarket/veil-js/issues).

`veil-js` is maintained by @gkaemmer, @mertcelebi, and @pfletcherhill.

## Usage

You can use the API with or without authenticating using your ethereum address.

```typescript
import Veil from "veil-js";

// Without authentication
const veil = new Veil();
const markets = await veil.getMarkets();
console.log(markets); // { results: [{ slug: "...", ... }], total: 35, ... }

// With authentication
// Note: you must have registered on Veil using this address
const mnemonic = "unveil unveil unveil unveil unveil unveil unveil unveil unveil unveil unveil unveil";
const address = "0x5b5eae94bf37ff266955e46fdd38932346cc67e8";
const veil = new Veil(mnemonic, address);
const myOrders = await veil.getUserOrders(markets[0]);
```

## Pages

All API methods that return lists (`getMarkets`, `getOrders`, `getOrderFills`, and `getUserOrders`) return `Page` objects that have the following form:

```js
{
  results: [ ... ],
  total: 35,
  page: 0,
  pageSize: 100, // Depends on method
}
```

All of these methods also take a optional `page` argument, which you can use to fetch additional pages.

## Shares primer

Veil markets are built on [Augur](https://docs.augur.net/) and inherit the basic mechanics of Augur shares and prices.

A Veil market has two tokens: LONG and SHORT. By holding shares of LONG or SHORT tokens, you hold a "position" in the market. When the market ends, its LONG and SHORT shares are redeemable for ETH, with the rates depending on the market's result.

In yes/no markets (e.g. "Will ETH be above $100 at the end of 2018?"), the payout goes entirely to one share token—LONG if the market resolves to "Yes" and SHORT if the market resolves to "No".

In scalar markets (e.g. "What will be the price of ETH at the end of 2018?"), the payout is split between LONG and SHORT tokens according to where the result (e.g. the price of ETH) falls within the market's "bounds" (set by `minPrice` and `maxPrice`).

> Note: Together, 1 LONG share and 1 SHORT share are always redeemable for exactly 1 ETH.

The price of a Veil share token is therefore always somewhere between 0 and 1 ETH per share, depending on what the market predicts that each token's payout will be.

Share token prices are expressed as integers between 0 and 10000, where 10000 means 1 ETH/share. A token with a price of 6000 can be purchased for 0.6 ETH/share.

## Units and types

- Dates are returned as an integer number of milliseconds since the Unix epoch.
- Numbers are returned as strings for precision. We recommend using a library such as [bignumber.js](https://github.com/MikeMcl/bignumber.js/) to perform math on them.

## Methods

All methods return promises, and can be used with `async/await`.

### `veil.getMarkets(params: { channel?: string; status?: "open" | "resolved", page?: number })`

Fetches all markets, optionally filtered by `channel` (`btc`, `rep`, `meme`) or status (`open` or `resolved`). A maximum of 10 markets are returned per page, and you can specify pages using the `page` option.

Example response:
```js
{
  results: [
    ...
  ],
  total: 35,
  page: 0,
  pageSize: 10
}
```

See `getMarket` for an example market object.

### `veil.getMarket(slug: string)`

Fetches details about a single market. Example response:
```js
{
  name:
    "What will be the 7-day average gas price on the Ethereum blockchain at 12am UTC on December 1, 2018?",
  address: "0x4ebfc291176e4b6d0dbd555ef37541681c0c07eb",
  details: "For details see https://veil.market/contract/gas-gwei.",
  createdAt: 1543017685308,
  endsAt: 1543622400000,
  numTicks: "10000",
  minPrice: "12750000000000000000",
  maxPrice: "14980000000000000000",
  limitPrice: null,
  type: "scalar",
  uid: "4190e964-1e8d-4b11-85b8-ac421634fcda",
  slug: "gas-gwei-7d-2018-12-01",
  result: null,
  longBuybackOrder: null,
  shortBuybackOrder: null,
  longToken: "0x88596d175e3098d4a4d51195b55153cf4b5058b8",
  shortToken: "0x598b46d68e3e03f810a45d7d8dc9af5afdbafd56",
  denomination: "Gwei",
  index: "gas-gwei-7d",
  predictedPrice: "5845",
  metadata: {},
  finalValue: null
}
```

### `veil.getBids(market: Market, tokenType: "long" | "short")` and `veil.getAsks(market: Market, tokenType: "long" | "short")`

The `getBids` and `getAsks` methods let you fetch the order book for a market. You can fetch orders for either LONG or SHORT tokens by passing `tokenType` as a second argument (in Veil markets, the LONG and SHORT order books are always mirror images of each other).

Bids are sorted by price descending, and asks are sorted by price ascending, so you can get the spread of a market by comparing the first bid and first ask.

Example response:
```js
{
  results: [  
    {  
      price: "7000",
      tokenAmount: "100000000000000"
    },
    {
      price: "7100",
      tokenAmount: "50000000000000"
    },
    ...
  ],
  total: 45,
  page: 0,
  pageSize: 10000
}
```

### `veil.getOrderFills(market: Market, tokenType: "long" | "short", options?: { page: number })`

Fetches the order fill history in a market for tokens of type `tokenType` (LONG or SHORT). Example response:
```js
{
  results: [
    {
      createdAt: 1544094244674,
      status: "completed",
      tokenAmount: "100000000000000",
      price: "4320",
      side: "buy",
      uid: "dac7a4b5-bed5-4a07-85db-f5ff97a7f3d1",
    },
    ...
  ],
  total: 45,
  page: 0,
  pageSize: 100
}
```

### `veil.createQuote(market: Market, side: "buy" | "sell", tokenType: "long" | "short", amount: number | BigNumber, price: number | BigNumber)`

Creates a Veil quote, which is used to calculate fees and generate an unsigned 0x order, which is required to create a Veil order.

> **Note**: `price` is a number between 0 and `market.numTicks`, which is always 10000 for Veil markets. A price of 6000 is equivalent to 0.6 ETH/share.

Example response:
```js
{
  uid: "5d93b874-bde1-4af1-b7af-ae726943f549",
  orderHash: "0x39c5934cff5e608743f845a8c6950cc897ed75d8127023887d9715fa3c60c27c",
  createdAt: 1543510274469,
  expiresAt: 100000000000000,
  quoteExpiresAt: 1543510334469,
  token: "0x598b46d68e3e03f810a45d7d8dc9af5afdbafd56",
  currency: "0xe7a67a41b4d41b60e0efb60363df163e3cb6278f",
  side: "buy",
  type: "limit",
  currencyAmount: "119550000000000000",
  tokenAmount: "50000000000000",
  fillableTokenAmount: "0",
  feeAmount: "1195500000000000",
  price: "2391",
  zeroExOrder: {
    salt: "35666599517228498817069108086005958238926633694259560734477953229163342485507",
    makerFee: "0",
    takerFee: "0",
    makerAddress: "0x8f736a3d32838545f17d0c58d683247bee1a7ea5",
    takerAddress: "0xe779275c0e3006fe67e9163e991f1305f1b6fe99",
    senderAddress: "0xe779275c0e3006fe67e9163e991f1305f1b6fe99",
    makerAssetData: "0xf47261b0000000000000000000000000e7a67a41b4d41b60e0efb60363df163e3cb6278f",
    takerAssetData: "0xf47261b0000000000000000000000000598b46d68e3e03f810a45d7d8dc9af5afdbafd56",
    exchangeAddress: "0x35dd2932454449b14cee11a94d3674a936d5d7b2",
    makerAssetAmount: "120745500000000000",
    takerAssetAmount: "50000000000000",
    feeRecipientAddress: "0x0000000000000000000000000000000000000000",
    expirationTimeSeconds: "100000000600"
  }
}
```

### `veil.createOrder(quote: Quote, options?: { postOnly: boolean })`

Creates an order using an generated quote. This method signs the 0x order using your mnemonic and address provided to the constructor.

Example response:
```js
{
  uid: "77fb963c-6b78-48ce-b030-7a08246e1f9f",
  status: "open",
  createdAt: 1543510274884,
  expiresAt: 100000000000000,
  type: "limit",
  tokenType: "short",
  side: "buy",
  longSide: "sell",
  longPrice: "7609",
  shortPrice: "2391",
  token: "0x598b46d68e3e03f810a45d7d8dc9af5afdbafd56",
  tokenAmount: "50000000000000",
  tokenAmountFilled: "0",
  currency: "0xe7a67a41b4d41b60e0efb60363df163e3cb6278f",
  currencyAmount: "119550000000000000",
  currencyAmountFilled: "0",
  postOnly: false,
  market: null
}
```

### `veil.cancelOrder(uid: string)`

Cancels an order. Returns the order that was canceled.

### `veil.getUserOrders(market: Market, options?: { page: number })`

Fetches all orders that you've created in a particular market, including orders that have been filled.

Example response:
```js
{
  results: [  
    {  
      uid: "3e4fd40d-176f-432f-8f0b-d0a600d55a1f",
      status: "filled",
      createdAt: 1543509213537,
      expiresAt: 100000000000000,
      type: "limit",
      tokenType: "short",
      side: "buy",
      longSide: "sell",
      longPrice: "7707",
      shortPrice: "2293",
      token: "0x598b46d68e3e03f810a45d7d8dc9af5afdbafd56",
      tokenAmount: "100000000000000",
      tokenAmountFilled: "0",
      currency: "0xe7a67a41b4d41b60e0efb60363df163e3cb6278f",
      currencyAmount: "229300000000000000",
      currencyAmountFilled: "0",
      postOnly: false,
      market: null
    },
    ...
  ],
  total: 45,
  page: 0,
  pageSize: 10000
}
```
