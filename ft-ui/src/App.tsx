import { useState, useEffect, useCallback, useRef } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { BrowserFaceTokenManager, getCompatibleWallets, type WalletInfo } from './contexts/BrowserFaceTokenManager';
import { useFaceToken } from './hooks/useFaceToken';
import pino from 'pino';
import { createFaceTokenPrivateState } from 'facetoken-contract';
import { utils } from 'facetoken-api';
import { setNetworkId, type NetworkId } from '@midnight-ntwrk/midnight-js-network-id';

// Components
import LandingPage from './components/LandingPage';
import Header from './components/Header';
import Scanner from './components/Scanner';
import SuccessModal from './components/SuccessModal';
import IntroAndExplainer from './components/IntroAndExplainer';
import IdentitiesLedger from './components/IdentitiesLedger';

const NETWORK_ID = (import.meta.env.VITE_NETWORK_ID ?? 'preprod') as string;
const DEFAULT_CONTRACT = import.meta.env.VITE_DEFAULT_CONTRACT ?? '';

// Set network ID immediately at module load
setNetworkId(NETWORK_ID as NetworkId);

function truncAddr(addr: string): string {
  return addr.length <= 20 ? addr : `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

export default function App() {
  // ── Page routing ────────────────
  const [page, setPage] = useState<'landing' | 'app'>('landing');

  // ── Wallet ──────────────────────
  const [walletState, setWalletState] = useState<'detecting' | 'ready' | 'connecting' | 'connected'>('detecting');
  const [compatibleWallets, setCompatibleWallets] = useState<WalletInfo[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  const [, setWallet] = useState<any>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [coinPublicKeyBytes, setCoinPublicKeyBytes] = useState<Uint8Array | null>(null);

  // ── Contract ────────────────────
  const [contractAddress, setContractAddress] = useState(DEFAULT_CONTRACT);
  const [joinInput, setJoinInput] = useState('');
  const [showJoinPanel, setShowJoinPanel] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ── Face Scanner ────────────────
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [normalizedVector, setNormalizedVector] = useState<string | null>(null);
  const [userUuid, setUserUuid] = useState<string | null>(null);
  const [faceHash, setFaceHash] = useState<string | null>(null);
  const [faceHashBytes, setFaceHashBytes] = useState<Uint8Array | null>(null);
  const [confidenceScore, setConfidenceScore] = useState<number>(0);

  // ── Minting ─────────────────────
  const [minting, setMinting] = useState(false);
  const [mintStatus, setMintStatus] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // ── Refs ─────────────────────────
  const managerRef = useRef<BrowserFaceTokenManager | null>(null);

  const getManager = useCallback(() => {
    if (!managerRef.current) {
      const logger = pino({ level: 'warn', browser: { asObject: true } });
      managerRef.current = new BrowserFaceTokenManager(logger);
    }
    return managerRef.current;
  }, []);

  const { tokens, tokenCount, loading: ledgerLoading, error: ledgerError } = useFaceToken(contractAddress || null);

  // ── Load face-api models ────────
  useEffect(() => {
    (async () => {
      try {
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        setModelsLoaded(true);
      } catch (e: any) {
        setError('Failed to load face detection models. Check your internet connection.');
        console.error(e);
      }
    })();
  }, []);

  // ── Detect wallets (1AM + Lace) ─
  useEffect(() => {
    const detect = () => {
      const wallets = getCompatibleWallets();
      setCompatibleWallets(wallets);
      setWalletState((prev) => {
        if (prev === 'detecting') {
          if (wallets.length > 0) setSelectedWalletId(wallets[0].id);
          return 'ready';
        }
        return prev;
      });
    };
    detect();
    const id = setInterval(detect, 2000);
    return () => clearInterval(id);
  }, []);

  // ── Navigate to app on connect ──
  useEffect(() => {
    if (walletState === 'connected') {
      setPage('app');
    }
  }, [walletState]);

  // ── Connect wallet ──────────────
  const connectWallet = useCallback(async () => {
    if (!selectedWalletId && compatibleWallets.length === 0) {
      setError('No compatible Midnight wallet detected. Please install the 1AM wallet extension or the Lace wallet with Midnight support.');
      return;
    }
    const walletId = selectedWalletId || compatibleWallets[0]?.id || '';
    setWalletState('connecting');
    setError(null);
    try {
      const manager = getManager();
      manager.resetProviders();
      const providers = await manager.getProviders(walletId);
      const coinPubKey = providers.walletProvider.getCoinPublicKey();
      
      const fullHex = typeof coinPubKey === 'string' ? coinPubKey : utils.toHex(coinPubKey as Uint8Array);
      const cleanHex = fullHex.startsWith('0x') ? fullHex.slice(2) : fullHex;
      const bytes32 = new Uint8Array(32);
      for (let i = 0; i < 32; i++) bytes32[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
      setCoinPublicKeyBytes(bytes32);

      const walletAPI = (window as any).midnight?.[walletId];
      if (walletAPI) {
        const connected = await walletAPI.connect(NETWORK_ID);
        setWallet(connected);
        try {
          const { unshieldedAddress } = await connected.getUnshieldedAddress();
          setAddress(unshieldedAddress);
        } catch {
          setAddress(coinPubKey.slice(0, 16) + '...');
        }
      } else {
        setAddress(utils.formatAddress({ is_left: true, left: { bytes: coinPubKey } }));
      }
      setWalletState('connected');
    } catch (e: any) {
      setError(e.message || 'Failed to connect wallet.');
      setWalletState('ready');
    }
  }, [selectedWalletId, compatibleWallets, getManager]);

  // ── Handle scan completion ──────
  const handleScanComplete = useCallback((result: {
    userUuid: string;
    faceHash: string;
    faceHashBytes: Uint8Array;
    confidenceScore: number;
    normalizedVector: string;
  }) => {
    setUserUuid(result.userUuid);
    setFaceHash(result.faceHash);
    setFaceHashBytes(result.faceHashBytes);
    setConfidenceScore(result.confidenceScore);
    setNormalizedVector(result.normalizedVector);
  }, []);

  // ── Deploy contract ─────────────
  const handleDeploy = useCallback(async () => {
    if (walletState !== 'connected') {
      setError('Connect your wallet first.');
      return;
    }
    setDeploying(true);
    setError(null);
    try {
      const manager = getManager();
      const deployment$ = manager.resolve();
      const result = await new Promise<any>((resolve, reject) => {
        const sub = deployment$.subscribe((d) => {
          if (d.status === 'deployed') { Promise.resolve().then(() => sub.unsubscribe()); resolve(d); }
          if (d.status === 'failed') { Promise.resolve().then(() => sub.unsubscribe()); reject(d.error); }
        });
      });
      setContractAddress(result.api.deployedContractAddress);
      setSuccess('Contract deployed successfully.');
      setShowJoinPanel(false);
    } catch (e: any) {
      setError(e.message || 'Deploy failed.');
    } finally {
      setDeploying(false);
    }
  }, [walletState, getManager]);

  // ── Join contract ───────────────
  const handleJoin = useCallback(() => {
    const addr = joinInput.trim();
    if (!addr) return;
    if (!/^[0-9a-fA-F]{64}$/.test(addr)) {
      setError('Invalid contract address. Must be 64 hex characters.');
      return;
    }
    setContractAddress(addr);
    setShowJoinPanel(false);
    setJoinInput('');
    setSuccess(`Joined contract: ${truncAddr(addr)}`);
  }, [joinInput]);

  // ── Copy helper ─────────────────
  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }, []);

  // ── Mint NFT ────────────────────
  const mintFaceToken = useCallback(async () => {
    if (!coinPublicKeyBytes || !faceHashBytes || !confidenceScore) {
      setError('Complete a face scan and connect your wallet first.');
      return;
    }
    setNetworkId(NETWORK_ID as NetworkId);
    setMinting(true);
    setMintStatus('Preparing ZK attestation...');
    setError(null);
    setSuccess(null);

    try {
      const manager = getManager();
      const deployment$ = manager.resolve(contractAddress as any);
      const result = await new Promise<any>((resolve, reject) => {
        const sub = deployment$.subscribe((d) => {
          if (d.status === 'deployed') { Promise.resolve().then(() => sub.unsubscribe()); resolve(d); }
          if (d.status === 'failed') { Promise.resolve().then(() => sub.unsubscribe()); reject(d.error); }
        });
      });

      const providers = manager.providers;
      if (providers) {
        const privateState = createFaceTokenPrivateState(faceHashBytes, BigInt(confidenceScore));
        await providers.privateStateProvider.set('facetokenPrivateState', privateState);
      }

      setMintStatus('Generating ZK proof and submitting transaction...');

      const recipient = {
        is_left: true,
        left: { bytes: coinPublicKeyBytes },
        right: { bytes: new Uint8Array(32) },
      };

      const tokenId = await result.api.mint(recipient);
      setSuccess(`Humanity NFT minted. Token ID: ${tokenId}`);
      setShowSuccessModal(true);
    } catch (e: any) {
      console.error(e);
      let msg = e.message || 'Transaction failed.';
      if (msg.includes('Face already registered')) {
        msg = 'This face has already been registered. Sybil check passed.';
      }
      setError(msg);
    } finally {
      setMinting(false);
      setMintStatus(null);
    }
  }, [contractAddress, coinPublicKeyBytes, faceHashBytes, confidenceScore, getManager]);

  const isConnected = walletState === 'connected';
  const hasScanResult = !!userUuid && !!faceHash;

  // ── Landing page ────────────────
  if (page === 'landing') {
    return (
      <LandingPage
        compatibleWallets={compatibleWallets}
        selectedWalletId={selectedWalletId}
        setSelectedWalletId={setSelectedWalletId}
        connectWallet={connectWallet}
        walletState={walletState}
      />
    );
  }

  // ── Main app ────────────────────
  return (
    <div className="app-shell">
      <Header
        isConnected={isConnected}
        address={address}
        compatibleWallets={compatibleWallets}
        selectedWalletId={selectedWalletId}
        setSelectedWalletId={setSelectedWalletId}
        connectWallet={connectWallet}
        walletState={walletState}
        truncAddr={truncAddr}
      />

      {/* ── Toasts ───────────────── */}
      {error && (
        <div className="toast-banner">
          <span>{error}</span>
          <button className="toast-close" onClick={() => setError(null)}>×</button>
        </div>
      )}
      {success && !showSuccessModal && (
        <div className="toast-banner success">
          <span>{success}</span>
          <button className="toast-close" onClick={() => setSuccess(null)}>×</button>
        </div>
      )}

      <SuccessModal
        show={showSuccessModal}
        onClose={() => {
          setShowSuccessModal(false);
          setUserUuid(null);
          setNormalizedVector(null);
          setFaceHash(null);
        }}
        faceHash={faceHash}
        copyToClipboard={copyToClipboard}
        copied={copied}
      />

      <IntroAndExplainer />

      {/* ── Scan Section ─────────── */}
      <div className="scan-section">
        <h2>Verify your humanity</h2>
        <p className="scan-desc">
          {hasScanResult
            ? 'Scan complete. Review your results below, then mint your attestation.'
            : 'Click the button below to start. The camera will detect your face and ask you to turn left and right.'}
        </p>

        {/* Contract bar */}
        {contractAddress && (
          <div className="contract-bar">
            <input type="text" readOnly value={contractAddress} onClick={() => copyToClipboard(contractAddress)} title="Click to copy" />
            <button className="btn-small" onClick={() => setShowJoinPanel(!showJoinPanel)}>
              {showJoinPanel ? 'Cancel' : 'Switch'}
            </button>
          </div>
        )}

        {showJoinPanel && (
          <div className="join-panel">
            <input
              className="join-input"
              type="text"
              placeholder="Paste contract address (64 hex characters)"
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
            />
            <div className="join-actions">
              <button className="btn-primary" onClick={handleJoin} disabled={!joinInput.trim()}>Join</button>
              <button className="btn-secondary" onClick={handleDeploy} disabled={deploying}>
                {deploying ? 'Deploying...' : 'Deploy New'}
              </button>
            </div>
          </div>
        )}

        <div className="scan-area">
          {isScanning ? (
            <Scanner
              modelsLoaded={modelsLoaded}
              onScanComplete={handleScanComplete}
              isScanning={isScanning}
              setIsScanning={setIsScanning}
              setError={setError}
            />
          ) : hasScanResult ? (
            <>
              <div className="result-card">
                <div className="result-row">
                  <span className="result-label">Liveness</span>
                  <span className="score-badge">{confidenceScore}%</span>
                </div>
                <div className="result-row">
                  <span className="result-label">UUID</span>
                  <span className="result-value">{userUuid}</span>
                </div>
                <div className="result-row">
                  <span className="result-label">Face Hash</span>
                  <span
                    className="result-value copyable"
                    onClick={() => faceHash && copyToClipboard(faceHash)}
                    title="Click to copy"
                  >
                    {faceHash ? truncAddr(faceHash) : ''}
                  </span>
                </div>
                <div className="result-row">
                  <span className="result-label">Vector</span>
                  <span className="result-value vector-value">{normalizedVector}</span>
                </div>
              </div>

              <div className="scan-actions">
                {isConnected ? (
                  <button className="btn-primary mint-btn" onClick={mintFaceToken} disabled={minting}>
                    {minting ? mintStatus : 'Mint Humanity NFT'}
                  </button>
                ) : (
                  <button className="btn-primary mint-btn" onClick={connectWallet}>
                    Connect Wallet to Mint
                  </button>
                )}
                <button className="btn-secondary rescan-btn" onClick={() => setIsScanning(true)}>
                  Re-scan
                </button>
              </div>
            </>
          ) : (
            <Scanner
              modelsLoaded={modelsLoaded}
              onScanComplete={handleScanComplete}
              isScanning={isScanning}
              setIsScanning={setIsScanning}
              setError={setError}
            />
          )}
        </div>
      </div>

      <IdentitiesLedger
        contractAddress={contractAddress}
        ledgerLoading={ledgerLoading}
        ledgerError={ledgerError}
        tokens={tokens}
        truncAddr={truncAddr}
      />
    </div>
  );
}
