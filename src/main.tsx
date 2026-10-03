import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppProvider } from './state/AppContext';
import './styles/index.css';
import './styles/overlays.css';
import './styles/schema-fields.css';
import './styles/graph-tooltip.css';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
