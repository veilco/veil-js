require("babel-polyfill");
import some = require("lodash/some");
import getProvider from "./provider";
import { BigNumber } from "@0xproject/utils";
import { Provider, Order as ZeroExOrder } from "@0xproject/order-utils";
import authenticate from "./auth";
import graphqlFetch from "./graphqlFetch";
import { signOrder } from "./0x";
import fetch from "node-fetch";

interface IMarket {
  slug: string;
  uid: string;
  endsAt: string;
  shortToken: string;
  longToken: string;
  numTicks: string;
  minPrice: string;
  maxPrice: string;
  orders?: IOrder[];
  index: string;
  limitPrice: string;
}

interface IOrder {
  uid: string;
  longPrice: string;
  longSide: "buy" | "sell";
  tokenAmount: string;
  tokenAmountUnfilled: string;
  status: "open" | "filled" | "canceled";
}

interface IQuote {
  uid: string;
  zeroExOrder: ZeroExOrder;
}

interface IDataFeedEntry {
  value: string;
  timestamp: string;
}

interface IDataFeed {
  uid: string;
  name: string;
  description: string;
  denomination: string;
  entries: [IDataFeedEntry];
}

const API_HOST_DEFAULT = "https://api.kovan.veil.market";
const FEEDS_API_HOST_DEFAULT = "https://api.index.veil.market";

const TEN_18 = new BigNumber(10).toPower(18);
export function toWei(amount: number) {
  return new BigNumber(amount.toString()).mul(TEN_18);
}

export function fromWei(amount: BigNumber | string) {
  return new BigNumber(amount.toString()).div(TEN_18);
}

export function toShares(amount: number, numTicks: string | number) {
  return new BigNumber(amount.toString())
    .mul(TEN_18)
    .div(new BigNumber(numTicks));
}

export function fromShares(
  amount: BigNumber | string,
  numTicks: string | number
) {
  return new BigNumber(amount.toString())
    .mul(new BigNumber(numTicks))
    .div(TEN_18);
}

export default class Veil {
  provider: Provider;
  apiHost: string;
  feedsApiHost: string;
  address: string;
  jwt: string;
  takerAddress: string;
  marketSlug: string;
  market: IMarket;
  isSetup = false;

  constructor(
    jsonRpcUrl: string,
    mnemonic: string,
    address: string,
    apiHost: string = API_HOST_DEFAULT,
    feedsApiHost: string = FEEDS_API_HOST_DEFAULT
  ) {
    this.provider = getProvider(mnemonic, jsonRpcUrl);
    this.address = address.toLowerCase();
    this.apiHost = apiHost;
    this.feedsApiHost = feedsApiHost;
  }

  async setup() {
    if (!this.jwt) await this.authenticate();
    if (!this.takerAddress) await this.getTakerAddress();
    this.isSetup = true;
  }

  async authenticate() {
    this.jwt = await authenticate(this.provider, this.apiHost, this.address);
    return true;
  }

  async getMarkets(
    filter: { index?: string; status?: "open" | "resolved" } = {}
  ) {
    let url = `${this.apiHost}/api/v1/markets?`;
    if (filter.index) url = `${url}index=${filter.index}&`;
    if (filter.status) url = `${url}status=${filter.status}&`;
    const response = await fetch(url);
    const json = await response.json();
    if (json.errors)
      throw new Error("Error getting markets: " + JSON.stringify(json.errors));
    return json.data;
  }

  async createOrder(quote: IQuote, options: { postOnly?: boolean } = {}) {
    if (!this.isSetup) await this.setup();

    const signedOrder = await signOrder(this.provider, quote.zeroExOrder);
    const params = {
      zeroExOrder: signedOrder,
      quoteUid: quote.uid,
      ...options
    };
    while (true) {
      try {
        const { createOrder } = await graphqlFetch<{
          createOrder: IOrder;
        }>(
          this.apiHost,
          `
          mutation CreateOrder($params: CreateOrderInput!) {
            createOrder(params: $params) {
              uid
              status
              tokenAmount
              tokenAmountFilled
            }
          }`,
          { params },
          this.jwt
        );
        return createOrder;
      } catch (e) {
        if (some(e.errors, (err: any) => err.message.match("jwt expired"))) {
          await this.authenticate();
        } else throw e;
      }
    }
  }

