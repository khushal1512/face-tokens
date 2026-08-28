import { CompiledContract } from '@midnight-ntwrk/compact-js';

export * as FaceToken from '../managed/facetoken/contract/index.js';
export { createWitnesses, createFaceTokenPrivateState } from './witnesses.js';
export type { FaceTokenPrivateState } from './witnesses.js';

import * as FaceTokenContract from '../managed/facetoken/contract/index.js';
import { createWitnesses } from './witnesses.js';

export const CompiledFaceTokenContract = CompiledContract.make(
  'facetoken',
  FaceTokenContract.Contract,
).pipe(
  CompiledContract.withWitnesses(createWitnesses()),
  CompiledContract.withCompiledFileAssets('./managed/facetoken'),
);
