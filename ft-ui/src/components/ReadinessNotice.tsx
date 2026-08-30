import type { WalletSession } from '../contexts/BrowserFaceTokenManager';

/**
 * Tells the user whether this wallet can actually pay for a mint before they
 * spend time scanning their face. On preprod they fund their own fees, and a
 * zero DUST balance is the single most common reason a mint fails.
 */
export default function ReadinessNotice({ session }: { session: WalletSession | null }) {
  if (!session) return null;

  const needsProofServer = session.provingMode === 'proof-server';
  const needsDust = !session.feesSponsored && session.dustBalance === 0n;
  if (!needsProofServer && !needsDust) return null;

  return (
    <div className="readiness" role="status">
      <span className="readiness-net">{session.networkId}</span>
      <div className="readiness-body">
        {needsDust && (
          <p>
            <strong>No DUST yet.</strong> On {session.networkId} you pay your own fees, and DUST is
            what pays them. Open 1AM, register your NIGHT for DUST generation, then wait a few
            minutes for it to accrue. Switching the app to the preview network removes this step
            entirely, because 1AM sponsors fees there.
          </p>
        )}
        {needsProofServer && (
          <p>
            <strong>Proving runs outside the wallet.</strong> This wallet did not offer to generate
            proofs itself, so the app will use{' '}
            <code>{session.proverServerUri ?? 'the configured proof server'}</code>. If that is a
            localhost address, start one with <code>npm run proof-server</code>.
          </p>
        )}
      </div>
    </div>
  );
}
