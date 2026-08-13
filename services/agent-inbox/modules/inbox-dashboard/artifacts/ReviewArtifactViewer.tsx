// @file: ReviewArtifactViewer — addressable full artifact viewer with anchor selection.
// @consumers: MrWorkspace
// @tasks: TSK-182

import { useEffect, useState } from 'react';
import type { FeedWidget } from '../v2-types.ts';

/** @purpose Artifact list entry from the server — matches ArtifactRef in inbox-api/types.ts. */
type ArtifactRef = {
  /** @purpose Display name (e.g. REPORT.md), also the unique key within one MR's artifact list. */
  name: string;
  /** @purpose Unique artifact path key, passed back verbatim as the `path` query param. */
  path: string;
  /** @purpose Human-readable artifact kind. */
  kind: string;
};

/** @purpose Loaded artifact content — matches ArtifactContent in inbox-api/types.ts. */
type ArtifactContent = {
  /** @purpose Artifact text body. */
  content: string;
  /** @purpose Render hint for code highlighting or plain text. */
  kind: string;
};

/**
 * @purpose Addressable full artifact viewer: list, select, read artifact content, expose anchor selection.
 * @invariant Failure to load list or content stays inside this viewer — does not propagate outward.
 * @param props Active MR reference and anchor selection callback.
 */
export function ReviewArtifactViewer(props: {
  mrRef: string;
  onSelectAnchor: (anchor: FeedWidget['anchors'][number]) => void;
}) {
  const { mrRef, onSelectAnchor } = props;
  const [artifacts, setArtifacts] = useState<ArtifactRef[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<ArtifactContent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    // #region START_ARTIFACT_LIST_FETCH — failure mode: error stays local, list stays empty
    fetch(`/api/mr/${encodeURIComponent(mrRef)}/artifacts`)
      .then((response) => response.json())
      .then((body: { artifacts?: ArtifactRef[] }) => {
        setArtifacts(Array.isArray(body.artifacts) ? body.artifacts : []);
      })
      .catch(() => setArtifacts([]));
    // #endregion END_ARTIFACT_LIST_FETCH
  }, [mrRef]);

  useEffect(() => {
    if (!selectedPath) return;
    setContent(null);
    setLoadError(null);

    // #region START_ARTIFACT_CONTENT_FETCH — failure mode: error banner inside viewer
    fetch(`/api/mr/${encodeURIComponent(mrRef)}/artifact?path=${encodeURIComponent(selectedPath)}`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((body: ArtifactContent) => setContent(body))
      .catch((cause) =>
        setLoadError(cause instanceof Error ? cause.message : 'Не удалось загрузить артефакт')
      );
    // #endregion END_ARTIFACT_CONTENT_FETCH
  }, [mrRef, selectedPath]);

  const handleTextSelection = (artifactPath: string): void => {
    const quote = window.getSelection()?.toString().trim();
    if (!quote) return;
    onSelectAnchor({
      widgetId: `artifact:${artifactPath}`,
      artifactPath,
      quote,
      fragment: { start: 0, end: quote.length },
    });
  };

  return (
    <section className="v2-artifact-viewer" aria-label="Артефакты">
      <h3 className="v2-artifact-heading">Артефакты</h3>
      {artifacts.length === 0 ? (
        <p className="v2-muted">Нет доступных артефактов</p>
      ) : (
        <nav className="v2-artifact-list" aria-label="Список артефактов">
          {artifacts.map((artifact) => (
            <button
              key={artifact.path}
              className={`v2-artifact-item${selectedPath === artifact.path ? ' active' : ''}`}
              onClick={() => setSelectedPath(artifact.path)}
              aria-pressed={selectedPath === artifact.path}
            >
              {artifact.name}
              <span className="v2-artifact-kind">{artifact.kind}</span>
            </button>
          ))}
        </nav>
      )}
      {selectedPath && (
        <div
          className="v2-artifact-content"
          onMouseUp={() => handleTextSelection(selectedPath)}
          aria-label="Содержимое артефакта"
        >
          {loadError ? (
            <p className="v2-error" role="alert">
              {loadError}
            </p>
          ) : content ? (
            <pre className={`v2-artifact-body v2-artifact-kind-${content.kind}`}>
              {content.content}
            </pre>
          ) : (
            <p className="v2-muted">Загружаю…</p>
          )}
        </div>
      )}
    </section>
  );
}
