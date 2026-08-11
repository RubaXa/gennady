// @file: Approximate, language-agnostic SymbolIndex fallback — plain regex, any extension without an installed tree-sitter grammar (the seam for Go/Python consumers).
// @consumers: yagni.cmd (composition root)
// @tasks: N/A

import type { DeclaredSymbol, ReferenceCount, SymbolIndex } from '../../symbol-index.types.ts';

// Best-effort top-level declaration patterns across common languages — approximate by
// construction: no grammar, so nested/shadowed declarations, scoping, and language-specific edge
// cases are not modeled. Each pattern captures the declared name in group 1.
const DECLARATION_PATTERNS: RegExp[] = [
  /\b(?:export\s+)?(?:async\s+)?function\s+(\w+)/g, // JS/TS-ish
  /\bdef\s+(\w+)/g, // Python
  /\bfunc\s+(\w+)/g, // Go
  /\b(?:export\s+)?class\s+(\w+)/g,
  /\b(?:export\s+)?(?:interface|struct)\s+(\w+)/g,
  /\b(?:export\s+)?type\s+(\w+)/g,
  /\b(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/g,
];

/** @purpose 1-based line number of the character at `index` in `content`. */
function lineAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (content.charCodeAt(i) === 10) line++;
  return line;
}

/**
 * @purpose Approximate SymbolIndex — best-effort regex declarations, word-boundary reference count.
 *   Always `precision: 'approximate'`: matches inside comments/strings, no scope resolution.
 * @implements {SymbolIndex} in ../../symbol-index.types.ts
 */
export class GrepSymbolIndexAdapter implements SymbolIndex {
  /** @see {SymbolIndex#declaredSymbols} in ../../symbol-index.types.ts */
  async declaredSymbols(_filePath: string, content: string): Promise<DeclaredSymbol[]> {
    const seen = new Map<string, number>();
    for (const pattern of DECLARATION_PATTERNS) {
      const re = new RegExp(pattern.source, pattern.flags);
      let m: RegExpExecArray | null;
      while ((m = re.exec(content))) {
        const name = m[1];
        if (name && !seen.has(name)) seen.set(name, lineAt(content, m.index));
      }
    }
    return [...seen.entries()].map(([name, line]) => ({
      name,
      kind: 'approximate-declaration',
      line,
    }));
  }

  /** @see {SymbolIndex#countReferences} in ../../symbol-index.types.ts */
  async countReferences(name: string, _filePath: string, content: string): Promise<ReferenceCount> {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'g');
    const count = [...content.matchAll(re)].length;
    return { count, precision: 'approximate' };
  }
}
