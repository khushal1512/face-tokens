import { type WalletInfo } from '../contexts/BrowserFaceTokenManager';
import type { WalletState } from '../App';

interface HeaderProps {
  isConnected: boolean;
  address: string | null;
  compatibleWallets: WalletInfo[];
  selectedWalletId: string;
  setSelectedWalletId: (id: string) => void;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  walletState: WalletState;
  truncAddr: (addr: string) => string;
}

export default function Header({
  isConnected,
  address,
  compatibleWallets,
  selectedWalletId,
  setSelectedWalletId,
  connectWallet,
  disconnectWallet,
  walletState,
  truncAddr,
}: HeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header-brand">
        <span className="wordmark small">Face<span className="wordmark-dim">Token</span></span>
        <span className="title-desc">In browser face attestation on Midnight</span>
      </div>

      <div className="wallet-section">
        {isConnected && address ? (
          <>
            <span className="wallet-chip" title={address}>{truncAddr(address)}</span>
            <button className="btn-quiet" onClick={disconnectWallet}>Disconnect</button>
          </>
        ) : (
          <>
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
            <button className="btn-ghost" onClick={connectWallet} disabled={walletState === 'connecting'}>
              {walletState === 'connecting' ? 'Connecting' : 'Connect wallet'}
            </button>
          </>
        )}
      </div>
    </header>
  );
}
