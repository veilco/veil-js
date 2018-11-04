import { Provider } from "@0xproject/order-utils";
import { Web3Wrapper } from "@0xproject/web3-wrapper";
import graphqlFetch from "./graphqlFetch";
import { utils } from "ethers";

const CreateSessionChallenge = `
  mutation CreateSessionChallenge {
    createSessionChallenge {
      uid
    }
  }
`;

const CreateSession = `
  mutation CreateSession($signature: String!, $challengeUid: String!) {
    createSession(signature: $signature, challengeUid: $challengeUid, message: $challengeUid) {
      token
    }
  }
`;

export default async function authenticate(
  provider: Provider,
  apiHost: string,
  address: string
) {
  const web3 = new Web3Wrapper(provider);
  const { createSessionChallenge } = await graphqlFetch<{
    createSessionChallenge: { uid: string };
  }>(apiHost, CreateSessionChallenge);
  const signature = await web3.signMessageAsync(
    address,
    utils.hexlify(utils.toUtf8Bytes(createSessionChallenge.uid))
  );

  const { createSession } = await graphqlFetch<{
    createSession: { token: string };
  }>(apiHost, CreateSession, {
    signature,
    challengeUid: createSessionChallenge.uid
  });
  return createSession.token;
}
