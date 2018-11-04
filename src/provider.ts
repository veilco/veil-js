import {
  Web3ProviderEngine,
  MnemonicWalletSubprovider,
  NonceTrackerSubprovider,
  RPCSubprovider
  // ErrorCallback,
  // Callback,
  // JSONRPCRequestPayload,
  // Subprovider
} from "@0xproject/subproviders";

export default function getProvider(mnemonic: string, jsonRpcUrl: string) {
  const provider = new Web3ProviderEngine();
  provider.addProvider(new MnemonicWalletSubprovider({ mnemonic }));
  provider.addProvider(new NonceTrackerSubprovider());
  provider.addProvider(new RPCSubprovider(jsonRpcUrl));

  // web3-provider-engine prevents requests from going out before you do this
  provider._ready.go();

  return provider;
}
