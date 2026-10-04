import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DialogProvider } from './components/common/dialogs';
import { ToastProvider } from './components/common/toasts';
import { AppProvider } from './state/AppContext';
import { AuthProvider } from './state/auth';
import { SyncProvider } from './state/sync';
import { SyncNotices } from './components/account/SyncNotices';
import { NavigationProvider } from './state/navigation';
import { PreferencesProvider } from './state/preferences';
import { TourProvider } from './state/tour';
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
          <SyncProvider>
            <NavigationProvider>
              <TourProvider>
                <DialogProvider>
                  <ToastProvider>
                    <App />
                    <SyncNotices />
                  </ToastProvider>
                </DialogProvider>
              </TourProvider>
            </NavigationProvider>
          </SyncProvider>
        </AuthProvider>
      </AppProvider>
    </PreferencesProvider>
  </StrictMode>,
);
