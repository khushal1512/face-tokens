import { FaceToken, CompiledFaceTokenContract, createFaceTokenPrivateState } from 'facetoken-contract';
import { type ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { type Logger } from 'pino';
import {
  type FaceTokenDerivedState,
  type FaceTokenEntry,
  type FaceTokenProviders,
  type DeployedFaceTokenContract,
  facetokenPrivateStateKey,
} from './common-types.js';
import * as utils from './utils/index.js';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { map, type Observable } from 'rxjs';

export class FaceTokenAPI {
  private constructor(
    public readonly deployedContract: DeployedFaceTokenContract,
    providers: FaceTokenProviders,
    private readonly logger?: Logger,
  ) {
    this.deployedContractAddress = deployedContract.deployTxData.public.contractAddress;
    providers.privateStateProvider.setContractAddress(this.deployedContractAddress);

    this.state$ = providers.publicDataProvider
      .contractStateObservable(this.deployedContractAddress, { type: 'latest' })
      .pipe(
        map((contractState) => FaceToken.ledger(contractState.data)),
        map((ledgerState): FaceTokenDerivedState => {
          const tokens: FaceTokenEntry[] = [];
          for (const [key, entry] of ledgerState.tokens) {
            tokens.push({
              tokenId: Number(key),
              owner: utils.formatAddress(entry.owner),
              faceHash: utils.toHex(entry.faceHash),
              livenessScore: Number(entry.livenessScore),
            });
          }
          return { tokenCount: Number(ledgerState.nextTokenId), tokens };
        }),
      );
  }

  readonly deployedContractAddress: ContractAddress;
  readonly state$: Observable<FaceTokenDerivedState>;

  /** Mint a new FaceToken NFT */
  async mint(to: { is_left: boolean, left: { bytes: Uint8Array }, right: { bytes: Uint8Array } }): Promise<number> {
    const result = await (this.deployedContract as any).callTx.mint(to);
    return Number(result);
  }

  /** Deploy a new facetoken contract. */
  static async deploy(providers: FaceTokenProviders, faceVectorHash: Uint8Array, livenessScore: bigint, logger?: Logger): Promise<FaceTokenAPI> {
    const deployedContract = await deployContract(providers as any, {
      compiledContract: CompiledFaceTokenContract,
      privateStateId: facetokenPrivateStateKey,
      initialPrivateState: createFaceTokenPrivateState(faceVectorHash, livenessScore),
    });
    return new FaceTokenAPI(deployedContract, providers, logger);
  }

  /** Join an existing facetoken contract. */
  static async join(
    providers: FaceTokenProviders,
    contractAddress: ContractAddress,
    faceVectorHash: Uint8Array,
    livenessScore: bigint,
    logger?: Logger,
  ): Promise<FaceTokenAPI> {
    const deployedContract = await findDeployedContract(providers as any, {
      contractAddress,
      compiledContract: CompiledFaceTokenContract,
      privateStateId: facetokenPrivateStateKey,
      initialPrivateState: createFaceTokenPrivateState(faceVectorHash, livenessScore),
    });
    return new FaceTokenAPI(deployedContract, providers, logger);
  }
}

export * as utils from './utils/index.js';
export * from './common-types.js';
