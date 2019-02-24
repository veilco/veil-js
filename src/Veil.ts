const { camelizeKeys } = require("humps");
import some = require("lodash/some");
import getProvider from "./provider";
import { BigNumber } from "@0x/utils";
import { Order as ZeroExOrder } from "@0x/order-utils";
import { Provider } from "ethereum-types";
import { signOrder } from "./0x";
import fetch from "node-fetch";
import { VeilError } from "./errors";
import { Web3Wrapper } from "@0x/web3-wrapper";
import { utils } from "ethers";

export interface Market {
  slug: string;
  uid: string;
  endsAt: number;
  shortToken: string;
  longToken: string;
  numTicks: string;
  minPrice: string;
  maxPrice: string;
  orders?: Order[];
  index: string;
  limitPrice: string;
  type: string;
  channel: string;
}

export interface Order {
  uid: string;
  price: string;
  side: "buy" | "sell";
  tokenAmount: string;
  tokenAmountUnfilled: string;
  status: "open" | "filled" | "canceled";
  tokenType: "short" | "long";
  fills: PartialOrderFill[];
}

export interface PartialOrderFill {
  uid: string;
  createdAt: string;
  status: "pending" | "completed" | "failed";
  tokenAmount: string;
}

export interface OrderFill {
  uid: string;
  price: string;
  side: "buy" | "sell";
  tokenAmount: string;
  status: "pending" | "completed";
  createdAt: number;
}

export interface OrderBookRow {
  price: string;
  tokenAmount: string;
}

export interface Quote {
  uid: string;
  zeroExOrder: ZeroExOrder;
}

export interface DataFeedEntry {
  value: string;
  timestamp: number;
}

export interface DataFeed {
  uid: string;
  name: string;
  description: string;
  denomination: string;
  entries: DataFeedEntry[];
}

export interface Page<T> {
  results: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface MarketBalances {
  longBalance: string;
  shortBalance: string;
  longBalanceClean: string;
  shortBalanceClean: string;
  veilEtherBalance: string;
  etherBalance: string;
}

const API_HOST_DEFAULT = "https://api.kovan.veil.market";

const TEN_18 = new BigNumber(10).pow(18);
export function toWei(amount: number) {
  return new BigNumber(amount.toString()).times(TEN_18);
}

export function fromWei(amount: BigNumber | string) {
  return new BigNumber(amount.toString()).div(TEN_18);
}

export function toShares(amount: number, numTicks: string | number) {
  return new BigNumber(amount.toString())
    .times(TEN_18)
    .div(new BigNumber(numTicks));
}

export function fromShares(
  amount: BigNumber | string,
  numTicks: string | number
) {
  return new BigNumber(amount.toString())
    .times(new BigNumber(numTicks))
    .div(TEN_18);
}

export function encodeParams(params: Object) {
  return Object.entries(params)
    .map(kv => kv.map(encodeURIComponent).join("="))
    .join("&");
}

interface VeilOptions {
  mnemonic?: string;
  address?: string;
  apiHost?: string;
  provider?: Provider;
}

const defaultOptions: Partial<VeilOptions> = {
  apiHost: API_HOST_DEFAULT
};

export default class Veil {
  provider: Provider;
  apiHost: string;
  address: string;
  jwt: string;
  isSetup = false;

  constructor(
    mnemonicOrOptions?: string | VeilOptions,
    address?: string,
    apiHost: string = API_HOST_DEFAULT
  ) {
    if (mnemonicOrOptions) {
      if (typeof mnemonicOrOptions === "string") {
        this.provider = getProvider(mnemonicOrOptions);
      } else if (typeof mnemonicOrOptions === "object") {
        // We have an options object
        const options = { ...defaultOptions, ...mnemonicOrOptions };
        if (options.mnemonic) this.provider = getProvider(options.mnemonic);
        if (options.provider) this.provider = options.provider;
        if (options.address) this.address = options.address;
        if (options.apiHost) this.apiHost = options.apiHost;
      } else {
        throw new Error("Invalid options object passed to Veil()");
      }
    }
    if (address) {
      console.warn(
        "Passing an address as the second argument to Veil() is deprecated. Please use the options object instead."
      );
      this.address = address.toLowerCase();
    }
    if (apiHost) {
      console.warn(
        "Passing an apiHost as the third argument to Veil() is deprecated. Please use the options object instead."
      );
      this.apiHost = apiHost;
    }
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
    if (json.errors) throw new VeilError(json.errors, url);
    return camelizeKeys(json.data);
  }

  async retry<T>(func: () => Promise<T>) {
    while (true) {
      try {
        const result = await func();
        return result;
      } catch (e) {
        if (some(e.errors, (err: any) => err.message.match("jwt expired"))) {
          await this.authenticate();
        } else {
          throw e;
        }
      }
    }
  }

  async setup() {
    if (!this.jwt) await this.authenticate();
    this.isSetup = true;
  }

  async authenticate() {
    if (!this.provider || !this.address)
      throw new VeilError([
        "You tried calling an authenticated method without passing an address and a mnemonic or provider to the Veil constructor"
      ]);
    const challenge = await this.createSessionChallenge();
    const web3 = new Web3Wrapper(this.provider);
    const signature = await web3.signMessageAsync(
      this.address,
      utils.hexlify(utils.toUtf8Bytes(challenge.uid))
    );
    const session = await this.createSession({
      signature,
      challengeUid: challenge.uid,
      message: challenge.uid
    });
    this.jwt = session.token;
    return true;
  }

