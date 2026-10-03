import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DialogProvider } from './components/common/dialogs';
import { ToastProvider } from './components/common/toasts';
import { AppProvider } from './state/AppContext';
import { PreferencesProvider } from './state/preferences';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/overlays.css';
import './styles/layout.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferencesProvider>
      <AppProvider>
        <DialogProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </DialogProvider>
      </AppProvider>
    </PreferencesProvider>
  </StrictMode>,
);
