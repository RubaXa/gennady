// @file: dashboard-entry — React DOM entry point for the inbox-dashboard SPA.
// @consumers: index.html (Vite)
// @tasks: TSK-107 TSK-169

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
