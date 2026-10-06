import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import './styles/global.css';
import './styles/fields.css';
import './styles/overlays.css';
import './styles/layout.css';
import './styles/clothing.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initPwa } from './utils/pwa';
import { applyTheme, useSettings } from './store/settings';

applyTheme(useSettings.getState().theme);
initPwa();

// Debug handle for automated tests: open the app with ?debug
if (new URLSearchParams(location.search).has('debug')) {
  void Promise.all([import('./store/editor'), import('./viewport/api'), import('./store/clothing'), import('./clothing/composite')]).then(([e, v, c, comp]) => {
    (window as unknown as Record<string, unknown>).__nexo = { editor: e.useEditor, viewport: v.viewportApi, clothing: c.useClothing, composite: comp };
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
