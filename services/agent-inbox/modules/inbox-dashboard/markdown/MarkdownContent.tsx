// @file: Safe dashboard Markdown renderer for MR descriptions and review artifacts.
// @consumers: MrWorkspace, ReviewArtifactViewer

import { useEffect, useMemo, useRef } from 'react';
import { marked, Renderer } from 'marked';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createRenderer(allowArtifactLinks: boolean): Renderer {
  const renderer = new Renderer();
  renderer.html = ({ text }) => escapeHtml(text);
  renderer.link = function ({ href, title, tokens }) {
    const label = this.parser.parseInline(tokens);
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    if (/^https?:\/\//i.test(href)) {
      return `<a href="${escapeHtml(href)}"${titleAttr} target="_blank" rel="noreferrer">${label}</a>`;
    }
    if (href.startsWith('#')) return `<a href="${escapeHtml(href)}"${titleAttr}>${label}</a>`;
    if (allowArtifactLinks && !href.includes('..') && !href.includes(':')) {
      return `<a href="#" data-artifact-path="${escapeHtml(href)}"${titleAttr}>${label}</a>`;
    }
    return label;
  };
  renderer.image = ({ text }) =>
    `<span class="v2-markdown-image">[image: ${escapeHtml(text)}]</span>`;
  renderer.code = ({ text, lang }) =>
    lang === 'mermaid'
      ? `<pre class="mermaid">${escapeHtml(text)}</pre>`
      : `<pre><code class="language-${escapeHtml(lang ?? 'text')}">${escapeHtml(text)}</code></pre>`;
  return renderer;
}

let mermaidInitialized = false;

/**
 * @purpose Render GFM without allowing raw HTML or unsafe link protocols.
 * @param props Markdown source plus optional className and artifact-open callback.
 */
export function MarkdownContent(props: {
  source: string;
  className?: string;
  onOpenArtifact?: (path: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const renderer = useMemo(
    () => createRenderer(Boolean(props.onOpenArtifact)),
    [props.onOpenArtifact]
  );
  const html = marked.parse(props.source, {
    async: false,
    gfm: true,
    breaks: false,
    renderer,
  }) as string;

  useEffect(() => {
    const nodes = rootRef.current?.querySelectorAll<HTMLElement>('.mermaid:not([data-processed])');
    if (!nodes?.length) return;
    void import('mermaid').then(({ default: mermaid }) => {
      if (!mermaidInitialized) {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'dark',
          themeVariables: {
            primaryColor: '#24272a',
            primaryTextColor: '#f1f3f5',
            primaryBorderColor: '#fc6d26',
            lineColor: '#8b949e',
            secondaryColor: '#1a1c1e',
            tertiaryColor: '#0c0e10',
          },
        });
        mermaidInitialized = true;
      }
      return mermaid.run({ nodes: [...nodes], suppressErrors: true });
    });
  }, [html]);

  return (
    <div
      ref={rootRef}
      className={`v2-markdown${props.className ? ` ${props.className}` : ''}`}
      onClick={(event) => {
        const target = (event.target as HTMLElement).closest<HTMLAnchorElement>(
          'a[data-artifact-path]'
        );
        const path = target?.dataset.artifactPath;
        if (!path || !props.onOpenArtifact) return;
        event.preventDefault();
        props.onOpenArtifact(path);
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
