import { type WalletInfo } from '../contexts/BrowserFaceTokenManager';

interface LandingPageProps {
  compatibleWallets: WalletInfo[];
  selectedWalletId: string;
  setSelectedWalletId: (id: string) => void;
  connectWallet: () => Promise<void>;
  walletState: 'detecting' | 'ready' | 'connecting' | 'connected';
}

export default function LandingPage({
  compatibleWallets,
  selectedWalletId,
  setSelectedWalletId,
  connectWallet,
  walletState,
}: LandingPageProps) {
  return (
    <div className="landing">
      {/* ── Nav ─────────────────────── */}
      <nav className="landing-nav">
        <span className="logo" onClick={() => window.location.reload()}>ft.</span>
        <div className="landing-nav-actions">
          {compatibleWallets.length > 0 && (
            <select
              className="wallet-dropdown"
              value={selectedWalletId}
              onChange={(e) => setSelectedWalletId(e.target.value)}
            >
              {compatibleWallets.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          )}
          <button
            className="btn-launch"
            onClick={connectWallet}
            disabled={walletState === 'connecting'}
          >
            {walletState === 'connecting' ? (
              <span className="btn-loading">Connecting<span className="dot-pulse" /></span>
            ) : (
              'Launch App'
            )}
          </button>
        </div>
      </nav>

      {/* ── Hero ────────────────────── */}
      <section className="hero">
        <div className="hero-content">
          <h1>Prove you're human.<br />Keep your face.</h1>
          <p className="hero-body">
            Face scans that leave your device are honeypots waiting to happen.
            ft. runs the entire biometric check in your browser, generates a
            zero-knowledge proof, and mints an on-chain attestation on the
            Midnight Network. No server ever touches your data.
          </p>
          <div className="hero-actions">
            <button
              className="btn-primary"
              onClick={connectWallet}
              disabled={walletState === 'connecting'}
            >
              {walletState === 'connecting' ? 'Connecting...' : 'Connect Wallet & Start'}
            </button>
          </div>
          <div className="hero-stats">
            <div className="stat">
              <span className="stat-value">100%</span>
              <span className="stat-label">In-Browser Processing</span>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <span className="stat-value">0 bytes</span>
              <span className="stat-label">Sent to Servers</span>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <span className="stat-value">ZK</span>
              <span className="stat-label">Proof-Based Attestation</span>
            </div>
          </div>
        </div>
        <div className="hero-visual">
          <div className="visual-ring">
            <div className="visual-ring-inner">
              <svg viewBox="0 0 120 120" className="visual-icon">
                <circle cx="60" cy="44" r="22" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.6" />
                <path d="M25 95 C25 72, 40 60, 60 60 C80 60, 95 72, 95 95" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.4" />
                <path d="M46 38 L54 38 M66 38 L74 38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
                <circle cx="50" cy="38" r="1.5" fill="currentColor" opacity="0.8" />
                <circle cx="70" cy="38" r="1.5" fill="currentColor" opacity="0.8" />
                <path d="M52 50 Q60 56 68 50" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ────────────── */}
      <section className="how-section">
        <h2>How it works</h2>
        <div className="how-grid">
          <div className="how-card">
            <div className="how-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
            <h3>Open camera</h3>
            <p>A lightweight face detection model loads entirely in your browser. No server roundtrip needed.</p>
          </div>
          <div className="how-card">
            <div className="how-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <h3>Detect and verify</h3>
            <p>Landmark dots track your face. A liveness check asks you to turn left and right to prove you're real.</p>
          </div>
          <div className="how-card">
            <div className="how-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </div>
            <h3>Hash locally</h3>
            <p>Facial distances are normalized and hashed with SHA-256. The raw vector stays in memory — never transmitted.</p>
          </div>
          <div className="how-card">
            <div className="how-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>
            <h3>Mint on-chain</h3>
            <p>A ZK proof is generated and a Humanity NFT is minted to your Midnight wallet. Verifiable, permanent, private.</p>
          </div>
        </div>
      </section>

      {/* ── Comparison ──────────────── */}
      <section className="compare-section">
        <div className="compare-grid">
          <div className="compare-card compare-problem">
            <h3>Traditional verification</h3>
            <ul>
              <li>Raw facial images uploaded to third-party servers</li>
              <li>Biometric data retained indefinitely despite privacy policies</li>
              <li>Centralized databases become high-value breach targets</li>
              <li>No way to verify your data was actually deleted</li>
            </ul>
          </div>
          <div className="compare-card compare-solution">
            <h3>ft. verification</h3>
            <ul>
              <li>Face detection runs entirely in your browser</li>
              <li>Landmarks converted to distance ratios, not stored as images</li>
              <li>Liveness check proves you are a real, present person</li>
              <li>Only a cryptographic hash and ZK proof reach the blockchain</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────── */}
      <footer className="landing-footer">
        <span className="logo footer-logo">ft.</span>
        <p>Private humanity verification on the Midnight Network</p>
      </footer>
    </div>
  );
}
