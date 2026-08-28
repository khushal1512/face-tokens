import { Buffer } from 'buffer';
(globalThis as any).Buffer = Buffer;

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import App from './App';
import './index.css';

const NETWORK_ID = import.meta.env.VITE_NETWORK_ID ?? 'preprod';
setNetworkId(NETWORK_ID as any);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
