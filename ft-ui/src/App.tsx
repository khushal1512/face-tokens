import { useState, useEffect, useCallback, useRef } from 'react';
import * as faceapi from '@vladmandic/face-api';
import pino from 'pino';
import { createFaceTokenPrivateState } from 'facetoken-contract';
import { facetokenPrivateStateKey } from 'facetoken-api';
import { setNetworkId, type NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  BrowserFaceTokenManager,
  getCompatibleWallets,
  type FaceTokenDeployment,
  type WalletInfo,
  type WalletSession,
} from './contexts/BrowserFaceTokenManager';
import { useFaceToken } from './hooks/useFaceToken';

import LandingPage from './components/LandingPage';
import Header from './components/Header';
import Scanner, { type ScanResult } from './components/Scanner';
import SuccessModal from './components/SuccessModal';
import IntroAndExplainer from './components/IntroAndExplainer';
import IdentitiesLedger from './components/IdentitiesLedger';
import ReadinessNotice from './components/ReadinessNotice';

const NETWORK_ID = (import.meta.env.VITE_NETWORK_ID ?? 'preprod') as NetworkId;
const DEFAULT_CONTRACT = (import.meta.env.VITE_DEFAULT_CONTRACT ?? '').trim();
const FACE_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

/** The circuit rejects anything below this, so the UI should too. */
const MIN_LIVENESS_SCORE = 70;
const CONTRACT_ADDRESS_RE = /^[0-9a-fA-F]{64}$/;

setNetworkId(NETWORK_ID);

export type WalletState = 'detecting' | 'ready' | 'connecting' | 'connected';

