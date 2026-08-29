import { useState, useEffect, useCallback } from 'react';
import { ContractState } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { FaceToken } from 'facetoken-contract';
import { utils } from 'facetoken-api';

const INDEXER_URL = import.meta.env.VITE_INDEXER_URL ?? 'https://indexer.preprod.midnight.network/api/v4/graphql';

const CONTRACT_STATE_QUERY = `
  query ContractState($address: HexEncoded!) {
    contractAction(address: $address) {
      state
    }
  }
`;

export interface FaceTokenEntry {
  tokenId: number;
  owner: string;
  faceHash: string;
  livenessScore: number;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

export function useFaceToken(contractAddress: string | null, refreshInterval = 10_000) {
  const [tokens, setTokens] = useState<FaceTokenEntry[]>([]);
  const [tokenCount, setTokenCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFaceTokens = useCallback(async () => {
    if (!contractAddress || !/^[0-9a-fA-F]{64}$/.test(contractAddress)) return;

    try {
      setLoading(true);
      const res = await fetch(INDEXER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: CONTRACT_STATE_QUERY, variables: { address: contractAddress } }),
      });

      const gql = await res.json();
      if (gql.errors) {
        throw new Error(gql.errors[0]?.message ?? 'Indexer query failed');
      }

      const stateHex = gql.data?.contractAction?.state;
      if (!stateHex) {
        throw new Error('Contract not found');
      }

      const contractState = ContractState.deserialize(hexToBytes(stateHex));
      const ledgerState = FaceToken.ledger(contractState.data);

      const parsed: FaceTokenEntry[] = [];
      for (const [key, entry] of ledgerState.tokens) {
        parsed.push({
          tokenId: Number(key),
          owner: utils.formatAddress(entry.owner),
          faceHash: utils.toHex(entry.faceHash),
          livenessScore: Number(entry.livenessScore),
        });
      }

      setTokens(parsed);
      setTokenCount(Number(ledgerState.nextTokenId));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [contractAddress]);

  useEffect(() => {
    fetchFaceTokens();
  }, [fetchFaceTokens]);

  useEffect(() => {
    if (!contractAddress) return;
    const interval = setInterval(fetchFaceTokens, refreshInterval);
    return () => clearInterval(interval);
  }, [contractAddress, refreshInterval, fetchFaceTokens]);

  return { tokens, tokenCount, loading, error, refresh: fetchFaceTokens };
}