  async createQuote(
    _market: IMarket,
    side: "buy" | "sell",
    tokenType: "long" | "short",
    amount: number | BigNumber,
    price: number | BigNumber
  ) {
    if (!this.isSetup) await this.setup();

    const zero = new BigNumber(0);
    const numTicks = new BigNumber(_market.numTicks);
    if (typeof amount === "number") amount = toShares(amount, _market.numTicks);
    if (typeof price === "number")
      price = new BigNumber(price.toString()).mul(numTicks);

    if (price.lt(zero)) price = zero;
    if (price.gt(numTicks)) price = numTicks;
    price = price.round();
    const token = tokenType === "long" ? _market.longToken : _market.shortToken;

    const params = {
      side,
      token,
      tokenAmount: amount.toString(),
      price: price.toString(),
      type: "limit"
    };

    while (true) {
      try {
        const { createQuote } = await graphqlFetch<{
          createQuote: IQuote;
        }>(
          this.apiHost,
          `
          mutation CreateQuote($params: CreateQuoteInput!) {
            createQuote(params: $params) {
              uid
              zeroExOrder
            }
          }`,
          { params },
          this.jwt
        );
        return createQuote;
      } catch (e) {
        if (some(e.errors, (err: any) => err.message.match("jwt expired"))) {
          await this.authenticate();
        } else throw e;
      }
    }
  }

  async cancelOrder(uid: string) {
    if (!this.isSetup) await this.setup();

    while (true) {
      try {
        const { cancelOrder } = await graphqlFetch<{ cancelOrder: IOrder }>(
          this.apiHost,
          `
          mutation CancelOrder($uid: String!) {
            cancelOrder(uid: $uid) {
              uid
              status
              tokenAmount
              tokenAmountFilled
            }
          }`,
          { uid },
          this.jwt
        );
        return cancelOrder;
      } catch (e) {
        if (some(e.errors, (err: any) => err.message.match("jwt expired"))) {
          await this.authenticate();
        } else throw e;
      }
    }
  }

  async getUserOrders(_market: IMarket) {
    if (!this.isSetup) await this.setup();

    while (true) {
      try {
        const { userOrders } = await graphqlFetch<{ userOrders: IOrder[] }>(
          this.apiHost,
          `
            query GetUserOrders($slug: String!) {
              userOrders(marketSlug: $slug) {
                uid
                longPrice
                longSide
                tokenAmount
                tokenAmountFilled
                status
              }
            }`,
          { slug: _market.slug },
          this.jwt
        );
        return userOrders;
      } catch (e) {
        if (some(e.errors, (err: any) => err.message.match("jwt expired"))) {
          await this.authenticate();
        } else throw e;
      }
    }
  }

  async getOrderBook(_market: IMarket) {
    const { market } = await graphqlFetch<{ market: IMarket }>(
      this.apiHost,
      `
      query GetMarket($slug: String!) {
        market(slug: $slug) {
          orders {
            longPrice
            longSide
            tokenAmount
            tokenAmountFilled
          }
        }
      }`,
      { slug: _market.slug }
    );
    return market.orders;
  }

  async getDataFeed(_dataFeedSlug: string, _scope: "day" | "month" = "month") {
    const { dataFeed } = await graphqlFetch<{ dataFeed: IDataFeed }>(
      this.feedsApiHost,
      `
      query GetVeilDataFeed($name: String!, $scope: DataFeedScope)  {
        dataFeed(name: $name) {
          uid
          name
          description
          denomination
          entries(scope: $scope) {
            value
            timestamp
          }
        }
      }`,
      { name: _dataFeedSlug, scope: _scope }
    );
    return dataFeed;
  }

  getScalarRange(_market: IMarket): [number, number] {
    if (!_market.minPrice || !_market.maxPrice)
      throw new Error("Market does not have min and max price");
    return [
      fromWei(_market.minPrice).toNumber(),
      fromWei(_market.maxPrice).toNumber()
    ];
  }

  async getMarket(_slug: string) {
    const { market } = await graphqlFetch<{ market: IMarket }>(
      this.apiHost,
      `
      query GetMarket($slug: String!) {
        market(slug: $slug) {
          slug
          uid
          endsAt
          minPrice
          maxPrice
          shortToken
          longToken
          numTicks
          index
          limitPrice
        }
      }`,
      { slug: _slug }
    );
    if (!market) throw new Error(`Market not found: ${_slug}`);
    return market;
  }

  protected async getTakerAddress() {
    const { takerAddress } = await graphqlFetch<{ takerAddress: string }>(
      this.apiHost,
      `
      query GetTakerAddress {
        takerAddress
      }`
    );
    this.takerAddress = takerAddress;
    return true;
  }
}
