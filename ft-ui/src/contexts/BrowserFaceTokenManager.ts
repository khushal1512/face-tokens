import { FaceTokenAPI, facetokenPrivateStateKey, utils, type FaceTokenCircuitKeys, type FaceTokenProviders } from 'facetoken-api';
import { type ContractAddress, fromHex, toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { BehaviorSubject, type Observable } from 'rxjs';
import { type Logger } from 'pino';
import { type ConnectedAPI, type InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import semver from 'semver';
import { parseCoinPublicKeyToHex, parseEncPublicKeyToHex } from '@midnight-ntwrk/midnight-js-utils';
import { Binding, CostModel, type FinalizedTransaction, Proof, type ProvingProvider, SignatureEnabled, Transaction, type TransactionId } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { type FaceTokenPrivateState } from 'facetoken-contract';
import { inMemoryPrivateStateProvider } from '../in-memory-private-state-provider.js';
import { createPatchedPublicDataProvider } from '../patched-public-data-provider.js';
import { type NetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import type { ProofProvider, UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';

const COMPATIBLE_CONNECTOR_API_VERSION = '4.x';
const CONNECT_TIMEOUT_MS = 30_000;
const CONNECT_ATTEMPTS = 3;
/** Networks where 1AM sponsors fees, so no NIGHT and no DUST are needed. */
const SPONSORED_NETWORKS = new Set(['preview', 'mainnet']);
/** Errors worth retrying: the extension's worker often reports a stale state. */
const TRANSIENT_CONNECT_ERROR = /lock|not enabled|not ready|unauthori[sz]ed|no account|initiali/i;

export type FaceTokenDeployment =
  | { readonly status: 'in-progress' }
  | { readonly status: 'deployed'; readonly api: FaceTokenAPI }
  | { readonly status: 'failed'; readonly error: Error };

/** Everything a single wallet authorisation gives us. Built exactly once per connect. */
export interface WalletSession {
  readonly walletId: string;
  readonly api: ConnectedAPI;
  readonly networkId: NetworkId;
  readonly unshieldedAddress: string;
  readonly coinPublicKeyBytes: Uint8Array;
  readonly providers: FaceTokenProviders;
  /** Where proofs are generated. 'wallet' means nothing has to run locally. */
  readonly provingMode: 'wallet' | 'proof-server';
  readonly proverServerUri?: string;
  /** False on preview and mainnet, where 1AM pays the fees. */
  readonly feesSponsored: boolean;
  /** Undefined when the wallet refuses to report it. */
  readonly dustBalance?: bigint;
}

export class BrowserFaceTokenManager {
  readonly #deploymentsSubject = new BehaviorSubject<Array<BehaviorSubject<FaceTokenDeployment>>>([]);
  #session: Promise<WalletSession> | undefined;
  #resolved: WalletSession | undefined;

  constructor(private readonly logger: Logger) {}

  readonly deployments$: Observable<Array<Observable<FaceTokenDeployment>>> = this.#deploymentsSubject;

  get session(): WalletSession | undefined {
    return this.#resolved;
  }

  get providers(): FaceTokenProviders | undefined {
    return this.#resolved?.providers;
  }

  /**
   * Authorise the wallet and build the provider set. Memoised, so every later
   * caller reuses the same authorisation instead of triggering a second prompt.
   */
  connect(walletId?: string): Promise<WalletSession> {
    if (!this.#session) {
      this.#session = createWalletSession(this.logger, walletId)
        .then((session) => {
          this.#resolved = session;
          return session;
        })
        .catch((error: unknown) => {
          this.#session = undefined;
          throw error;
        });
    }
    return this.#session;
  }

  disconnect(): void {
    this.#session = undefined;
    this.#resolved = undefined;
    this.#deploymentsSubject.next([]);
  }

  /** Join an already deployed contract, or deploy a fresh one when no address is given. */
  resolve(contractAddress?: ContractAddress): Observable<FaceTokenDeployment> {
    const deployments = this.#deploymentsSubject.value;
    const existing = deployments.find(
      (d) => d.value.status === 'deployed' && d.value.api.deployedContractAddress === contractAddress,
    );
    if (contractAddress && existing) return existing;

    const deployment = new BehaviorSubject<FaceTokenDeployment>({ status: 'in-progress' });
    void this.run(deployment, contractAddress);
    this.#deploymentsSubject.next([...deployments, deployment]);
    return deployment;
  }

  private async run(
    deployment: BehaviorSubject<FaceTokenDeployment>,
    contractAddress?: ContractAddress,
  ): Promise<void> {
    try {
      const { providers } = await this.connect();
      // The circuit reads the face hash and liveness score out of private state,
      // which App writes before minting. Deploy and join only need a placeholder.
      const seedHash = new Uint8Array(32);
      const seedScore = 0n;
      const api = contractAddress
        ? await FaceTokenAPI.join(providers, contractAddress, seedHash, seedScore, this.logger)
        : await FaceTokenAPI.deploy(providers, seedHash, seedScore, this.logger);
      deployment.next({ status: 'deployed', api });
    } catch (error: unknown) {
      this.logger.error({ error }, 'contract operation failed');
      deployment.next({ status: 'failed', error: asError(error) });
    }
  }
}

function asError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);
  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error('Unknown error during contract operation');
  }
}

// ── Session construction ───────────────────────────────────────────────

const createWalletSession = async (logger: Logger, walletId?: string): Promise<WalletSession> => {
  const requestedNetwork = (import.meta.env.VITE_NETWORK_ID ?? 'preprod') as NetworkId;
  const wallet = findWallet(walletId);
  if (!wallet) {
    throw new Error(
      'No compatible Midnight wallet found. Install the 1AM wallet extension, or Lace with Midnight support, then reload.',
    );
  }

  const api = await connectWithRetry(wallet, requestedNetwork, logger);

  const [config, unshielded, shielded] = await Promise.all([
    api.getConfiguration(),
    api.getUnshieldedAddress(),
    api.getShieldedAddresses(),
  ]);

  // The wallet is the source of truth for which chain we are actually on.
  const networkId = (config.networkId ?? requestedNetwork) as NetworkId;
  if (networkId !== requestedNetwork) {
    logger.warn({ requestedNetwork, networkId }, 'wallet is on a different network than configured');
  }
  setNetworkId(networkId);

  const zkConfigProvider = new FetchZkConfigProvider<FaceTokenCircuitKeys>(
    window.location.origin,
    fetch.bind(window),
  );

  const { provider: proofProvider, mode: provingMode } = await resolveProofProvider(
    api,
    zkConfigProvider,
    config.proverServerUri,
    logger,
  );

  const feesSponsored = SPONSORED_NETWORKS.has(networkId);
  // On preprod the user funds their own fees, so knowing this up front lets the
  // UI say "you cannot mint yet" instead of failing inside the transaction.
  const dustBalance = feesSponsored ? undefined : await readDustBalance(api, logger);

  // Wallets hand these back bech32m encoded (mn_shield-cpk_...). The SDK and the
  // circuits both want plain hex, and decoding needs the network id, which is
  // why it happens here rather than in the api package.
  const coinPublicKeyHex = toHexKey(
    shielded.shieldedCoinPublicKey,
    (raw) => parseCoinPublicKeyToHex(raw, networkId),
    'coin public key',
  );
  const encryptionPublicKeyHex = toHexKey(
    shielded.shieldedEncryptionPublicKey,
    (raw) => parseEncPublicKeyToHex(raw, networkId),
    'encryption public key',
  );

  const providers: FaceTokenProviders = {
    privateStateProvider: inMemoryPrivateStateProvider<typeof facetokenPrivateStateKey, FaceTokenPrivateState>(),
    zkConfigProvider,
    proofProvider,
    publicDataProvider: createPatchedPublicDataProvider(config.indexerUri, config.indexerWsUri),
    walletProvider: {
      getCoinPublicKey: () => coinPublicKeyHex,
      getEncryptionPublicKey: () => encryptionPublicKeyHex,
      balanceTx: async (tx: UnboundTransaction): Promise<FinalizedTransaction> => {
        const balanced = await api.balanceUnsealedTransaction(toHex(tx.serialize()));
        if (!balanced?.tx) {
          throw new Error('The wallet could not fund this transaction. Check your DUST balance.');
        }
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
          'signature',
          'proof',
          'binding',
          fromHex(balanced.tx),
        );
      },
    },
    midnightProvider: {
      submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
        const result = await api.submitTransaction(toHex(tx.serialize()));
        return normaliseTxId(result) ?? tx.identifiers()[0];
      },
    },
  };

  return {
    walletId: wallet.id,
    api,
    networkId,
    unshieldedAddress: unshielded.unshieldedAddress,
    coinPublicKeyBytes: utils.fromHex(coinPublicKeyHex),
    providers,
    provingMode,
    proverServerUri: config.proverServerUri,
    feesSponsored,
    dustBalance,
  };
};

