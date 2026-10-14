// @file: Pure by-extension adapter selection for SymbolIndex — tree-sitter vs grep. Construction happens once in the yagni command (composition root); this only picks.
// @spec: SHARED
// @consumers: yagni.cmd (composition root)

import type { SymbolIndex } from './symbol-index.types.ts';
import { sourceEvidenceLevel } from '../../shared/sdd/source-extensions.ts';

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
  return sourceEvidenceLevel(filePath) === 'exact' ? adapters.exact : adapters.approximate;
}
