import { useState, useEffect, useCallback, useRef } from 'react';
import { ContractState } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { FaceToken } from 'facetoken-contract';
import { utils, type FaceTokenEntry } from 'facetoken-api';
import { gqlQuery } from '../patched-public-data-provider';

const INDEXER_URL =
  import.meta.env.VITE_INDEXER_URL ?? 'https://indexer.preprod.midnight.network/api/v4/graphql';

const CONTRACT_STATE_QUERY = `
  query ContractState($address: HexEncoded!) {
    contractAction(address: $address) { state }
  }
`;

const CONTRACT_ADDRESS_RE = /^[0-9a-fA-F]{64}$/;

/**
 * Read-only view of the token ledger. Deliberately independent of the wallet
 * session so the list renders before anyone connects.
 */
export function useFaceToken(contractAddress: string | null, refreshInterval = 10_000) {
  const [tokens, setTokens] = useState<FaceTokenEntry[]>([]);
  const [tokenCount, setTokenCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!contractAddress || !CONTRACT_ADDRESS_RE.test(contractAddress)) {
      setTokens([]);
      setTokenCount(0);
      setError(null);
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const data = await gqlQuery(INDEXER_URL, CONTRACT_STATE_QUERY, { address: contractAddress });
      const stateHex = data?.contractAction?.state;
      if (!stateHex) throw new Error('This contract has not been indexed yet.');

      const ledger = FaceToken.ledger(ContractState.deserialize(utils.fromHex(stateHex)).data);
      const parsed: FaceTokenEntry[] = [];
      for (const [tokenId, entry] of ledger.tokens) {
        parsed.push({
          tokenId: Number(tokenId),
          owner: utils.formatAddress(entry.owner),
          faceHash: utils.toHex(entry.faceHash),
          livenessScore: Number(entry.livenessScore),
        });
      }
      parsed.sort((a, b) => b.tokenId - a.tokenId);

      setTokens(parsed);
      setTokenCount(Number(ledger.nextTokenId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the contract ledger.');
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [contractAddress]);

  useEffect(() => {
    void refresh();
    if (!contractAddress) return;
    const id = setInterval(() => void refresh(), refreshInterval);
    return () => clearInterval(id);
  }, [contractAddress, refreshInterval, refresh]);

  return { tokens, tokenCount, loading, error, refresh };
}
