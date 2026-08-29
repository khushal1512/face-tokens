import { type FaceTokenEntry } from 'facetoken-api';

interface IdentitiesLedgerProps {
  contractAddress: string;
  ledgerLoading: boolean;
  ledgerError: string | null;
  tokens: FaceTokenEntry[];
  truncAddr: (addr: string) => string;
}

export default function IdentitiesLedger({
  contractAddress,
  ledgerLoading,
  ledgerError,
  tokens,
  truncAddr,
}: IdentitiesLedgerProps) {
  if (!contractAddress) return null;

  return (
    <section className="ledger-section">
      <h3>Registered Identities</h3>
      {ledgerLoading && tokens.length === 0 ? (
        <div className="ledger-loading">
          <div className="loading-spinner" />
        </div>
      ) : ledgerError ? (
        <div className="ledger-error">{ledgerError}</div>
      ) : tokens.length === 0 ? (
        <div className="ledger-empty">
          No registered identities on this contract yet.
        </div>
      ) : (
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Token ID</th>
              <th>Owner</th>
              <th>Face Hash</th>
              <th>Liveness</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((token) => (
              <tr key={token.tokenId}>
                <td>#{token.tokenId}</td>
                <td className="mono">{truncAddr(token.owner)}</td>
                <td className="mono">{truncAddr(token.faceHash)}</td>
                <td><span className="score-badge">{token.livenessScore}%</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
