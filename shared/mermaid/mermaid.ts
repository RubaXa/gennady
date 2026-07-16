// @file: Real mermaid validation — extract ```mermaid blocks, parse via the mermaid grammar (browser lib, lazy jsdom shim). Honest check, not a regexp.
// @consumers: sdd/mermaid-check, agent-inbox/artifact-validator
// @tasks: N/A

/** @purpose Cached mermaid `parse` fn — mermaid is a browser lib, so it (and its jsdom DOM shim) load once, lazily. */
let _mermaidParse: ((text: string) => Promise<unknown>) | null = null;

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
export function extractMermaidBlocks(content: string): string[] {
  const blocks: string[] = [];
  const lines = content.split('\n');
  let collecting = false;
  let current: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!collecting && trimmed.startsWith('```mermaid')) {
      collecting = true;
      current = [];
      continue;
    }
    if (collecting && trimmed === '```') {
      blocks.push(current.join('\n'));
      collecting = false;
      continue;
    }
    if (collecting) current.push(line);
  }
  return blocks;
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
    return cause instanceof Error ? (cause.message.split('\n')[0] ?? 'invalid') : String(cause);
  }
}
