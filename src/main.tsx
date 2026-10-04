import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DialogProvider } from './components/common/dialogs';
import { ToastProvider } from './components/common/toasts';
import { AppProvider } from './state/AppContext';
import { AuthProvider } from './state/auth';
import { NavigationProvider } from './state/navigation';
import { PreferencesProvider } from './state/preferences';
import '@xyflow/react/dist/style.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/overlays.css';
import './styles/layout.css';
import './styles/flow.css';
import './styles/account.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferencesProvider>
      <AppProvider>
        <AuthProvider>
          <NavigationProvider>
            <DialogProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </DialogProvider>
          </NavigationProvider>
        </AuthProvider>
      </AppProvider>
    </PreferencesProvider>
  </StrictMode>,
);
