import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  localFaceVectorHash(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  localLivenessScore(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
}

export type ImpureCircuits<PS> = {
  mint(context: __compactRuntime.CircuitContext<PS>,
       to_0: { is_left: boolean,
               left: { bytes: Uint8Array },
               right: { bytes: Uint8Array }
             }): __compactRuntime.CircuitResults<PS, bigint>;
  verifyHuman(context: __compactRuntime.CircuitContext<PS>, tokenId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  mint(context: __compactRuntime.CircuitContext<PS>,
       to_0: { is_left: boolean,
               left: { bytes: Uint8Array },
               right: { bytes: Uint8Array }
             }): __compactRuntime.CircuitResults<PS, bigint>;
  verifyHuman(context: __compactRuntime.CircuitContext<PS>, tokenId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  mint(context: __compactRuntime.CircuitContext<PS>,
       to_0: { is_left: boolean,
               left: { bytes: Uint8Array },
               right: { bytes: Uint8Array }
             }): __compactRuntime.CircuitResults<PS, bigint>;
  verifyHuman(context: __compactRuntime.CircuitContext<PS>, tokenId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  tokens: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): { tokenId: bigint,
                             owner: { is_left: boolean,
                                      left: { bytes: Uint8Array },
                                      right: { bytes: Uint8Array }
                                    },
                             faceHash: Uint8Array,
                             livenessScore: bigint
                           };
    [Symbol.iterator](): Iterator<[bigint, { tokenId: bigint,
  owner: { is_left: boolean,
           left: { bytes: Uint8Array },
           right: { bytes: Uint8Array }
         },
  faceHash: Uint8Array,
  livenessScore: bigint
}]>
  };
  faceHashes: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  readonly nextTokenId: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
