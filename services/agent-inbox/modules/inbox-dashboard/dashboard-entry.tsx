// @file: dashboard-entry — React DOM entry point for the inbox-dashboard SPA.
// @spec: AGENT-INBOX-INBOX-DASHBOARD
// @consumers: index.html (Vite)

import '@fontsource/geist';
import '@fontsource/jetbrains-mono';

import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('[dashboard-entry] Root element #root not found');
}

createRoot(root).render(<App />);
