import { type MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import { type FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import { type FaceTokenPrivateState } from 'facetoken-contract';

export const facetokenPrivateStateKey = 'facetokenPrivateState';
export type PrivateStateId = typeof facetokenPrivateStateKey;

export type FaceTokenCircuitKeys = 'mint' | 'verifyHuman';
export type FaceTokenProviders = MidnightProviders<FaceTokenCircuitKeys, PrivateStateId, FaceTokenPrivateState>;
export type DeployedFaceTokenContract = FoundContract<any>;

export interface FaceTokenEntry {
  readonly tokenId: number;
  readonly owner: string;
  readonly faceHash: string;
  readonly livenessScore: number;
}

export interface FaceTokenDerivedState {
  readonly tokenCount: number;
  readonly tokens: FaceTokenEntry[];
}