async function readDustBalance(api: ConnectedAPI, logger: Logger): Promise<bigint | undefined> {
  try {
    const { balance } = await api.getDustBalance();
    return balance;
  } catch (error) {
    logger.warn({ error }, 'wallet would not report a dust balance');
    return undefined;
  }
}

/**
 * Prefer proving inside the wallet. 1AM exposes `getProvingProvider`, which
 * routes to its ProofStation, so nobody has to run a proof server in Docker.
 * Wallets without it fall back to whatever proof server their config names.
 */
async function resolveProofProvider(
  api: ConnectedAPI,
  zkConfigProvider: FetchZkConfigProvider<FaceTokenCircuitKeys>,
  proverServerUri: string | undefined,
  logger: Logger,
): Promise<{ provider: ProofProvider; mode: 'wallet' | 'proof-server' }> {
  type WalletWithProving = ConnectedAPI & {
    getProvingProvider?: (zk: unknown) => Promise<ProvingProvider>;
  };
  const getProvingProvider = (api as WalletWithProving).getProvingProvider;

  if (typeof getProvingProvider === 'function') {
    try {
      const provingProvider = await getProvingProvider.call(api, zkConfigProvider);
      logger.info('proving through the wallet, no local proof server needed');
      // Calling prove() directly is the only path that hands the wallet's
      // proving provider a cost model it accepts.
      return {
        mode: 'wallet',
        provider: {
          proveTx: (unprovenTx) => unprovenTx.prove(provingProvider, CostModel.initialCostModel()),
        },
      };
    } catch (error) {
      logger.warn({ error }, 'wallet proving unavailable, falling back to a proof server');
    }
  }

  if (!proverServerUri) {
    throw new Error(
      'This wallet cannot generate proofs on its own and reported no proof server. ' +
        'Run one with "npm run proof-server", then reconnect.',
    );
  }
  logger.info({ proverServerUri }, 'proving through an external proof server');
  return { mode: 'proof-server', provider: httpClientProofProvider(proverServerUri, zkConfigProvider) };
}

