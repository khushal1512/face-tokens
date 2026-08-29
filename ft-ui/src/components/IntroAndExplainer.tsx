export default function IntroAndExplainer() {
  return (
    <>
      {/* ── Hero ─────────────────── */}
      <section className="hero-section">
        <h1>Human verification without the surveillance</h1>
        <p className="hero-sub">
          Most "are you human" checks send your face to a third-party server. They promise to delete it.
          They usually don't. ft. runs the entire face scan inside your browser, generates a zero-knowledge proof
          of your humanity, and mints an on-chain attestation. Your biometric data never leaves your device.
        </p>
      </section>

      {/* ── Problem / Solution ───── */}
      <div className="explainer-grid">
        <div className="explainer-card problem">
          <h3>The problem with current verification</h3>
          <ul>
            <li>Raw facial images are uploaded to third-party servers</li>
            <li>Companies retain biometric data indefinitely despite privacy policies</li>
            <li>Centralized databases become high-value targets for breaches</li>
            <li>Users have no way to verify that their data was actually deleted</li>
          </ul>
        </div>
        <div className="explainer-card solution">
          <h3>What ft. does differently</h3>
          <ul>
            <li>Face detection runs entirely in your browser using a local AI model</li>
            <li>Facial landmarks are converted into distance ratios, not stored as images</li>
            <li>A liveness check (turn left, turn right) proves you are a real person</li>
            <li>Only a cryptographic hash and a ZK proof are sent to the blockchain</li>
          </ul>
        </div>
      </div>

      {/* ── How it Works ─────────── */}
      <div className="how-it-works">
        <h2>How it works</h2>
        <div className="steps-row">
          <div className="step-card">
            <h4>Open camera</h4>
            <p>The browser loads a lightweight face detection model. No server roundtrip.</p>
          </div>
          <div className="step-card">
            <h4>Detect and verify</h4>
            <p>Landmark dots appear on your face. A liveness check asks you to turn your head.</p>
          </div>
          <div className="step-card">
            <h4>Hash locally</h4>
            <p>Facial distances are normalized and hashed. The raw vector stays in memory and is never transmitted.</p>
          </div>
          <div className="step-card">
            <h4>Mint on-chain</h4>
            <p>A ZK proof is generated and an NFT attestation is minted to your Midnight wallet.</p>
          </div>
        </div>
      </div>
    </>
  );
}
