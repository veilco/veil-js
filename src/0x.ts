import { BigNumber } from "@0x/utils";
import {
  signatureUtils,
  orderHashUtils,
  Order,
  SignedOrder
} from "@0x/order-utils";
import { Provider } from "ethereum-types";

export async function signOrder(
  provider: Provider,
  zeroExOrder: Order
): Promise<SignedOrder> {
  const orderHash = orderHashUtils.getOrderHashHex({
    ...zeroExOrder,
    expirationTimeSeconds: new BigNumber(zeroExOrder.expirationTimeSeconds),
    makerFee: new BigNumber(zeroExOrder.makerFee),
    makerAssetAmount: new BigNumber(zeroExOrder.makerAssetAmount),
    salt: new BigNumber(zeroExOrder.salt),
    takerFee: new BigNumber(zeroExOrder.takerFee),
    takerAssetAmount: new BigNumber(zeroExOrder.takerAssetAmount)
  });
  const signature = await signatureUtils.ecSignHashAsync(
    provider,
    orderHash,
    zeroExOrder.makerAddress
  );

  // Append signature to order
  const signedOrder = {
    ...zeroExOrder,
    signature
  };
  return signedOrder;
}
