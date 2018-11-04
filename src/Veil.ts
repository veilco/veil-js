require("babel-polyfill");
import some = require("lodash/some");
import getProvider from "./provider";
import { BigNumber } from "@0xproject/utils";
import { Provider, Order as ZeroExOrder } from "@0xproject/order-utils";
import authenticate from "./auth";
import graphqlFetch from "./graphqlFetch";
import { signOrder } from "./0x";

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
    console.log("ADDRESS", this.address);
    this.jwt = await authenticate(this.provider, this.apiHost, this.address);
    return true;
  }

  async setMarket(marketSlug: string) {
    this.marketSlug = marketSlug;
    this.market = await this.getMarket();
  }

  async createOrder(quote: IQuote, options: { postOnly?: boolean } = {}) {
    this.requireMarket();
    if (!this.isSetup) await this.setup();

    const signedOrder = await signOrder(this.provider, quote.zeroExOrder);
    const params = {
      zeroExOrder: signedOrder,
      quoteUid: quote.uid,
      ...options
    };
    while (true) {
      try {
        const { createOrderFromQuote } = await graphqlFetch<{
          createOrderFromQuote: IOrder;
        }>(
          this.apiHost,
          `
          mutation CreateOrder($params: CreateOrderFromQuoteInput!) {
            createOrderFromQuote(params: $params) {
              uid
              status
              tokenAmount
              tokenAmountFilled
            }
          }`,
          { params },
          this.jwt
        );
        return createOrderFromQuote;
      } catch (e) {
        if (some(e.errors, (err: any) => err.message.match("jwt expired"))) {
          await this.authenticate();
        } else throw e;
      }
    }
  }

  async createQuote(
    side: "buy" | "sell",
    tokenType: "long" | "short",
    amount: number | BigNumber,
    price: number | BigNumber
  ) {
    this.requireMarket();
    if (!this.isSetup) await this.setup();

    const zero = new BigNumber(0);
    const numTicks = new BigNumber(this.market.numTicks);
    if (typeof amount === "number")
      amount = toShares(amount, this.market.numTicks);
    if (typeof price === "number")
      price = new BigNumber(price.toString()).mul(numTicks);

    if (price.lt(zero)) price = zero;
    if (price.gt(numTicks)) price = numTicks;
    price = price.round();
    const token =
      tokenType === "long" ? this.market.longToken : this.market.shortToken;

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
    this.requireMarket();
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

  async getUserOrders() {
    this.requireMarket();
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
          { slug: this.marketSlug },
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

  async getOrderBook() {
    this.requireMarket();
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
      { slug: this.marketSlug }
    );
    return market.orders;
  }

  async getDataFeed() {
    this.requireMarket();
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
      { name: this.market.index, scope: "month" }
    );
    return dataFeed;
  }

  getRange(): [number, number] {
    return [
      fromWei(this.market.minPrice).toNumber(),
      fromWei(this.market.maxPrice).toNumber()
    ];
  }

  async getMarket() {
    if (!this.marketSlug) throw new Error("Market slug not set");
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
      { slug: this.marketSlug }
    );
    if (!market) throw new Error("Market not found: " + this.marketSlug);
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

  protected requireMarket() {
    if (!this.market)
      throw new Error("You must set a market before calling this method");
  }
}
