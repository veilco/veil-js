import { BigNumber } from "@0xproject/utils";
import {
  signatureUtils,
  SignerType,
  orderHashUtils,
  Order,
  SignedOrder,
  Provider
} from "@0xproject/order-utils";

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
  const signature = await signatureUtils.ecSignOrderHashAsync(
    provider,
    orderHash,
    zeroExOrder.makerAddress,
    SignerType.Default // TODO: support other signatures?
  );

  // Append signature to order
  const signedOrder = {
    ...zeroExOrder,
    signature
  };
  return signedOrder;
}