  async createSessionChallenge() {
    const url = `${this.apiHost}/api/v1/session_challenges`;
    const challenge: { uid: string } = await this.fetch(url, {}, "POST");
    return challenge;
  }

  async createSession(params: {
    challengeUid: string;
    signature: string;
    message: string;
  }) {
    const url = `${this.apiHost}/api/v1/sessions`;
    const session: { token: string } = await this.fetch(url, params, "POST");
    return session;
  }

  async getMarkets(
    params: {
      channel?: string;
      status?: "open" | "resolved";
      page?: number;
    } = {}
  ) {
    const url = `${this.apiHost}/api/v1/markets`;
    const page: Page<Market> = await this.fetch(url, params);
    return page;
  }

  async createOrder(quote: Quote, options: { postOnly?: boolean } = {}) {
    if (!this.isSetup) await this.setup();

    const signedOrder = await signOrder(this.provider, quote.zeroExOrder);
    const params = {
      order: {
        zeroExOrder: signedOrder,
        quoteUid: quote.uid,
        ...options
      }
    };

    const url = `${this.apiHost}/api/v1/orders`;
    const order: Order = await this.retry(() =>
      this.fetch(url, params, "POST")
    );
    return order;
  }

  async createQuote(
    market: Market,
    side: "buy" | "sell",
    tokenType: "long" | "short",
    amount: number | BigNumber,
    price: number | BigNumber
  ) {
    if (!this.isSetup) await this.setup();

    const zero = new BigNumber(0);
    const numTicks = new BigNumber(market.numTicks);
    if (typeof amount === "number") amount = toShares(amount, market.numTicks);
    amount = amount.decimalPlaces(0);

    if (typeof price === "number")
      price = new BigNumber(price.toString()).times(numTicks);
    if (price.lt(zero)) price = zero;
    if (price.gt(numTicks)) price = numTicks;
    price = price.decimalPlaces(0);

    const token = tokenType === "long" ? market.longToken : market.shortToken;

    const params = {
      quote: {
        side,
        token,
        tokenAmount: amount.toString(),
        price: price.toString(),
        type: "limit"
      }
    };

    const url = `${this.apiHost}/api/v1/quotes`;
    const quote: Quote = await this.retry(() =>
      this.fetch(url, params, "POST")
    );
    return quote;
  }

  async cancelOrder(uid: string) {
    if (!this.isSetup) await this.setup();

    const url = `${this.apiHost}/api/v1/orders/${uid}`;
    const order: Order = await this.retry(() => this.fetch(url, {}, "DELETE"));
    return order;
  }

  async getUserOrders(
    market: Market,
    options?: {
      page?: number;
      status?: "open" | "filled" | "canceled" | "expired";
    }
  ) {
    if (!this.isSetup) await this.setup();

    const url = `${this.apiHost}/api/v1/orders`;
    const page: Page<Order> = await this.retry(() =>
      this.fetch(url, {
        ...options,
        market: market.slug
      })
    );
    return page;
  }

  async getBids(
    market: Market,
    tokenType: "long" | "short",
    options?: { page?: number }
  ) {
    if (tokenType !== "long" && tokenType !== "short")
      throw new Error(
        `Invalid tokenType: "${tokenType}". Must be either "long" or "short".`
      );
    const url = `${this.apiHost}/api/v1/markets/${
      market.slug
    }/${tokenType}/bids`;
    const page: Page<OrderBookRow> = await this.fetch(url, options);
    return page;
  }

  async getAsks(
    market: Market,
    tokenType: "long" | "short",
    options?: { page?: number }
  ) {
    if (tokenType !== "long" && tokenType !== "short")
      throw new Error(
        `Invalid tokenType: "${tokenType}". Must be either "long" or "short".`
      );
    const url = `${this.apiHost}/api/v1/markets/${
      market.slug
    }/${tokenType}/asks`;
    const page: Page<OrderBookRow> = await this.fetch(url, options);
    return page;
  }

  async getOrderFills(
    market: Market,
    tokenType: "long" | "short",
    options?: { page?: number }
  ) {
    if (tokenType !== "long" && tokenType !== "short")
      throw new Error(
        `Invalid tokenType: "${tokenType}". Must be either "long" or "short".`
      );
    const url = `${this.apiHost}/api/v1/markets/${
      market.slug
    }/${tokenType}/order_fills`;
    const page: Page<OrderFill> = await this.fetch(url, options);
    return page;
  }

  async getDataFeed(dataFeedSlug: string, scope: "day" | "month" = "month") {
    const url = `${this.apiHost}/api/v1/data_feeds/${dataFeedSlug}`;
    const params = { scope };
    const dataFeed: DataFeed = await this.fetch(url, params);
    return dataFeed;
  }

  getScalarRange(market: Market): [number, number] {
    if (!market.minPrice || !market.maxPrice)
      throw new Error("Market does not have min and max price");
    return [
      fromWei(market.minPrice).toNumber(),
      fromWei(market.maxPrice).toNumber()
    ];
  }

  async getMarket(slug: string) {
    const url = `${this.apiHost}/api/v1/markets/${slug}`;
    const market: Market = await this.fetch(url);
    if (!market) throw new Error(`Market not found: ${slug}`);
    return market;
  }

  async getMarketBalances(market: Market) {
    if (!this.isSetup) await this.setup();
    const url = `${this.apiHost}/api/v1/markets/${market.slug}/balances`;
    const balances: MarketBalances = await this.retry(() => this.fetch(url));
    return balances;
  }
}
