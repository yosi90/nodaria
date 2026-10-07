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
import { RequestsProvider } from './state/requests';
import { SyncNotices } from './components/account/SyncNotices';
import { StorageError } from './components/layout/StorageError';
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
import './styles/requests.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferencesProvider>
      <AppProvider errorView={error => <StorageError message={error.message} />}>
        <AuthProvider>
          <SyncProvider>
            <RequestsProvider>
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
            </RequestsProvider>
          </SyncProvider>
        </AuthProvider>
      </AppProvider>
    </PreferencesProvider>
  </StrictMode>,
);
