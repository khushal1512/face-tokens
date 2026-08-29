import { FaceTokenAPI, type FaceTokenCircuitKeys, type FaceTokenProviders } from 'facetoken-api';
import { type ContractAddress, fromHex, toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { BehaviorSubject, catchError, concatMap, filter, firstValueFrom, interval, map, type Observable, take, throwError, timeout } from 'rxjs';
import { pipe as fnPipe } from 'fp-ts/function';
import { type Logger } from 'pino';
import { type ConnectedAPI, type InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import semver from 'semver';
import { Binding, type FinalizedTransaction, Proof, SignatureEnabled, Transaction, type TransactionId } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { type FaceTokenPrivateState } from 'facetoken-contract';
import { inMemoryPrivateStateProvider } from '../in-memory-private-state-provider.js';
import { type NetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import type { UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';

export type FaceTokenDeployment =
  | { readonly status: 'in-progress' }
  | { readonly status: 'deployed'; readonly api: FaceTokenAPI }
  | { readonly status: 'failed'; readonly error: Error };

export class BrowserFaceTokenManager {
  readonly #deploymentsSubject = new BehaviorSubject<Array<BehaviorSubject<FaceTokenDeployment>>>([]);
  #initializedProviders: Promise<FaceTokenProviders> | undefined;
  #providers: FaceTokenProviders | undefined;

  constructor(private readonly logger: Logger) {}

  readonly deployments$: Observable<Array<Observable<FaceTokenDeployment>>> = this.#deploymentsSubject;

  get providers(): FaceTokenProviders | undefined {
    return this.#providers;
  }

  resolve(contractAddress?: ContractAddress): Observable<FaceTokenDeployment> {
    // Ensure network ID is always set before any contract/ledger operation.
    const networkId = (import.meta.env.VITE_NETWORK_ID || 'preprod') as NetworkId;
    setNetworkId(networkId);

    const deployments = this.#deploymentsSubject.value;
    const existing = deployments.find(
      (d) => d.value.status === 'deployed' && d.value.api.deployedContractAddress === contractAddress,
    );
    if (existing) return existing;

    const dummyFaceHash = new Uint8Array(32);
    const dummyScore = 0n;

    const deployment = new BehaviorSubject<FaceTokenDeployment>({ status: 'in-progress' });
    if (contractAddress) {
      void this.run(deployment, (providers) => FaceTokenAPI.join(providers, contractAddress, dummyFaceHash, dummyScore, this.logger));
    } else {
      void this.run(deployment, (providers) => FaceTokenAPI.deploy(providers, dummyFaceHash, dummyScore, this.logger));
    }
    this.#deploymentsSubject.next([...deployments, deployment]);
    return deployment;
  }

  getProviders(walletId?: string): Promise<FaceTokenProviders> {
    if (!this.#initializedProviders) {
      this.#initializedProviders = initializeProviders(this.logger, walletId).then((provs) => {
        this.#providers = provs;
        return provs;
      });
    }
    return this.#initializedProviders;
  }

  resetProviders(): void {
    this.#initializedProviders = undefined;
    this.#providers = undefined;
  }

  private async run(
    deployment: BehaviorSubject<FaceTokenDeployment>,
    factory: (providers: FaceTokenProviders) => Promise<FaceTokenAPI>,
    walletId?: string
  ): Promise<void> {
    try {
      const providers = await this.getProviders(walletId);
      const api = await factory(providers);
      deployment.next({ status: 'deployed', api });
    } catch (error: unknown) {
      console.error('Contract operation failed:', error);
      let err: Error;
      if (error instanceof Error) {
        err = error;
      } else if (typeof error === 'string') {
        err = new Error(error);
      } else {
        err = new Error(JSON.stringify(error) || 'Unknown error during contract operation');
      }
      deployment.next({ status: 'failed', error: err });
    }
  }
}

// ── Provider initialization ────────────────────────────────────────────

const COMPATIBLE_CONNECTOR_API_VERSION = '4.x';

const initializeProviders = async (logger: Logger, walletId?: string): Promise<FaceTokenProviders> => {
  const networkId = import.meta.env.VITE_NETWORK_ID as NetworkId;
  setNetworkId(networkId);

  const connectedAPI = await connectToWallet(logger, networkId, walletId);
  const config = await connectedAPI.getConfiguration();
  const proofServerUri = config.proverServerUri!;
  const shieldedAddresses = await connectedAPI.getShieldedAddresses();
  const zkConfigProvider = new FetchZkConfigProvider<FaceTokenCircuitKeys>(window.location.origin, fetch.bind(window));

  return {
    privateStateProvider: inMemoryPrivateStateProvider<string, FaceTokenPrivateState>(),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(proofServerUri, zkConfigProvider),
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
    walletProvider: {
      getCoinPublicKey: () => shieldedAddresses.shieldedCoinPublicKey,
      getEncryptionPublicKey: () => shieldedAddresses.shieldedEncryptionPublicKey,
      balanceTx: async (tx: UnboundTransaction): Promise<FinalizedTransaction> => {
        const received = await connectedAPI.balanceUnsealedTransaction(toHex(tx.serialize()));
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>('signature', 'proof', 'binding', fromHex(received.tx));
      },
    },
    midnightProvider: {
      submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
        await connectedAPI.submitTransaction(toHex(tx.serialize()));
        return tx.identifiers()[0];
      },
    },
  };
};

// ── Wallet detection ───────────────────────────────────────────────────

export interface WalletInfo {
  id: string;
  name: string;
  apiVersion: string;
  api: InitialAPI;
}

export function getCompatibleWallets(): WalletInfo[] {
  if (!window.midnight) return [];
  return Object.entries(window.midnight)
    .filter(([_, wallet]) => !!wallet && typeof wallet === 'object' && 'apiVersion' in wallet)
    .map(([id, wallet]) => ({
      id,
      name: id === '1am' ? '1AM Wallet' : id === 'lace' ? 'Lace Wallet' : id.charAt(0).toUpperCase() + id.slice(1) + ' Wallet',
      apiVersion: (wallet as any).apiVersion,
      api: wallet as InitialAPI
    }));
}

const getWalletById = (walletId?: string): InitialAPI | undefined => {
  if (!window.midnight) return undefined;
  if (walletId && window.midnight[walletId]) {
    return window.midnight[walletId] as InitialAPI;
  }
  return Object.values(window.midnight).find(
    (wallet): wallet is InitialAPI =>
      !!wallet && typeof wallet === 'object' && 'apiVersion' in wallet &&
      semver.satisfies(wallet.apiVersion, COMPATIBLE_CONNECTOR_API_VERSION),
  );
};

const connectToWallet = (logger: Logger, networkId: string, walletId?: string): Promise<ConnectedAPI> =>
  firstValueFrom(
    fnPipe(
      interval(100),
      map(() => getWalletById(walletId)),
      filter((api): api is InitialAPI => !!api),
      take(1),
      timeout({ first: 5_000, with: () => throwError(() => new Error('Could not find compatible wallet.')) }),
      concatMap(async (initialAPI) => initialAPI.connect(networkId)),
      timeout({ first: 5_000, with: () => throwError(() => new Error('Wallet failed to respond.')) }),
      catchError((error) => throwError(() => error instanceof Error ? error : new Error('Wallet not authorized'))),
    ),
  );
