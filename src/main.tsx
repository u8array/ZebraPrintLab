import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted UI fonts (bundled by Vite) so the app needs no Google Fonts CDN
// and runs fully offline. Weights match the former CDN request (400/500/600).
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import './index.css'
import App from './App.tsx'
import { useLabelStore } from './store/labelStore'

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');
const root = createRoot(rootEl);

/** Cap on how long the first render waits for the active locale chunk. */
const LOCALE_BOOT_WAIT_MS = 250;

// Give the active locale chunk a brief head start so a persisted or
// browser-detected non-en language normally paints without an English
// flash, but never white-screen on a slow or stalled fetch: past the cap
// the app renders with en and the dictionary swaps in when it arrives
// (applyLocale keeps running and never rejects).
async function bootstrap() {
  const { locale, applyLocale, hydrateLabelaryApiKey } = useLabelStore.getState();
  // Load the API key from the OS credential store into memory before any
  // preview can fire; fire-and-forget so a slow keychain never delays paint.
  void hydrateLabelaryApiKey();
  let timeoutId: number | undefined;
  await Promise.race([
    applyLocale(locale),
    new Promise<void>((resolve) => {
      timeoutId = window.setTimeout(resolve, LOCALE_BOOT_WAIT_MS);
    }),
  ]);
  window.clearTimeout(timeoutId);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
