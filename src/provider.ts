import {
  Web3ProviderEngine,
  MnemonicWalletSubprovider
} from "@0xproject/subproviders";

export default function getProvider(mnemonic: string) {
  const provider = new Web3ProviderEngine();
  provider.addProvider(new MnemonicWalletSubprovider({ mnemonic }));

  // web3-provider-engine prevents requests from going out before you do this
  provider._ready.go();

  return provider;
}
