import { type FaceTokenEntry } from 'facetoken-api';

interface IdentitiesLedgerProps {
  contractAddress: string;
  ledgerLoading: boolean;
  ledgerError: string | null;
  tokens: FaceTokenEntry[];
  tokenCount: number;
  truncAddr: (addr: string) => string;
}

export default function IdentitiesLedger({
  contractAddress,
  ledgerLoading,
  ledgerError,
  tokens,
  tokenCount,
  truncAddr,
}: IdentitiesLedgerProps) {
  if (!contractAddress) return null;

  return (
    <section className="ledger-section">
      <div className="ledger-head">
        <h3>Registered identities</h3>
        {tokenCount > 0 && <span className="ledger-count">{tokenCount} minted</span>}
      </div>

      {ledgerLoading && tokens.length === 0 ? (
        <div className="ledger-loading"><div className="loading-spinner" /></div>
      ) : ledgerError ? (
        <div className="ledger-error">{ledgerError}</div>
      ) : tokens.length === 0 ? (
        <div className="ledger-empty">No identities registered on this contract yet.</div>
      ) : (
        <div className="ledger-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Owner</th>
                <th>Face hash</th>
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
        </div>
      )}
    </section>
  );
}
