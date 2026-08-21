// @file: ReviewArtifactViewer — product-level review center over materialized pipeline artifacts.
// @consumers: MrWorkspace

import { useEffect, useMemo, useState } from 'react';
import type { FeedWidget } from '../v2-types.ts';
import { MarkdownContent } from '../markdown/MarkdownContent.tsx';

type ArtifactRef = { name: string; path: string; kind: string };
type ArtifactContent = { content: string; kind: string };
type JsonRecord = Record<string, unknown>;
type ReviewDiagram = {
  kind: 'change-map' | 'c4' | 'behaviour' | 'use-cases';
  title: string;
  caption: string;
  nodes: Array<{ id: string; label: string; detail?: string; tone?: string }>;
  edges: Array<{ from: string; to: string; label?: string }>;
};
type ReviewDiagramKind = ReviewDiagram['kind'];

const PINNED_ORDER = [
  'REVIEW.md',
  'review.json',
  'verdict.json',
  'plan.json',
  'coverage.json',
  'PLAN.md',
  'tail_reviewer.json',
];

function groupFor(path: string): 'summary' | 'tracks' | 'lenses' | 'evidence' {
  if (path.startsWith('tasks/track_')) return 'tracks';
  if (path.startsWith('tasks/lens_')) return 'lenses';
  if (PINNED_ORDER.includes(path)) return 'summary';
  return 'evidence';
}

function artifactLabel(path: string): string {
  if (path === 'REVIEW.md') return 'Итог ревью — документ';
  if (path === 'review.json') return 'Сводное ревью';
  if (path === 'verdict.json') return 'Вердикт';
  if (path === 'plan.json') return 'План и дорожки';
  if (path === 'coverage.json') return 'Покрытие changeset';
  if (path === 'PLAN.md') return 'План — документ';
  if (path === 'tail_reviewer.json') return 'Финальная проверка';
  return path
    .replace(/^tasks\//, '')
    .replace(/\.md$/, '')
    .replace(/\.result\.json$/, '')
    .replace(/^track_/, 'Дорожка · ')
    .replace(/^lens_/, 'Линза · ')
    .replaceAll('_', ' ');
}

function parseRecord(content: ArtifactContent | null): JsonRecord | null {
  if (!content || content.kind !== 'json') return null;
  try {
    const parsed: unknown = JSON.parse(content.content);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as JsonRecord)
      : null;
  } catch {
    return null;
  }
}

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function reviewDiagrams(value: unknown): ReviewDiagram[] {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is ReviewDiagram => {
    if (!candidate || typeof candidate !== 'object') return false;
    const item = candidate as JsonRecord;
    return (
      ['change-map', 'c4', 'behaviour', 'use-cases'].includes(String(item.kind)) &&
      typeof item.title === 'string' &&
      Array.isArray(item.nodes) &&
      Array.isArray(item.edges)
    );
  });
}

function diagramTextLines(value: string): string[] {
  if (value.length <= 18) return [value];
  const words = value.split(/\s+/);
  const lines: string[] = [];
  for (const word of words) {
    const current = lines.at(-1);
    if (!current || current.length + word.length + 1 > 18) lines.push(word);
    else lines[lines.length - 1] = `${current} ${word}`;
  }
  return lines.slice(0, 2);
}

