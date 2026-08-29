import { type WalletInfo } from '../contexts/BrowserFaceTokenManager';

interface HeaderProps {
  isConnected: boolean;
  address: string | null;
  compatibleWallets: WalletInfo[];
  selectedWalletId: string;
  setSelectedWalletId: (id: string) => void;
  connectWallet: () => Promise<void>;
  walletState: 'detecting' | 'ready' | 'connecting' | 'connected';
  truncAddr: (addr: string) => string;
}

export default function Header({
  isConnected,
  address,
  compatibleWallets,
  selectedWalletId,
  setSelectedWalletId,
  connectWallet,
  walletState,
  truncAddr,
}: HeaderProps) {
  return (
    <header className="app-header">
      <div>
        <span className="logo" onClick={() => window.location.reload()}>ft.</span>
        <div className="title-desc">In-browser face attestation on Midnight</div>
      </div>
      <div className="wallet-section">
        {isConnected && address ? (
          <div className="wallet-chip">{truncAddr(address)}</div>
        ) : (
          <>
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
              className="btn-wallet-connect"
              onClick={connectWallet}
              disabled={walletState === 'connecting'}
            >
              {walletState === 'connecting' ? 'Connecting...' : 'Connect Wallet'}
            </button>
          </>
        )}
      </div>
    </header>
  );
}
