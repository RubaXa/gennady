// @file: ArtifactBrowser — artifact navigation (REPORT/PLAN/tracks/HISTORY/coverage/tool-log) + selected-artifact render.
// @consumers: MrDetailPage
// @tasks: TSK-107, TSK-133

import { useState, useEffect } from 'react';
import { FileText, Loader2, AlertTriangle } from 'lucide-react';
import { listArtifacts, readArtifact } from '../services/api-client.ts';
import { ArtifactView } from './ArtifactView.tsx';
import { cn } from '../lib/utils.ts';
import type { ArtifactRef, ArtifactContent } from '../../inbox-api/types.ts';

/**
 * @purpose Pick the default artifact to open on mount — prefer REPORT.md, else first entry.
 * @param artifacts Available artifacts for the MR.
 * @returns The artifact to select first, or undefined when the list is empty.
 */
function pickDefaultArtifact(artifacts: ArtifactRef[]): ArtifactRef | undefined {
  return artifacts.find((a) => a.name === 'REPORT.md') ?? artifacts[0];
}

/**
 * @purpose Artifact browser: left-hand nav list over GET /api/mr/:id/artifacts, right-hand render
 *   of the selected artifact via ArtifactView.
 * @param props MR identifier for scoping API calls, plus an optional `refreshToken` — bumping it
 *   (e.g. on an SSE `refresh` frame relayed by the parent) forces a re-fetch of both the artifact
 *   list and the currently open artifact's content (TSK-133). `onActiveArtifactChange` — optional
 *   callback fired whenever the rendered artifact's identity/content changes, so a parent (e.g.
 *   MrDetailPage) can thread `{name, rawText}` into `SelectionPill` for real file:line origin
 *   resolution (D-115).
 */
export function ArtifactBrowser(props: {
  mrId: string;
  refreshToken?: number | string;
  onActiveArtifactChange?: (artifact: { name: string; rawText: string } | null) => void;
}) {
  const { mrId, refreshToken, onActiveArtifactChange } = props;
  const [artifacts, setArtifacts] = useState<ArtifactRef[]>([]);
  const [selected, setSelected] = useState<ArtifactRef | null>(null);
  const [content, setContent] = useState<ArtifactContent | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);

  // Load the artifact list once per MR, then auto-select REPORT.md (or the first entry). Also
  // re-runs whenever `refreshToken` changes — the parent bumps it on an SSE `refresh` frame so a
  // mutation applied elsewhere is reflected here without a full page reload (TSK-133).
  useEffect(() => {
    let cancelled = false;
    setLoadingList(true);
    setListError(null);
    void (async () => {
      try {
        const refs = await listArtifacts(mrId);
        if (cancelled) return;
        setArtifacts(refs);
        setSelected(pickDefaultArtifact(refs) ?? null);
      } catch (_cause) {
        if (!cancelled) setListError('Не удалось загрузить список артефактов');
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mrId, refreshToken]);

  // Fetch content whenever the selected artifact changes, or `refreshToken` bumps (TSK-133) — a
  // mutation may have changed the currently open artifact's content on disk.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoadingContent(true);
    setContentError(null);
    void (async () => {
      try {
        const data = await readArtifact(mrId, selected.path);
        if (!cancelled) setContent(data);
      } catch (_cause) {
        if (!cancelled) setContentError(`Не удалось загрузить артефакт: ${selected.name}`);
      } finally {
        if (!cancelled) setLoadingContent(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mrId, selected, refreshToken]);

  // Notify the parent of the currently rendered artifact's identity + raw text (D-115) — feeds
  // SelectionPill's real file:line origin resolution. Fires `null` while nothing is selected/loaded.
  useEffect(() => {
    if (!selected || !content) {
      onActiveArtifactChange?.(null);
      return;
    }
    onActiveArtifactChange?.({ name: selected.name, rawText: content.content });
  }, [selected, content, onActiveArtifactChange]);

  return (
    <div className="flex gap-3 min-h-0 flex-1">
      <nav
        aria-label="Артефакты"
        className="w-56 shrink-0 rounded-md border border-border bg-card overflow-y-auto"
      >
        {loadingList && (
          <div className="flex items-center justify-center p-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
        {listError && (
          <div className="flex items-center gap-1.5 p-3 text-[12px] text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {listError}
          </div>
        )}
        {!loadingList && !listError && (
          <ul role="list" className="py-1">
            {artifacts.map((artifact) => (
              <li key={artifact.path}>
                <button
                  onClick={() => setSelected(artifact)}
                  aria-current={selected?.path === artifact.path ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[12px] transition-colors',
                    selected?.path === artifact.path
                      ? 'bg-primary/15 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                  )}
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{artifact.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      <div className="flex-1 min-w-0 rounded-md border border-border bg-card overflow-y-auto p-3">
        {loadingContent && (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {contentError && (
          <div className="flex items-center gap-1.5 text-[13px] text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {contentError}
          </div>
        )}
        {!loadingContent && !contentError && content && (
          <ArtifactView content={content.content} kind={content.kind} />
        )}
        {!loadingList && !listError && artifacts.length === 0 && (
          <div className="text-[13px] text-muted-foreground">Нет доступных артефактов.</div>
        )}
      </div>
    </div>
  );
}
