export type FaceTokenPrivateState = {
  readonly faceVectorHash: Uint8Array;
  readonly livenessScore: bigint;
};

export const createFaceTokenPrivateState = (
  faceVectorHash: Uint8Array,
  livenessScore: bigint
): FaceTokenPrivateState => ({
  faceVectorHash,
  livenessScore,
});

export const createWitnesses = () => ({
  localFaceVectorHash: ({
    privateState,
  }: {
    privateState: FaceTokenPrivateState;
  }): [FaceTokenPrivateState, Uint8Array] => [privateState, privateState.faceVectorHash],
  localLivenessScore: ({
    privateState,
  }: {
    privateState: FaceTokenPrivateState;
  }): [FaceTokenPrivateState, bigint] => [privateState, privateState.livenessScore],
});
