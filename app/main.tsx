import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppViewport } from './components/app-viewport';
import { PwaServiceWorker } from './components/pwa-service-worker';
import App from './page';
import './globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PwaServiceWorker />
    <AppViewport><App /></AppViewport>
  </StrictMode>,
);
