import { useEffect, useRef } from 'react';
import { type WalletInfo } from '../contexts/BrowserFaceTokenManager';
import type { WalletState } from '../App';
import FaceScanVisual from './FaceScanVisual';

interface LandingPageProps {
  compatibleWallets: WalletInfo[];
  selectedWalletId: string;
  setSelectedWalletId: (id: string) => void;
  connectWallet: () => Promise<void>;
  walletState: WalletState;
  error: string | null;
  dismissError: () => void;
}

const STEPS = [
  {
    label: 'on device',
    title: 'The model comes to your camera',
    body: 'A face detection model loads into the browser and reads 68 landmark points straight from the video element. There is no upload step, because there is no server to upload to.',
  },
  {
    label: 'liveness',
    title: 'A photograph cannot turn its head',
    body: 'You are asked to turn left and then right. The scanner tracks the nose against the jaw line across frames, so a printed photo or a still image on a phone will not complete the sequence.',
  },
  {
    label: 'attestation',
    title: 'Only the proof goes on chain',
    body: 'Landmark distances are reduced to scale invariant ratios and hashed. A zero knowledge circuit proves the hash is fresh and the liveness score is high enough, then mints a token on the Midnight Network.',
  },
];

const CHAIN_FIELDS = [
  ['tokenId', 'uint64', 'Sequential, public'],
  ['owner', 'address', 'Your wallet, public'],
  ['faceHash', 'bytes32', 'One way hash of ratios'],
  ['livenessScore', 'uint64', 'Threshold check only'],
];

export default function LandingPage({
  compatibleWallets,
  selectedWalletId,
  setSelectedWalletId,
  connectWallet,
  walletState,
  error,
  dismissError,
}: LandingPageProps) {
  const revealRoot = useRef<HTMLDivElement | null>(null);
  useReveal(revealRoot);

  const connecting = walletState === 'connecting';
  const hasWallet = compatibleWallets.length > 0;

  return (
    <div className="landing" ref={revealRoot}>
      <nav className="landing-nav">
        <span className="wordmark">
          Face<span className="wordmark-dim">Token</span>
        </span>
        <div className="landing-nav-actions">
          {compatibleWallets.length > 1 && (
            <select
              className="wallet-dropdown"
              value={selectedWalletId}
              onChange={(e) => setSelectedWalletId(e.target.value)}
              aria-label="Wallet"
            >
              {compatibleWallets.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          )}
          <button className="btn-ghost" onClick={connectWallet} disabled={connecting}>
            {connecting ? 'Connecting' : 'Launch app'}
          </button>
        </div>
      </nav>

      {error && (
        <div className="landing-alert" role="alert">
          <span>{error}</span>
          <button onClick={dismissError} aria-label="Dismiss">×</button>
        </div>
      )}

      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Proof of personhood on Midnight</p>
          <h1>
            Prove you are human.
            <br />
            <em>Keep your face.</em>
          </h1>
          <p className="hero-body">
            Every verification service that asks for a selfie is building a database of faces,
            and a face is the one credential you cannot rotate after a breach. FaceToken does
            the whole check in your browser and puts nothing on chain but a proof.
          </p>

          <div className="hero-actions">
            <button className="btn-primary" onClick={connectWallet} disabled={connecting}>
              {connecting ? 'Connecting' : hasWallet ? 'Connect wallet' : 'Get started'}
            </button>
            <a className="btn-quiet" href="#how">How it works</a>
          </div>

          <p className="hero-note">
            {walletState === 'detecting'
              ? 'Looking for a Midnight wallet'
              : hasWallet
                ? `Detected ${compatibleWallets.map((w) => w.name).join(' and ')}`
                : 'Requires the 1AM wallet extension, or Lace with Midnight support'}
          </p>
        </div>

        <FaceScanVisual />
      </header>

      <section className="steps" id="how">
        {STEPS.map((step) => (
          <article className="step" key={step.label} data-reveal>
            <span className="step-label">{step.label}</span>
            <div className="step-text">
              <h2>{step.title}</h2>
              <p>{step.body}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="chain-section" data-reveal>
        <div className="chain-copy">
          <h2>What the chain actually stores</h2>
          <p>
            The ledger holds four fields per token. None of them can be reversed into an image,
            and the raw landmark vector is discarded when the browser tab closes.
          </p>
        </div>
        <ul className="chain-fields">
          {CHAIN_FIELDS.map(([name, type, note]) => (
            <li key={name}>
              <code>{name}</code>
              <span className="chain-type">{type}</span>
              <span className="chain-note">{note}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="closing" data-reveal>
        <h2>One face, one token, no database.</h2>
        <button className="btn-primary" onClick={connectWallet} disabled={connecting}>
          {connecting ? 'Connecting' : 'Connect wallet'}
        </button>
      </section>

      <footer className="landing-footer">
        <span className="wordmark small">Face<span className="wordmark-dim">Token</span></span>
        <span>Built on the Midnight Network</span>
      </footer>
    </div>
  );
}

/** Fade sections in as they enter the viewport, once each. */
function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const targets = root.current?.querySelectorAll<HTMLElement>('[data-reveal]');
    if (!targets?.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      targets.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.15 },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [root]);
}
