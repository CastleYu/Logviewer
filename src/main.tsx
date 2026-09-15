import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { SourceProvider } from './components/SourceNavigation';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SourceProvider><App /></SourceProvider>
  </StrictMode>,
);
