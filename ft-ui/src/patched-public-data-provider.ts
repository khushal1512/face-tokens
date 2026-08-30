import { ContractState } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { LedgerParameters, ZswapChainState } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import type { PublicDataProvider } from '@midnight-ntwrk/midnight-js-types';
import { utils } from 'facetoken-api';

/**
 * The hosted preview and preprod indexers reject `contractAction` queries that
 * carry no offset, which is exactly what the SDK sends when asked for "latest".
 * Every read path that omits a config therefore has to go through a hand-written
 * query instead. Calls that do pass a config hit the SDK path unchanged.
 */
export function createPatchedPublicDataProvider(
  queryUrl: string,
  subscriptionUrl: string,
): PublicDataProvider {
  const base = indexerPublicDataProvider(queryUrl, subscriptionUrl);

  return {
    ...base,

    async queryContractState(contractAddress: string, config?: any) {
      if (config) return base.queryContractState(contractAddress, config);
      const action = await latestContractAction(queryUrl, contractAddress, 'state');
      return action ? ContractState.deserialize(utils.fromHex(action.state)) : null;
    },

    async queryZSwapAndContractState(contractAddress: string, config?: any) {
      if (config) return base.queryZSwapAndContractState(contractAddress, config);
      const action = await latestContractAction(
        queryUrl,
        contractAddress,
        'state zswapState transaction { block { ledgerParameters } }',
      );
      if (!action?.zswapState) return null;
      const params = action.transaction?.block?.ledgerParameters;
      return [
        ZswapChainState.deserialize(utils.fromHex(action.zswapState)),
        ContractState.deserialize(utils.fromHex(action.state)),
        params ? LedgerParameters.deserialize(utils.fromHex(params)) : LedgerParameters.initialParameters(),
      ] as [ZswapChainState, ContractState, LedgerParameters];
    },

    async queryUnshieldedBalances(contractAddress: string, config?: any) {
      if (config) return base.queryUnshieldedBalances(contractAddress, config);
      const action = await latestContractAction(
        queryUrl,
        contractAddress,
        `... on ContractDeploy { unshieldedBalances { tokenType amount } }
         ... on ContractCall   { unshieldedBalances { tokenType amount } }
         ... on ContractUpdate { unshieldedBalances { tokenType amount } }`,
      );
      if (!action) return null;
      const raw: Array<{ tokenType: string; amount: string }> = action.unshieldedBalances ?? [];
      return raw.map((e) => ({ tokenType: e.tokenType, balance: BigInt(e.amount) }));
    },
  };
}

async function latestContractAction(
  queryUrl: string,
  address: string,
  selection: string,
): Promise<any | null> {
  const data = await gqlQuery(
    queryUrl,
    `query LatestContractAction($address: HexEncoded!) {
       contractAction(address: $address) { ${selection} }
     }`,
    { address },
  );
  return data?.contractAction ?? null;
}

export async function gqlQuery(
  url: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Indexer returned HTTP ${res.status}`);
  const payload = await res.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((e: any) => e.message).join('; '));
  }
  return payload.data;
}
