import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppViewport } from './shell/app-viewport';
import { PwaServiceWorker } from './shell/pwa-service-worker';
import App from './shell/root';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PwaServiceWorker />
    <AppViewport><App /></AppViewport>
  </StrictMode>,
);