/**
 * Normalise one of the wallet's public keys to hex. Older builds return raw
 * bytes or a `{ bytes }` wrapper instead of a bech32m string.
 */
function toHexKey(raw: unknown, parse: (value: string) => string, label: string): string {
  if (typeof raw === 'string') {
    try {
      return parse(raw);
    } catch (error) {
      throw new Error(
        `Could not decode the ${label} the wallet returned ("${raw.slice(0, 20)}..."). ` +
          'This usually means the wallet is on a different network than the dApp. ' +
          `Underlying error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (raw instanceof Uint8Array) return utils.toHex(raw);
  if (raw && typeof raw === 'object' && 'bytes' in raw) {
    return utils.toHex((raw as { bytes: Uint8Array }).bytes);
  }
  throw new Error(`The wallet returned no ${label}.`);
}

/** `submitTransaction` returns a bare id on some wallets and an object on others. */
function normaliseTxId(result: unknown): TransactionId | undefined {
  if (typeof result === 'string' && result.length > 0) return result as TransactionId;
  if (result && typeof result === 'object') {
    const candidate = (result as any).transactionId ?? (result as any).id;
    if (typeof candidate === 'string' && candidate.length > 0) return candidate as TransactionId;
  }
  return undefined;
}

/**
 * 1AM's background worker can answer the first connect of a page load with a
 * locked state even when the wallet is unlocked, because the worker has not
 * rehydrated yet. Waking it and asking again clears it, so a transient looking
 * failure is retried before it reaches the user.
 */
async function connectWithRetry(wallet: WalletInfo, networkId: string, logger: Logger): Promise<ConnectedAPI> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt++) {
    try {
      return await withTimeout(
        wallet.api.connect(networkId),
        CONNECT_TIMEOUT_MS,
        `${wallet.name} did not respond to the connection request.`,
      );
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === CONNECT_ATTEMPTS || !TRANSIENT_CONNECT_ERROR.test(message)) break;
      logger.warn({ attempt, message }, 'wallet connect failed, retrying');
      await delay(attempt * 800);
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  if (TRANSIENT_CONNECT_ERROR.test(detail)) {
    throw new Error(
      `${wallet.name} is reporting a locked wallet. Open the extension and unlock it. ` +
        'If it is already unlocked, close the popup, reload this page, and connect again. ' +
        `Wallet said: ${detail}`,
    );
  }
  throw lastError instanceof Error ? lastError : new Error(detail);
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

// ── Wallet detection ───────────────────────────────────────────────────

export interface WalletInfo {
  id: string;
  name: string;
  apiVersion: string;
  api: InitialAPI;
}

const WALLET_LABELS: Record<string, string> = { '1am': '1AM Wallet', mnLace: 'Lace Wallet', lace: 'Lace Wallet' };

export function getCompatibleWallets(): WalletInfo[] {
  if (!window.midnight) return [];
  return Object.entries(window.midnight)
    .filter(([, wallet]) => isConnectorApi(wallet))
    .map(([id, wallet]) => ({
      id,
      name: WALLET_LABELS[id] ?? `${id.charAt(0).toUpperCase()}${id.slice(1)} Wallet`,
      apiVersion: (wallet as InitialAPI).apiVersion,
      api: wallet as InitialAPI,
    }))
    .filter((w) => semver.validRange(COMPATIBLE_CONNECTOR_API_VERSION) !== null
      && semver.valid(semver.coerce(w.apiVersion)) !== null
      && semver.satisfies(semver.coerce(w.apiVersion)!, COMPATIBLE_CONNECTOR_API_VERSION));
}

function isConnectorApi(wallet: unknown): wallet is InitialAPI {
  return !!wallet && typeof wallet === 'object' && 'apiVersion' in wallet && 'connect' in wallet;
}

function findWallet(walletId?: string): WalletInfo | undefined {
  const wallets = getCompatibleWallets();
  return wallets.find((w) => w.id === walletId) ?? wallets[0];
}
