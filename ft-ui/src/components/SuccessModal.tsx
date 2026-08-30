import { useEffect } from 'react';

interface SuccessModalProps {
  show: boolean;
  onClose: () => void;
  faceHash: string | null;
  copyToClipboard: (text: string) => Promise<void>;
  copied: boolean;
}

export default function SuccessModal({ show, onClose, faceHash, copyToClipboard, copied }: SuccessModalProps) {
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="success-check" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2>Attestation minted</h2>
        <p>
          Your humanity is now verified on chain. The biometric vector never left this browser.
          Only the proof and the hash were submitted.
        </p>
        {faceHash && (
          <button className="hash-display" onClick={() => copyToClipboard(faceHash)} title="Click to copy">
            {copied ? 'Copied to clipboard' : faceHash}
          </button>
        )}
        <button className="btn-primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
