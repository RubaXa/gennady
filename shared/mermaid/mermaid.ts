// @file: Real mermaid validation — extract ```mermaid blocks, parse via the mermaid grammar (browser lib, lazy jsdom shim). Honest check, not a regexp.
// @consumers: sdd/mermaid-check, agent-inbox/artifact-validator
// @tasks: N/A

/** @purpose Cached mermaid `parse` fn — mermaid is a browser lib, so it (and its jsdom DOM shim) load once, lazily. */
let _mermaidParse: ((text: string) => Promise<unknown>) | null = null;

/** @purpose One fenced Mermaid body with the one-based Markdown line where its body starts. */
export type MermaidBlock = {
  /** @purpose Mermaid source without the surrounding Markdown fence. */
  body: string;
  /** @purpose One-based Markdown line where the Mermaid body starts. */
  line: number;
};

/**
 * @purpose Lazily load mermaid + a jsdom DOM shim (both browser-oriented) only when a diagram is actually validated.
 * @invariant mermaid reads `window`/`document`/`navigator` from global scope at parse time; jsdom provides them. Loaded once, then cached.
 * @returns mermaid's `parse` — resolves for valid diagram source, rejects (throws) on invalid syntax.
 */
export async function loadMermaidParse(): Promise<(text: string) => Promise<unknown>> {
  if (_mermaidParse) return _mermaidParse;
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const g = globalThis as Record<string, unknown>;
  g.window ??= dom.window;
  g.document ??= dom.window.document;
  g.navigator ??= dom.window.navigator;
  const mermaid = (await import('mermaid')).default;
  mermaid.initialize({ startOnLoad: false });
  _mermaidParse = (text: string) => mermaid.parse(text);
  return _mermaidParse;
}

/**
 * @purpose Extract every closed ```mermaid … ``` block body from a document. Pure.
 * @param content Full document text.
 * @returns Block bodies (fence markers stripped); empty when the document has no mermaid block.
 */
export function extractMermaidBlockRefs(content: string): MermaidBlock[] {
  const blocks: MermaidBlock[] = [];
  const lines = content.split('\n');
  let collecting = false;
  let current: string[] = [];
  let bodyLine = 1;
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!collecting && trimmed.startsWith('```mermaid')) {
      collecting = true;
      current = [];
      bodyLine = index + 2;
      continue;
    }
    if (collecting && trimmed === '```') {
      blocks.push({ body: current.join('\n'), line: bodyLine });
      collecting = false;
      continue;
    }
    if (collecting) current.push(line);
  }
  return blocks;
}

/**
 * @purpose Backward-compatible body-only view used by structural checks and template tests.
 * @param content Full document text.
 * @returns Mermaid block bodies without fence markers.
 */
export function extractMermaidBlocks(content: string): string[] {
  return extractMermaidBlockRefs(content).map(({ body }) => body);
}

/**
 * @purpose Validate one mermaid diagram source through the real parser.
 * @param text Diagram body (no fence markers).
 * @returns `null` when the diagram parses; else the first line of the parser error.
 * @sideEffect Lazily loads mermaid + jsdom on first call.
 */
export async function validateMermaid(text: string): Promise<string | null> {
  const parse = await loadMermaidParse();
  try {
    await parse(text);
    return null;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const headline =
      message
        .split('\n')
        .find((line) => line.trim())
        ?.trim() ?? 'invalid';
    const diagramLine = /\bline\s+(\d+)\b/i.exec(message)?.[1];
    if (!diagramLine) return headline.replace(/\s+/g, ' ').slice(0, 240);
    const source = text.split('\n')[Number(diagramLine) - 1]?.trim();
    if (!source) return headline.replace(/\s+/g, ' ').slice(0, 240);
    return `${headline} near ${JSON.stringify(source.slice(0, 180))}`;
  }
}
