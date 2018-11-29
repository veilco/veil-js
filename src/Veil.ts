require("babel-polyfill");
const { camelizeKeys } = require("humps");
import some = require("lodash/some");
import getProvider from "./provider";
import { BigNumber } from "@0xproject/utils";
import { Provider, Order as ZeroExOrder } from "@0xproject/order-utils";
import authenticate from "./auth";
import graphqlFetch from "./graphqlFetch";
import { signOrder } from "./0x";
import fetch from "node-fetch";
import { VeilError } from "./errors";

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
  type: string;
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

export function encodeParams(params: Object) {
  return Object.entries(params)
    .map(kv => kv.map(encodeURIComponent).join("="))
    .join("&");
}

export default class Veil {
  provider: Provider;
  apiHost: string;
  address: string;
  jwt: string;
  marketSlug: string;
  market: IMarket;
  isSetup = false;

  constructor(
    jsonRpcUrl: string,
    mnemonic: string,
    address: string,
    apiHost: string = API_HOST_DEFAULT
  ) {
    this.provider = getProvider(mnemonic, jsonRpcUrl);
    this.address = address.toLowerCase();
    this.apiHost = apiHost;
  }

  async fetch(
    url: string,
    params: any = {},
    method: "POST" | "GET" | "DELETE" = "GET"
  ) {
    if (method === "GET") url = url + "?" + encodeParams(params);
    const response = await fetch(url, {
      method,
      body: method !== "GET" ? JSON.stringify(params) : undefined,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(this.jwt ? { Authorization: `Bearer ${this.jwt}` } : {})
      }
    });
    const json = await response.json();
    if (json.errors) console.error(url);
    if (json.errors) throw new VeilError(json.errors);
    return camelizeKeys(json.data);
  }

  async setup() {
    if (!this.jwt) await this.authenticate();
    this.isSetup = true;
  }

  async authenticate() {
    this.jwt = await authenticate(this.provider, this.apiHost, this.address);
    return true;
  }

  async getMarkets(
    filter: { index?: string; status?: "open" | "resolved" } = {}
  ) {
    let url = `${this.apiHost}/api/v1/markets`;
    const params: { index?: string; status?: "open" | "resolved" } = {};
    if (filter.index) params.index = filter.index;
    if (filter.status) params.status = filter.status;
    return await this.fetch(url, params);
  }

  async createOrder(quote: IQuote, options: { postOnly?: boolean } = {}) {
    if (!this.isSetup) await this.setup();

    const signedOrder = await signOrder(this.provider, quote.zeroExOrder);
    const params = {
      order: {
        zeroExOrder: signedOrder,
        quoteUid: quote.uid,
        ...options
      }
    };
    while (true) {
      try {
        const url = `${this.apiHost}/api/v1/orders`;
        const order: IOrder = await this.fetch(url, params, "POST");
        return order;
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
      quote: {
        side,
        token,
        tokenAmount: amount.toString(),
        price: price.toString(),
        type: "limit"
      }
    };

    while (true) {
      try {
        const url = `${this.apiHost}/api/v1/quotes`;
        const quote: IQuote = await this.fetch(url, params, "POST");
        return quote;
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
        const url = `${this.apiHost}/api/v1/orders/${uid}`;
        const order: IOrder = await this.fetch(url, {}, "DELETE");
        return order;
      } catch (e) {
        if (some(e.errors, (err: any) => err.message.match("jwt expired"))) {
          await this.authenticate();
        } else throw e;
      }
    }
  }

  async getUserOrders(market: IMarket) {
    if (!this.isSetup) await this.setup();

    while (true) {
      try {
        const url = `${this.apiHost}/api/v1/orders`;
        const orders: IOrder[] = await this.fetch(url, { market: market.slug });
        return orders;
      } catch (e) {
        if (some(e.errors, (err: any) => err.message.match("jwt expired"))) {
          await this.authenticate();
        } else throw e;
      }
    }
  }

  async getOrderBook(market: IMarket) {
    const url = `${this.apiHost}/api/v1/markets/${market.slug}/orders`;
    const orders: IOrder[] = await this.fetch(url);
    return orders;
  }

  async getDataFeed(_dataFeedSlug: string, _scope: "day" | "month" = "month") {
    const { dataFeed } = await graphqlFetch<{ dataFeed: IDataFeed }>(
      this.apiHost,
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

  async getMarket(slug: string) {
    const url = `${this.apiHost}/api/v1/markets/${slug}`;
    const market: IMarket = await this.fetch(url);
    if (!market) throw new Error(`Market not found: ${slug}`);
    return market;
  }
}
