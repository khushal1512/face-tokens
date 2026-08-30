const FACTS = [
  ['Runs locally', 'The detection model and the camera feed both stay in this tab.'],
  ['Liveness gated', 'Two head turns are required, so a still image cannot pass.'],
  ['Hash only', 'Landmark ratios are hashed before anything is proved or submitted.'],
];

export default function IntroAndExplainer() {
  return (
    <section className="app-intro">
      <h1>Human verification without the surveillance</h1>
      <p className="app-intro-sub">
        Scan your face, generate a zero knowledge proof, and mint an attestation to your Midnight
        wallet. Your biometric data never leaves this device.
      </p>
      <ul className="fact-row">
        {FACTS.map(([title, body]) => (
          <li key={title}>
            <strong>{title}</strong>
            <span>{body}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
