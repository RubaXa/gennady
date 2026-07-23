// @file: ArtifactView — renders one artifact's content (md/mermaid/json/text) selected in ArtifactBrowser.
// @consumers: ArtifactBrowser
// @tasks: TSK-107

import { useEffect, useId, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { ArtifactKind } from '../../inbox-api/types.ts';

/** @purpose One fenced code block extracted from raw markdown, kept separate from prose so it survives the lite renderer untouched. */
type FencedBlock = {
  /** @purpose Fence language tag (e.g. "mermaid"); empty string when untagged */
  lang: string;
  /** @purpose Raw block body, fence markers stripped */
  body: string;
};

/**
 * @purpose Split raw markdown into alternating prose/fenced segments.
 * @invariant The reused renderer has no fenced-code awareness — fenced blocks are rendered separately so
 *   they never get mangled into paragraphs.
 * @param raw Raw artifact content.
 * @returns Ordered segments, each either `{ prose: string }` or `{ fenced: FencedBlock }`.
 */
function splitFencedBlocks(raw: string): Array<{ prose: string } | { fenced: FencedBlock }> {
  const segments: Array<{ prose: string } | { fenced: FencedBlock }> = [];
  const fenceRe = /```([\w-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // #region START_ACCUMULATE_FENCE_SEGMENTS
  while ((match = fenceRe.exec(raw))) {
    const [full, lang = '', body = ''] = match;
    if (match.index > lastIndex) segments.push({ prose: raw.slice(lastIndex, match.index) });
    segments.push({ fenced: { lang, body } });
    lastIndex = match.index + full.length;
  }
  // #endregion END_ACCUMULATE_FENCE_SEGMENTS

  if (lastIndex < raw.length) segments.push({ prose: raw.slice(lastIndex) });
  return segments;
}

/**
 * @purpose Raw fenced source, boxed — used for non-mermaid code and as the mermaid render fallback.
 * @param props Block body and an optional header label.
 */
function RawSourceBlock(props: { body: string; label?: string }) {
  return (
    <div className="my-2 max-w-full rounded-md border border-border bg-secondary/40 overflow-hidden">
      {props.label && (
        <div className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-amber-300 border-b border-border bg-amber-400/10">
          {props.label}
        </div>
      )}
      <pre className="max-w-full overflow-x-auto whitespace-pre p-2.5 font-mono text-[12px]">
        <code>{props.body}</code>
      </pre>
    </div>
  );
}

/**
 * @purpose Render a mermaid diagram by lazily loading the engine and injecting its SVG; falls back
 *   to the raw source on parse/render failure.
 * @invariant The engine import is dynamic (`import('mermaid')`) so it stays out of the initial bundle.
 * @param props Mermaid diagram source.
 */
function MermaidDiagram(props: { body: string }) {
  const { body } = props;
  const rawId = useId();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const renderId = `mmd-${rawId.replace(/[^a-zA-Z0-9-]/g, '')}`;
    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'dark' });
        const { svg: out } = await mermaid.render(renderId, body);
        if (!cancelled) {
          setSvg(out);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [body, rawId]);

  if (failed)
    return <RawSourceBlock body={body} label="mermaid (не удалось отрисовать — исходник)" />;
  if (svg === null) return <RawSourceBlock body={body} label="mermaid (отрисовка…)" />;
  return (
    <div
      className="my-2 rounded-md border border-border bg-secondary/40 overflow-x-auto p-2.5 [&_svg]:max-w-full [&_svg]:h-auto"
      // eslint-disable-next-line react/no-danger -- D-007: mermaid renders with securityLevel:'strict' (DOMPurify-sanitized SVG)
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * @purpose Render one fenced block: mermaid blocks draw as diagrams (lazy engine), other languages
 *   render as a plain code block.
 * @param props Fenced block to render.
 */
function FencedBlockView(props: { block: FencedBlock }) {
  const { block } = props;
  if (block.lang === 'mermaid') return <MermaidDiagram body={block.body} />;
  return <RawSourceBlock body={block.body} />;
}

/**
 * @purpose Render one artifact's content by kind. Track documents (findings/candidates/verdict) are
 *   plain markdown — structure comes from their own headings/lists.
 * @param props Content string and its render-hint kind.
 */
export function ArtifactView(props: { content: string; kind: ArtifactKind }) {
  const { content, kind } = props;

  if (kind === 'json') {
    let pretty = content;
    try {
      pretty = JSON.stringify(JSON.parse(content), null, 2);
    } catch (_cause) {
      // Not valid JSON — fall back to raw content unformatted.
    }
    return (
      <pre className="p-3 text-[12px] font-mono overflow-x-auto whitespace-pre bg-secondary/40 rounded-md border border-border">
        <code>{pretty}</code>
      </pre>
    );
  }

  if (kind === 'text') {
    return <pre className="p-3 text-[13px] whitespace-pre-wrap break-words">{content}</pre>;
  }

  if (kind === 'mermaid') {
    return <FencedBlockView block={{ lang: 'mermaid', body: content }} />;
  }

  // kind === 'md': split fenced blocks (mermaid or otherwise) from prose before handing prose to
  // `marked` — headings/tables/blockquotes/links render properly (GitHub-style via the typography
  // plugin's `prose`/`prose-invert` classes), fenced blocks stay on their own dedicated renderers.
  const segments = splitFencedBlocks(content);
  return (
    <div className="prose prose-sm prose-invert max-w-none break-words [&_code]:break-all">
      {segments.map((segment, idx) =>
        'fenced' in segment ? (
          <FencedBlockView key={idx} block={segment.fenced} />
        ) : (
          // eslint-disable-next-line react/no-danger -- D-115 (inbox-dashboard.spec.md): marked does
          // NOT escape/sanitize by default (source prose can echo untrusted MR content, AX_UNTRUSTED_MR_CONTENT)
          // — DOMPurify.sanitize runs on marked's output before injection, closing the actual XSS surface.
          <div
            key={idx}
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(marked.parse(segment.prose, { async: false })),
            }}
          />
        )
      )}
    </div>
  );
}
