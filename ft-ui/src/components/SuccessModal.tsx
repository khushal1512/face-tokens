interface SuccessModalProps {
  show: boolean;
  onClose: () => void;
  faceHash: string | null;
  copyToClipboard: (text: string) => Promise<void>;
  copied: boolean;
}

export default function SuccessModal({
  show,
  onClose,
  faceHash,
  copyToClipboard,
  copied,
}: SuccessModalProps) {
  if (!show) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="success-check">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2>Mint Successful</h2>
        <p>Your humanity has been verified on-chain. The biometric vector never left your browser. Only the zero-knowledge proof was submitted.</p>
        {faceHash && (
          <div className="hash-display" onClick={() => copyToClipboard(faceHash)} title="Click to copy">
            {copied ? 'Copied to clipboard' : faceHash}
          </div>
        )}
        <button className="btn-primary" onClick={onClose}>
          Continue
        </button>
      </div>
    </div>
  );
}
