import { Buffer } from 'buffer';
// The Midnight SDK reaches for Node's Buffer, which the browser does not provide.
(globalThis as { Buffer?: typeof Buffer }).Buffer ??= Buffer;

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { setNetworkId, type NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import App from './App';
import './index.css';

setNetworkId((import.meta.env.VITE_NETWORK_ID ?? 'preprod') as NetworkId);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
);
