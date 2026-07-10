// @file: App — inbox-dashboard SPA entry point with hash router and BoardStore provider.
// @consumers: index.html (Vite entry)
// @tasks: TSK-107

import { useState, useEffect } from 'react';
import { BoardStore } from './services/board-store.tsx';
import { Header } from './components/Header.tsx';
import { BoardPage } from './components/BoardPage.tsx';
import { MrDetailPage } from './components/MrDetailPage.tsx';

/**
 * @purpose Root application component — wraps BoardStore and routes via hash.
 */
export function App() {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '/');

  useEffect(() => {
    const handler = () => setHash(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  /**
   * @purpose Parse hash to determine route.
   */
  const resolveRoute = (): { mrId: string | null } => {
    const mrMatch = hash.match(/^\/mr\/(.+)$/);
    return { mrId: mrMatch ? decodeURIComponent(mrMatch[1]!) : null };
  };

  const { mrId } = resolveRoute();

  return (
    <BoardStore>
      <div className="min-h-screen bg-background text-foreground">
        <Header />
        {mrId ? <MrDetailPage mrId={mrId} /> : <BoardPage />}
      </div>
    </BoardStore>
  );
}
