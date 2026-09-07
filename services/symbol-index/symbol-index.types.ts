// @file: Port for symbol declaration + reference counting behind `gennady yagni`. Two adapters: tree-sitter (exact) and grep (approximate) — precision travels with ReferenceCount.
// @consumers: TsSymbolIndexAdapter, GrepSymbolIndexAdapter, selectSymbolIndex, gennady yagni (composition root)
// @tasks: N/A

/** @purpose Language-defined surface visibility attached by the adapter that understands it. */
export type SymbolVisibility = 'public' | 'private' | 'unknown';

/** @purpose One declared symbol found in a file — export, internal top-level declaration, or class/interface member. */
export type DeclaredSymbol = {
  /** @purpose Symbol name as declared in source. */
  name: string;
  /** @purpose Free-form declaration kind (`function` | `class` | `method` | ...) — informational, not a closed enum across languages. */
  kind: string;
  /** @purpose 1-based line of the declaration — anchors the changed-symbol filter against diff hunks. */
  line: number;
  /** @purpose Language-level visibility; `unknown` means the fallback cannot safely infer public versus private. */
  visibility: SymbolVisibility;
};

/** @purpose Reference count for one name within one file, with the adapter's confidence in that count. */
export type ReferenceCount = {
  /** @purpose Number of matched occurrences. */
  count: number;
  /** @purpose `exact` — grammar-backed identifier match (tree-sitter); `approximate` — text search (grep), may over/under count (matches inside comments/strings, no scope resolution). */
  precision: 'exact' | 'approximate';
};

/**
 * @purpose Declare + count symbols for one file — the boundary `gennady yagni` composes against.
 *   Adapter selection by extension is the composition root's job (`selectSymbolIndex`).
 * @invariant Never throws — a parse/read failure yields empty declarations / a zero count.
 */
export interface SymbolIndex {
  /**
   * @purpose Declared symbols in one file: exports, internal top-level declarations, class/interface members.
   * @param filePath File path — used only for adapter-side diagnostics, never re-read from disk.
   * @param content Source text.
   * @returns Declared symbols; empty when the file does not parse / declares none.
   */
  declaredSymbols(filePath: string, content: string): Promise<DeclaredSymbol[]>;

  /**
   * @purpose Count occurrences of `name` as a reference within one file's content.
   * @param name Symbol name to search for.
   * @param filePath File path — used only for adapter-side diagnostics.
   * @param content Source text (caller strips barrel re-export lines beforehand — not this port's concern).
   * @returns Match count and its precision.
   */
  countReferences(name: string, filePath: string, content: string): Promise<ReferenceCount>;

  /**
   * @purpose Count many candidate names in one already-read file without reparsing it per name.
   * @param names Candidate symbol names; implementations return one entry for every requested name.
   * @param filePath File path used for adapter selection/diagnostics, never re-read.
   * @param content Source text with barrel re-exports already stripped by the caller.
   * @returns Candidate name to count/precision, including zero-count entries.
   */
  countReferencesMany(
    names: ReadonlySet<string>,
    filePath: string,
    content: string
  ): Promise<Map<string, ReferenceCount>>;
}