function truncAddr(addr: string): string {
  return addr.length <= 20 ? addr : `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

/** Resolve a deployment observable down to its first terminal state. */
function firstSettled(deployment$: ReturnType<BrowserFaceTokenManager['resolve']>) {
  return new Promise<Extract<FaceTokenDeployment, { status: 'deployed' }>>((resolve, reject) => {
    const sub = deployment$.subscribe((d) => {
      if (d.status === 'deployed') {
        queueMicrotask(() => sub.unsubscribe());
        resolve(d);
      } else if (d.status === 'failed') {
        queueMicrotask(() => sub.unsubscribe());
        reject(d.error);
      }
    });
  });
}

export default function App() {
  const [page, setPage] = useState<'landing' | 'app'>('landing');

  // ── Wallet ──────────────────────
  const [walletState, setWalletState] = useState<WalletState>('detecting');
  const [compatibleWallets, setCompatibleWallets] = useState<WalletInfo[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState('');
  const [address, setAddress] = useState<string | null>(null);
  const [coinPublicKeyBytes, setCoinPublicKeyBytes] = useState<Uint8Array | null>(null);
  const [session, setSession] = useState<WalletSession | null>(null);

  // ── Contract ────────────────────
  const [contractAddress, setContractAddress] = useState(DEFAULT_CONTRACT);
  const [joinInput, setJoinInput] = useState('');
  const [showJoinPanel, setShowJoinPanel] = useState(!DEFAULT_CONTRACT);
  const [deploying, setDeploying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ── Face scan ───────────────────
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scan, setScan] = useState<ScanResult | null>(null);

  // ── Minting ─────────────────────
  const [minting, setMinting] = useState(false);
  const [mintStatus, setMintStatus] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const managerRef = useRef<BrowserFaceTokenManager | null>(null);
  const getManager = useCallback(() => {
    if (!managerRef.current) {
      managerRef.current = new BrowserFaceTokenManager(
        pino({ level: 'warn', browser: { asObject: true } }),
      );
    }
    return managerRef.current;
  }, []);

  const { tokens, tokenCount, loading: ledgerLoading, error: ledgerError, refresh } =
    useFaceToken(contractAddress || null);

  // Fetch the detection weights only once someone reaches the app. The landing
  // page has no camera on it, so paying for the download there is wasteful and
  // a CDN failure there would be an error about a feature not yet in view.
  useEffect(() => {
    if (page !== 'app' || modelsLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODEL_URL);
        if (!cancelled) setModelsLoaded(true);
      } catch {
        if (!cancelled) setError('Could not load the face detection model. Check your connection and reload.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, modelsLoaded]);

  // ── Poll for wallet extensions, which inject after page load ──
  useEffect(() => {
    if (walletState === 'connected') return;
    const detect = () => {
      const wallets = getCompatibleWallets();
      // Only swap the array when the set of wallets actually changes. Replacing
      // it every tick re-renders the whole tree while the user is mid-approval.
      setCompatibleWallets((prev) =>
        prev.length === wallets.length && prev.every((w, i) => w.id === wallets[i].id) ? prev : wallets,
      );
      setSelectedWalletId((current) =>
        current && wallets.some((w) => w.id === current) ? current : wallets[0]?.id ?? '',
      );
      setWalletState((prev) => (prev === 'detecting' ? 'ready' : prev));
    };
    detect();
    const id = setInterval(detect, 2000);
    return () => clearInterval(id);
  }, [walletState]);

  const connectWallet = useCallback(async () => {
    if (walletState === 'connected') {
      setPage('app');
      return;
    }
    setWalletState('connecting');
    setError(null);
    try {
      const connected = await getManager().connect(selectedWalletId || undefined);
      setSession(connected);
      setCoinPublicKeyBytes(connected.coinPublicKeyBytes);
      setAddress(connected.unshieldedAddress);
      setWalletState('connected');
      setPage('app');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect to the wallet.');
      setWalletState('ready');
    }
  }, [walletState, selectedWalletId, getManager]);

  const disconnectWallet = useCallback(() => {
    getManager().disconnect();
    setSession(null);
    setCoinPublicKeyBytes(null);
    setAddress(null);
    setWalletState('ready');
    setPage('landing');
  }, [getManager]);

  const handleDeploy = useCallback(async () => {
    if (walletState !== 'connected') {
      setError('Connect your wallet before deploying.');
      return;
    }
    setDeploying(true);
    setError(null);
    try {
      const result = await firstSettled(getManager().resolve());
      setContractAddress(result.api.deployedContractAddress);
      setSuccess('Contract deployed. Share the address so others can join it.');
      setShowJoinPanel(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deployment failed.');
    } finally {
      setDeploying(false);
    }
  }, [walletState, getManager]);

  const handleJoin = useCallback(() => {
    const addr = joinInput.trim().replace(/^0x/, '');
    if (!CONTRACT_ADDRESS_RE.test(addr)) {
      setError('That is not a contract address. Expected 64 hexadecimal characters.');
      return;
    }
    setContractAddress(addr);
    setShowJoinPanel(false);
    setJoinInput('');
    setSuccess(`Joined ${truncAddr(addr)}`);
  }, [joinInput]);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Your browser blocked clipboard access.');
    }
  }, []);

  const mintFaceToken = useCallback(async () => {
    if (!coinPublicKeyBytes) {
      setError('Connect your wallet before minting.');
      return;
    }
    if (!scan) {
      setError('Complete a face scan before minting.');
      return;
    }
    if (scan.confidenceScore < MIN_LIVENESS_SCORE) {
      setError(`Liveness score ${scan.confidenceScore} is below the ${MIN_LIVENESS_SCORE} the contract requires. Scan again.`);
      return;
    }
    if (!CONTRACT_ADDRESS_RE.test(contractAddress)) {
      setError('Join a contract or deploy a new one before minting.');
      setShowJoinPanel(true);
      return;
    }

    setMinting(true);
    setError(null);
    setSuccess(null);
    try {
      setMintStatus('Connecting to contract');
      const result = await firstSettled(getManager().resolve(contractAddress));

      // The mint circuit reads both of these out of private state through its
      // witnesses, so they have to be in place before the proof is generated.
      const providers = getManager().providers;
      if (!providers) throw new Error('Wallet session expired. Reconnect and try again.');
      await providers.privateStateProvider.set(
        facetokenPrivateStateKey,
        createFaceTokenPrivateState(scan.faceHashBytes, BigInt(scan.confidenceScore)),
      );

      setMintStatus('Generating proof');
      const tokenId = await result.api.mint({
        is_left: true,
        left: { bytes: coinPublicKeyBytes },
        right: { bytes: new Uint8Array(32) },
      });

      setSuccess(`Minted token #${tokenId}`);
      setShowSuccessModal(true);
      refresh();
    } catch (e) {
      setError(explainMintFailure(e));
    } finally {
      setMinting(false);
      setMintStatus(null);
    }
  }, [coinPublicKeyBytes, scan, contractAddress, getManager, refresh]);

  const isConnected = walletState === 'connected';

  if (page === 'landing') {
    return (
      <LandingPage
        compatibleWallets={compatibleWallets}
        selectedWalletId={selectedWalletId}
        setSelectedWalletId={setSelectedWalletId}
        connectWallet={connectWallet}
        walletState={walletState}
        error={error}
        dismissError={() => setError(null)}
      />
    );
  }

  return (
    <div className="app-shell">
      <Header
        isConnected={isConnected}
        address={address}
        compatibleWallets={compatibleWallets}
        selectedWalletId={selectedWalletId}
        setSelectedWalletId={setSelectedWalletId}
        connectWallet={connectWallet}
        disconnectWallet={disconnectWallet}
        walletState={walletState}
        truncAddr={truncAddr}
      />

      {error && (
        <div className="toast-banner" role="alert">
          <span>{error}</span>
          <button className="toast-close" onClick={() => setError(null)} aria-label="Dismiss">×</button>
        </div>
      )}
      {success && !showSuccessModal && (
        <div className="toast-banner success" role="status">
          <span>{success}</span>
          <button className="toast-close" onClick={() => setSuccess(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      <SuccessModal
        show={showSuccessModal}
        onClose={() => {
          setShowSuccessModal(false);
          setScan(null);
        }}
        faceHash={scan?.faceHash ?? null}
        copyToClipboard={copyToClipboard}
        copied={copied}
      />

      <ReadinessNotice session={session} />

      <IntroAndExplainer />

      <section className="scan-section">
        <h2>Verify your humanity</h2>
        <p className="scan-desc">
          {scan
            ? 'Scan complete. Review the result, then mint your attestation.'
            : 'Start the camera, hold still until your face is found, then turn left and right when prompted.'}
        </p>

        <div className="contract-bar">
          <input
            type="text"
            readOnly
            value={contractAddress || 'No contract selected'}
            onClick={() => contractAddress && copyToClipboard(contractAddress)}
            title={contractAddress ? 'Click to copy' : undefined}
            className={contractAddress ? 'mono' : 'mono muted'}
          />
          <button className="btn-small" onClick={() => setShowJoinPanel(!showJoinPanel)}>
            {showJoinPanel ? 'Cancel' : contractAddress ? 'Switch' : 'Select'}
          </button>
        </div>

        {showJoinPanel && (
          <div className="join-panel">
            <input
              className="join-input"
              type="text"
              placeholder="Contract address, 64 hexadecimal characters"
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
            <div className="join-actions">
              <button className="btn-primary" onClick={handleJoin} disabled={!joinInput.trim()}>Join</button>
              <button className="btn-secondary" onClick={handleDeploy} disabled={deploying || !isConnected}>
                {deploying ? 'Deploying' : 'Deploy new'}
              </button>
            </div>
          </div>
        )}

        <div className="scan-area">
          {scan && !isScanning ? (
            <>
              <div className="result-card">
                <div className="result-row">
                  <span className="result-label">Liveness</span>
                  <span className="score-badge">{scan.confidenceScore}%</span>
                </div>
                <div className="result-row">
                  <span className="result-label">Identifier</span>
                  <span className="result-value">{scan.userUuid}</span>
                </div>
                <div className="result-row">
                  <span className="result-label">Face hash</span>
                  <span
                    className="result-value copyable"
                    onClick={() => copyToClipboard(scan.faceHash)}
                    title="Click to copy"
                  >
                    {truncAddr(scan.faceHash)}
                  </span>
                </div>
                <div className="result-row">
                  <span className="result-label">Vector</span>
                  <span className="result-value vector-value">{scan.normalizedVector}</span>
                </div>
              </div>

              <div className="scan-actions">
                {isConnected ? (
                  <button className="btn-primary mint-btn" onClick={mintFaceToken} disabled={minting}>
                    {minting ? `${mintStatus}...` : 'Mint humanity token'}
                  </button>
                ) : (
                  <button className="btn-primary mint-btn" onClick={connectWallet}>
                    Connect wallet to mint
                  </button>
                )}
                <button className="btn-secondary rescan-btn" onClick={() => setScan(null)} disabled={minting}>
                  Scan again
                </button>
              </div>
            </>
          ) : (
            <Scanner
              modelsLoaded={modelsLoaded}
              onScanComplete={setScan}
              isScanning={isScanning}
              setIsScanning={setIsScanning}
              setError={setError}
            />
          )}
        </div>
      </section>

      <IdentitiesLedger
        contractAddress={contractAddress}
        ledgerLoading={ledgerLoading}
        ledgerError={ledgerError}
        tokens={tokens}
        tokenCount={tokenCount}
        truncAddr={truncAddr}
      />
    </div>
  );
}

/** Turn the SDK's raw failures into something a person can act on. */
function explainMintFailure(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/Face already registered/i.test(raw)) {
    return 'This face is already registered on this contract. Each face can mint once.';
  }
  if (/Liveness score too low/i.test(raw)) {
    return 'The contract rejected the liveness score. Scan again in better lighting.';
  }
  if (/failed to fetch|networkerror/i.test(raw)) {
    return 'Could not reach the proof server. Confirm it is running, then try again.';
  }
  if (/dust/i.test(raw)) {
    return 'Your wallet does not have enough DUST to pay for this transaction.';
  }
  return raw;
}
