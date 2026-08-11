// @file: Pure by-extension adapter selection for SymbolIndex — tree-sitter vs grep. Construction happens once in the yagni command (composition root); this only picks.
// @consumers: yagni.cmd (composition root)
// @tasks: N/A

import type { SymbolIndex } from './symbol-index.types.ts';

// Only tree-sitter-typescript is installed (package.json) — extend this set only alongside a newly
// installed grammar, never speculatively.
const EXACT_EXTENSIONS = new Set(['.ts', '.tsx']);

/**
 * @purpose Pick the SymbolIndex adapter for one file, by extension.
 * @param filePath File path (extension drives the choice).
 * @param adapters Already-constructed adapters — `exact` for grammar-backed languages, `approximate` fallback for everything else.
 * @returns The adapter to use for `filePath`.
 */
export function selectSymbolIndex(
  filePath: string,
  adapters: { exact: SymbolIndex; approximate: SymbolIndex }
): SymbolIndex {
  const dot = filePath.lastIndexOf('.');
  const ext = dot >= 0 ? filePath.slice(dot).toLowerCase() : '';
  return EXACT_EXTENSIONS.has(ext) ? adapters.exact : adapters.approximate;
}