function ReviewDiagramCanvas(props: { diagram: ReviewDiagram; expanded?: boolean }) {
  const width = 1440;
  const height = props.expanded ? 500 : 390;
  const nodeWidth = 220;
  const nodeHeight = 112;
  const gap =
    (width - 100 - nodeWidth * props.diagram.nodes.length) /
    Math.max(1, props.diagram.nodes.length - 1);
  const nodeY = props.expanded ? 170 : 130;
  const positions = new Map(
    props.diagram.nodes.map((node, index) => [
      node.id,
      { x: 50 + index * (nodeWidth + gap), y: nodeY },
    ])
  );
  const markerId = `arrow-${props.diagram.kind}-${props.expanded ? 'full' : 'preview'}`;
  return (
    <svg
      className="v2-analysis-svg"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={props.diagram.title}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <marker id={markerId} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" />
        </marker>
      </defs>
      {props.diagram.kind === 'c4' && (
        <rect className="v2-analysis-boundary" x="22" y="104" width="1396" height="210" rx="4" />
      )}
      {props.diagram.edges.map((edge) => {
        const from = positions.get(edge.from);
        const to = positions.get(edge.to);
        if (!from || !to) return null;
        const startX = from.x + nodeWidth;
        const endX = to.x;
        const y = from.y + nodeHeight / 2;
        return (
          <g key={`${edge.from}:${edge.to}`}>
            <line
              className="v2-analysis-edge"
              x1={startX + 8}
              y1={y}
              x2={endX - 12}
              y2={y}
              markerEnd={`url(#${markerId})`}
            />
            {edge.label && (
              <text className="v2-analysis-edge-label" x={(startX + endX) / 2} y={y - 14}>
                {edge.label}
              </text>
            )}
          </g>
        );
      })}
      {props.diagram.nodes.map((node) => {
        const position = positions.get(node.id)!;
        const labelLines = diagramTextLines(node.label);
        return (
          <g className={`v2-analysis-svg-node ${node.tone ?? ''}`} key={node.id}>
            <rect
              x={position.x}
              y={position.y}
              width={nodeWidth}
              height={nodeHeight}
              rx={node.tone === 'actor' ? 56 : 3}
            />
            <text
              className="v2-analysis-svg-label"
              x={position.x + nodeWidth / 2}
              y={position.y + 41}
            >
              {labelLines.map((line, index) => (
                <tspan key={line} x={position.x + nodeWidth / 2} dy={index === 0 ? 0 : 20}>
                  {line}
                </tspan>
              ))}
            </text>
            {node.detail && (
              <text
                className="v2-analysis-svg-detail"
                x={position.x + nodeWidth / 2}
                y={position.y + 90}
              >
                {node.detail.length > 28 ? `${node.detail.slice(0, 27)}…` : node.detail}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function ReviewDiagramPreview(props: {
  diagram: ReviewDiagram;
  index: number;
  expanded?: boolean;
}) {
  const { diagram } = props;
  return (
    <div className={`v2-analysis-diagram ${diagram.kind} ${props.expanded ? 'expanded' : ''}`}>
      <header>
        <span>0{props.index + 1}</span>
        <div>
          <b>{diagram.title}</b>
          <small>{diagram.caption}</small>
        </div>
      </header>
      <ReviewDiagramCanvas diagram={diagram} expanded={props.expanded} />
      <footer>
        {diagram.edges.slice(0, 4).map((edge) => (
          <span key={`${edge.from}:${edge.to}`}>
            {edge.from} → {edge.to}
            {edge.label ? ` · ${edge.label}` : ''}
          </span>
        ))}
      </footer>
    </div>
  );
}

function ReviewDiagramGallery(props: {
  diagrams: ReviewDiagram[];
  onOpen?: (diagram: ReviewDiagram) => void;
}) {
  return (
    <div className="v2-analysis-gallery" aria-label="Четыре схемы разбора MR">
      {props.diagrams.slice(0, 4).map((diagram, index) =>
        props.onOpen ? (
          <button
            key={diagram.kind}
            onClick={() => props.onOpen?.(diagram)}
            aria-label={`Открыть схему «${diagram.title}» в полном размере`}
          >
            <ReviewDiagramPreview diagram={diagram} index={index} />
            <span className="v2-analysis-open">↗ Открыть в полном размере</span>
          </button>
        ) : (
          <ReviewDiagramPreview key={diagram.kind} diagram={diagram} index={index} />
        )
      )}
    </div>
  );
}

function ReviewDiagramReportPage(props: {
  diagram: ReviewDiagram;
  index: number;
  onBack: () => void;
}) {
  return (
    <section className="v2-diagram-report" aria-label={`Полная схема: ${props.diagram.title}`}>
      <header>
        <div>
          <span>СХЕМА 0{props.index + 1} · REVIEW REPORT</span>
          <h3>{props.diagram.title}</h3>
          <p>{props.diagram.caption}</p>
        </div>
        <button onClick={props.onBack}>← Ко всем схемам</button>
      </header>
      <ReviewDiagramPreview diagram={props.diagram} index={props.index} expanded />
      <div className="v2-diagram-report-legend">
        <span>
          <i className="changed" /> изменено в MR
        </span>
        <span>
          <i /> существующий контекст
        </span>
        <span>
          <i className="external" /> внешний участник
        </span>
      </div>
    </section>
  );
}

function ReviewOverview(props: {
  document: JsonRecord;
  diagramKind?: ReviewDiagramKind | null;
  onOpenDiagram?: (kind: ReviewDiagramKind) => void;
}) {
  const findings = Array.isArray(props.document.findings)
    ? (props.document.findings as JsonRecord[])
    : [];
  const diagrams = reviewDiagrams(props.document.diagrams);
  const selectedDiagram = props.diagramKind
    ? diagrams.find((diagram) => diagram.kind === props.diagramKind)
    : undefined;
  if (selectedDiagram) {
    return (
      <ReviewDiagramReportPage
        diagram={selectedDiagram}
        index={diagrams.indexOf(selectedDiagram)}
        onBack={() => props.onOpenDiagram?.(selectedDiagram.kind)}
      />
    );
  }
  return (
    <div className="v2-review-overview">
      <div className="v2-review-hero">
        <span>ИТОГ РЕВЬЮ</span>
        <strong>{String(props.document.verdict ?? 'COMMENT')}</strong>
        <small>revision {String(props.document.revision ?? '—')}</small>
      </div>
      <div className="v2-review-stat-grid">
        <div>
          <b>{findings.length}</b>
          <span>находок</span>
        </div>
        <div>
          <b>{findings.filter((item) => item.severity === 'high').length}</b>
          <span>критичных</span>
        </div>
        <div>
          <b>{findings.filter((item) => item.factcheck === 'verified').length}</b>
          <span>проверено</span>
        </div>
      </div>
      {diagrams.length > 0 && (
        <ReviewDiagramGallery
          diagrams={diagrams}
          onOpen={
            props.onOpenDiagram ? (diagram) => props.onOpenDiagram?.(diagram.kind) : undefined
          }
        />
      )}
      {findings.length === 0 ? (
        <div className="v2-review-clear">✓ Замечаний, требующих публикации, не найдено</div>
      ) : (
        <div className="v2-review-findings">
          {findings.map((finding, index) => (
            <article key={String(finding.id ?? index)}>
              <span>{String(finding.severity ?? 'info')}</span>
              <b>{String(finding.summary ?? finding.message ?? `Находка ${index + 1}`)}</b>
              <code>
                {String(finding.file ?? '')}
                {finding.line ? `:${String(finding.line)}` : ''}
              </code>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function PlanOverview(props: { document: JsonRecord }) {
  const tracks = Array.isArray(props.document.tracks)
    ? (props.document.tracks as JsonRecord[])
    : [];
  const stages = Array.isArray(props.document.stages)
    ? (props.document.stages as JsonRecord[])
    : [];
  return (
    <div className="v2-plan-overview">
      <div className="v2-plan-overview-head">
        <div>
          <span>ТЕКУЩИЙ ПЛАН</span>
          <strong>
            {tracks.length} дорожки · {stages.length} стадий
          </strong>
        </div>
        <span className="v2-status-success">✓ завершён</span>
      </div>
      <div className="v2-plan-overview-progress">
        <span style={{ width: '100%' }} />
      </div>
      <ReviewFlowDiagram tracks={tracks} />
      <div className="v2-track-grid">
        {tracks.map((track) => (
          <article key={String(track.id)}>
            <header>
              <span>✓</span>
              <b>{String(track.name ?? track.id)}</b>
            </header>
            <p>{String(track.focus ?? 'Review track')}</p>
            <footer>{countArray(track.files)} файлов</footer>
          </article>
        ))}
      </div>
    </div>
  );
}

function ResultOverview(props: { document: JsonRecord; label: string }) {
  const findings = Array.isArray(props.document.findings)
    ? (props.document.findings as JsonRecord[])
    : [];
  return (
    <div className="v2-result-overview">
      <header>
        <div>
          <span>АРТЕФАКТ АНАЛИЗА</span>
          <h3>{props.label}</h3>
        </div>
        <span className="v2-status-success">{String(props.document.status ?? 'done')}</span>
      </header>
      <div className="v2-result-meta">
        <span>{countArray(props.document.files)} файлов</span>
        <span>{findings.length} находок</span>
        <span>{String(props.document.model ?? 'dynamic mock')}</span>
      </div>
      {Array.isArray(props.document.files) && props.document.files.length > 0 && (
        <details className="v2-result-files">
          <summary>Проверенный scope · {props.document.files.length} файлов</summary>
          <ul>
            {props.document.files.map((file) => (
              <li key={String(file)}>
                <code>{String(file)}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
      {findings.length === 0 ? (
        <div className="v2-review-clear">✓ Дорожка проверена — замечаний нет</div>
      ) : (
        findings.map((finding, index) => (
          <article className="v2-result-finding" key={String(finding.id ?? index)}>
            <b>{String(finding.summary ?? finding.message ?? `Находка ${index + 1}`)}</b>
            <code>{String(finding.file ?? '')}</code>
          </article>
        ))
      )}
    </div>
  );
}

function ArtifactBody(props: {
  selectedPath: string;
  content: ArtifactContent;
  artifactPaths: string[];
  onOpen: (path: string) => void;
  diagramKind?: ReviewDiagramKind | null;
  onOpenDiagram?: (kind: ReviewDiagramKind) => void;
}) {
  const document = parseRecord(props.content);
  if (props.selectedPath === 'review.json' && document)
    return (
      <ReviewOverview
        document={document}
        diagramKind={props.diagramKind}
        onOpenDiagram={props.onOpenDiagram}
      />
    );
  if (props.selectedPath === 'plan.json' && document) return <PlanOverview document={document} />;
  if (/^tasks\/(track|lens)_/.test(props.selectedPath) && document) {
    return <ResultOverview document={document} label={artifactLabel(props.selectedPath)} />;
  }
  if (props.content.kind === 'md') {
    const workerReports = props.artifactPaths.filter((path) =>
      /^tasks\/(track|lens)_.+\.md$/.test(path)
    );
    return (
      <div className="v2-readable-report">
        {props.selectedPath === 'REVIEW.md' && workerReports.length > 0 && (
          <nav className="v2-report-drilldown" aria-label="Перейти к результатам дорожек">
            <span>ОТКРЫТЬ РЕЗУЛЬТАТ СЕССИИ</span>
            <div>
              {workerReports.map((path) => (
                <button key={path} onClick={() => props.onOpen(path)}>
                  {artifactLabel(path)} →
                </button>
              ))}
            </div>
          </nav>
        )}
        <MarkdownContent source={props.content.content} onOpenArtifact={props.onOpen} />
      </div>
    );
  }
  if (document) return <pre className="v2-json-view">{JSON.stringify(document, null, 2)}</pre>;
  return <pre className="v2-json-view">{props.content.content}</pre>;
}

/** @purpose Visual map derived from the materialized review plan, not from demo fixtures. */
function ReviewFlowDiagram(props: { tracks: JsonRecord[] }) {
  const tracks = props.tracks.slice(0, 4);
  return (
    <div className="v2-review-map" role="img" aria-label="Схема дорожек и синтеза ревью">
      <div className="v2-map-node source">
        <span>CHANGESET</span>
        <b>{tracks.reduce((sum, track) => sum + countArray(track.files), 0)} files</b>
      </div>
      <div className="v2-map-connector" aria-hidden="true" />
      <div className="v2-map-tracks">
        {tracks.map((track) => (
          <div className="v2-map-node" key={String(track.id)}>
            <span>TRACK</span>
            <b>{String(track.name ?? track.id)}</b>
          </div>
        ))}
      </div>
      <div className="v2-map-connector" aria-hidden="true" />
      <div className="v2-map-node synthesis">
        <span>SYNTHESIS</span>
        <b>Review</b>
      </div>
    </div>
  );
}

/** @purpose Compact visual attachment showing the actual synthesized finding distribution. */
function ReviewFindingsChart(props: { findings: JsonRecord[] }) {
  const values = [
    {
      label: 'HIGH',
      value: props.findings.filter((item) => ['error', 'high'].includes(String(item.severity)))
        .length,
      className: 'high',
    },
    {
      label: 'MED',
      value: props.findings.filter((item) => ['warning', 'medium'].includes(String(item.severity)))
        .length,
      className: 'medium',
    },
    {
      label: 'INFO',
      value: props.findings.filter((item) => String(item.severity) === 'info').length,
      className: 'info',
    },
  ];
  const max = Math.max(1, ...values.map((item) => item.value));
  return (
    <div className="v2-findings-chart" role="img" aria-label="График находок по критичности">
      <header>
        <span>FINDINGS GRAPH</span>
        <b>{props.findings.length} всего</b>
      </header>
      <div>
        {values.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <i className={item.className} style={{ width: `${(item.value / max) * 100}%` }} />
            <b>{item.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * @purpose Facebook-style feed post summarizing real materialized review artifacts.
 * @param props MR ref plus open/discuss callbacks for the post.
 */
export function ReviewArtifactPost(props: {
  mrRef: string;
  onOpen: (path: string) => void;
  onDiscuss: (anchor: FeedWidget['anchors'][number]) => void;
  onOpenDiagram?: (kind: ReviewDiagramKind) => void;
}) {
  const [artifacts, setArtifacts] = useState<ArtifactRef[]>([]);
  const [review, setReview] = useState<JsonRecord | null>(null);

  useEffect(() => {
    const base = `/api/mr/${encodeURIComponent(props.mrRef)}`;
    void fetch(`${base}/artifacts`)
      .then((response) => response.json())
      .then((body: { artifacts?: ArtifactRef[] }) =>
        setArtifacts(Array.isArray(body.artifacts) ? body.artifacts : [])
      );
    void fetch(`${base}/artifact?path=${encodeURIComponent('review.json')}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: ArtifactContent | null) => setReview(parseRecord(body)));
  }, [props.mrRef]);

  if (artifacts.length === 0) return null;
  const reviewFindings = Array.isArray(review?.findings) ? (review.findings as JsonRecord[]) : [];
  const diagrams = reviewDiagrams(review?.diagrams);
  const findings = reviewFindings.length;
  return (
    <article className="v2-feed-post v2-artifact-post" aria-label="Артефакты ревью">
      <header>
        <div className="v2-post-avatar">📄</div>
        <div>
          <b>Ревью завершено</b>
          <span>Синтез · {artifacts.length} материалов</span>
        </div>
        <span className="v2-post-status">{String(review?.verdict ?? 'READY')}</span>
      </header>
      <div className="v2-post-copy">
        <h3>Сводное ревью и схемы разбора</h3>
        <p>
          {diagrams.length} содержательные схемы, {findings} находок. Это архитектура изменения,
          поток данных и продуктовые сценарии — не карта работы агентов.
        </p>
      </div>
      {diagrams.length > 0 && (
        <ReviewDiagramGallery
          diagrams={diagrams}
          onOpen={(diagram) =>
            props.onOpenDiagram ? props.onOpenDiagram(diagram.kind) : props.onOpen('review.json')
          }
        />
      )}
      <button className="v2-findings-attachment" onClick={() => props.onOpen('review.json')}>
        <ReviewFindingsChart findings={reviewFindings} />
      </button>
      <footer>
        <button
          onClick={() =>
            props.onOpen(
              artifacts.some((item) => item.path === 'REVIEW.md') ? 'REVIEW.md' : 'review.json'
            )
          }
        >
          Читать итог ревью
        </button>
        <button
          onClick={() =>
            props.onDiscuss({
              widgetId: 'artifact:review.json',
              artifactPath: 'review.json',
              quote: 'Сводное ревью',
            })
          }
        >
          💬 Обсудить с агентом
        </button>
      </footer>
    </article>
  );
}

/**
 * @purpose Review center with semantic groups, automatic summary selection and rich artifact projections.
 * @param props MR ref, anchor-selection callback and optional initial artifact path.
 */
export function ReviewArtifactViewer(props: {
  mrRef: string;
  onSelectAnchor: (anchor: FeedWidget['anchors'][number]) => void;
  initialPath?: string | null;
  onClose?: () => void;
  diagramKind?: ReviewDiagramKind | null;
  onOpenDiagram?: (kind: ReviewDiagramKind | null) => void;
}) {
  const { mrRef, onSelectAnchor } = props;
  const [artifacts, setArtifacts] = useState<ArtifactRef[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<ArtifactContent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [catalogCollapsed, setCatalogCollapsed] = useState(false);

  useEffect(() => {
    fetch(`/api/mr/${encodeURIComponent(mrRef)}/artifacts`)
      .then((response) => response.json())
      .then((body: { artifacts?: ArtifactRef[] }) => {
        const next = Array.isArray(body.artifacts) ? body.artifacts : [];
        setArtifacts(next);
        setSelectedPath(
          (current) =>
            props.initialPath ??
            current ??
            next.find((item) => item.path === 'REVIEW.md')?.path ??
            next.find((item) => item.path === 'review.json')?.path ??
            next[0]?.path ??
            null
        );
      })
      .catch(() => setArtifacts([]));
  }, [mrRef, props.initialPath]);

  useEffect(() => {
    if (!selectedPath) return;
    setContent(null);
    setLoadError(null);
    fetch(`/api/mr/${encodeURIComponent(mrRef)}/artifact?path=${encodeURIComponent(selectedPath)}`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((body: ArtifactContent) => setContent(body))
      .catch((cause) =>
        setLoadError(cause instanceof Error ? cause.message : 'Не удалось загрузить артефакт')
      );
  }, [mrRef, selectedPath]);

  const groups = useMemo(() => {
    const readableWorkerIds = new Set(
      artifacts
        .filter((item) => /^tasks\/(track|lens)_.+\.md$/.test(item.path))
        .map((item) => item.path.replace(/\.md$/, ''))
    );
    const visible = artifacts.filter((item) => {
      const workerId = item.path
        .replace(/\.opencode-[^.]+\.result\.json$/, '')
        .replace(/\.result\.json$/, '');
      return !readableWorkerIds.has(workerId) || item.path.endsWith('.md');
    });
    return {
      summary: visible.filter((item) => groupFor(item.path) === 'summary'),
      tracks: visible.filter((item) => groupFor(item.path) === 'tracks'),
      lenses: visible.filter((item) => groupFor(item.path) === 'lenses'),
      evidence: visible.filter((item) => groupFor(item.path) === 'evidence'),
    };
  }, [artifacts]);
  const navigationArtifacts = useMemo(
    () => [...groups.summary, ...groups.tracks, ...groups.lenses, ...groups.evidence],
    [groups]
  );
  const selectedIndex = navigationArtifacts.findIndex((artifact) => artifact.path === selectedPath);

  const handleTextSelection = (): void => {
    const quote = window.getSelection()?.toString().trim();
    if (!quote || !selectedPath) return;
    onSelectAnchor({
      widgetId: `artifact:${selectedPath}`,
      artifactPath: selectedPath,
      quote,
      fragment: { start: 0, end: quote.length },
    });
  };

  return (
    <section className="v2-artifact-center" aria-label="Центр артефактов ревью">
      <header className="v2-artifact-center-head">
        <div>
          <span>REVIEW OUTPUT</span>
          <h2>Артефакты ревью</h2>
          <small>{props.mrRef}</small>
        </div>
        <div className="v2-artifact-health">
          <i /> {artifacts.length} материалов · pipeline complete
        </div>
        {props.diagramKind && (
          <button
            className="v2-artifact-catalog-toggle"
            onClick={() => setCatalogCollapsed((value) => !value)}
          >
            {catalogCollapsed ? '☰ Показать каталог' : '↔ Развернуть схему'}
          </button>
        )}
        {props.onClose && (
          <button className="v2-artifact-close" onClick={props.onClose}>
            ← Вернуться в ленту
          </button>
        )}
      </header>
      {artifacts.length === 0 ? (
        <p className="v2-muted">Артефакты ещё не материализованы</p>
      ) : (
        <div className={`v2-artifact-layout ${catalogCollapsed ? 'catalog-collapsed' : ''}`}>
          <nav className="v2-artifact-nav" aria-label="Навигация по артефактам">
            {(
              [
                ['summary', 'СВОДКА'],
                ['tracks', 'ДОРОЖКИ'],
                ['lenses', 'ЛИНЗЫ'],
                ['evidence', 'ДОКАЗАТЕЛЬСТВА'],
              ] as const
            ).map(
              ([key, title]) =>
                groups[key].length > 0 && (
                  <section key={key}>
                    <h3>
                      {title}
                      <span>{groups[key].length}</span>
                    </h3>
                    {groups[key].map((artifact) => (
                      <button
                        key={artifact.path}
                        className={selectedPath === artifact.path ? 'active' : ''}
                        onClick={() => setSelectedPath(artifact.path)}
                        aria-pressed={selectedPath === artifact.path}
                      >
                        <span>
                          {key === 'summary'
                            ? '▣'
                            : key === 'tracks'
                              ? '↳'
                              : key === 'lenses'
                                ? '◇'
                                : '·'}
                        </span>
                        {artifactLabel(artifact.path)}
                      </button>
                    ))}
                  </section>
                )
            )}
          </nav>
          <article
            className="v2-artifact-stage"
            onMouseUp={handleTextSelection}
            aria-label="Просмотрщик артефакта"
          >
            <header>
              <code>{selectedPath}</code>
              <div className="v2-artifact-stepper">
                <button
                  disabled={selectedIndex <= 0}
                  onClick={() =>
                    setSelectedPath(navigationArtifacts[selectedIndex - 1]?.path ?? null)
                  }
                  aria-label="Предыдущий артефакт"
                >
                  ←
                </button>
                <span>
                  {selectedIndex + 1} / {navigationArtifacts.length}
                </span>
                <button
                  disabled={selectedIndex < 0 || selectedIndex >= navigationArtifacts.length - 1}
                  onClick={() =>
                    setSelectedPath(navigationArtifacts[selectedIndex + 1]?.path ?? null)
                  }
                  aria-label="Следующий артефакт"
                >
                  →
                </button>
              </div>
            </header>
            <div className="v2-artifact-stage-body">
              {loadError ? (
                <p className="v2-error">{loadError}</p>
              ) : content && selectedPath ? (
                <ArtifactBody
                  selectedPath={selectedPath}
                  content={content}
                  artifactPaths={artifacts.map((artifact) => artifact.path)}
                  onOpen={setSelectedPath}
                  diagramKind={props.diagramKind}
                  onOpenDiagram={(kind) => {
                    if (props.diagramKind === kind) props.onOpenDiagram?.(null);
                    else props.onOpenDiagram?.(kind);
                  }}
                />
              ) : (
                <p className="v2-muted">Загружаю артефакт…</p>
              )}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
