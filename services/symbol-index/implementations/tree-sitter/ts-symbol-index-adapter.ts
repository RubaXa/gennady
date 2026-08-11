// @file: tree-sitter TypeScript adapter for SymbolIndex — exact declared-symbol listing + reference counting via the same TS grammar services/dbc/linter uses.
// @consumers: yagni.cmd (composition root)
// @tasks: N/A

import type { default as Parser, SyntaxNode } from 'tree-sitter';
import { DbcTsAstAdapter } from '../../../dbc/linter/implementations/ts/dbc-ts-ast-adapter.ts';
import type { DeclaredSymbol, ReferenceCount, SymbolIndex } from '../../symbol-index.types.ts';

// Reference-counting only walks identifier-shaped nodes — never string/comment/template nodes —
// which is exactly what separates `exact` (this adapter) from `approximate` (grep, plain text search).
const REFERENCE_NODE_TYPES = new Set([
  'identifier',
  'property_identifier',
  'type_identifier',
  'shorthand_property_identifier',
]);

/**
 * @purpose Exact SymbolIndex for TypeScript — declared symbols via DbcTsAstAdapter (exports +
 *   members) plus non-exported top-level declarations; reference counting via identifier-node walk.
 * @implements {SymbolIndex} in ../../symbol-index.types.ts
 * @invariant Never throws — a parse failure yields [] / count 0, mirroring DbcTsAstAdapter.
 */
export class TsSymbolIndexAdapter implements SymbolIndex {
  /** @purpose Lazily-initialized tree-sitter parser instance. */
  private _parser: Parser | undefined;

  /**
   * @see {SymbolIndex#declaredSymbols} in ../../symbol-index.types.ts
   * @invariant `line` for exported entities/members falls back to their JSDoc contract's line
   *   (DbcTsAstAdapter has no declaration-node line) — informational only, not used for filtering.
   */
  async declaredSymbols(filePath: string, content: string): Promise<DeclaredSymbol[]> {
    // Stateless delegate — built locally, not a field: nothing survives across calls worth caching.
    const result = await new DbcTsAstAdapter().parseFile(filePath, content);
    if (!result.ok) return [];
    const out: DeclaredSymbol[] = [];
    for (const e of result.exported) {
      out.push({ name: e.name, kind: e.kind, line: e.contract?.startLine ?? 1 });
      for (const m of e.members) {
        out.push({
          name: m.name,
          kind: m.kind,
          line: m.contract?.startLine ?? e.contract?.startLine ?? 1,
        });
      }
    }
    out.push(...(await this._nonExportedTopLevel(content)));
    return out;
  }

  /** @see {SymbolIndex#countReferences} in ../../symbol-index.types.ts */
  async countReferences(name: string, _filePath: string, content: string): Promise<ReferenceCount> {
    let parser: Parser;
    try {
      parser = await this._initParser();
    } catch {
      return { count: 0, precision: 'exact' };
    }
    const tree = parser.parse(content);
    let count = 0;
    const walk = (node: SyntaxNode): void => {
      if (
        REFERENCE_NODE_TYPES.has(node.type) &&
        content.slice(node.startIndex, node.endIndex) === name
      ) {
        count++;
      }
      for (let i = 0; i < node.childCount; i++) {
        const c = node.child(i);
        if (c) walk(c);
      }
    };
    walk(tree.rootNode);
    return { count, precision: 'exact' };
  }

  /**
   * @purpose Top-level declarations NOT wrapped in `export` — DbcTsAstAdapter only sees exports.
   * @param content Source text.
   * @returns Non-exported top-level declared symbols; empty when the file does not parse.
   */
  private async _nonExportedTopLevel(content: string): Promise<DeclaredSymbol[]> {
    let parser: Parser;
    try {
      parser = await this._initParser();
    } catch {
      return [];
    }
    const tree = parser.parse(content);
    const out: DeclaredSymbol[] = [];
    const root = tree.rootNode;
    for (let i = 0; i < root.childCount; i++) {
      const child = root.child(i);
      if (!child || child.type === 'export_statement') continue;
      const kind = this._mapKind(child.type);
      if (!kind) continue;
      const name = this._name(child, content);
      if (name) out.push({ name, kind, line: child.startPosition.row + 1 });
    }
    return out;
  }

  /**
   * @purpose Maps a top-level declaration node type to a symbol kind.
   * @param nodeType tree-sitter node type.
   * @returns The kind, or undefined when the node type is not a declaration this adapter tracks.
   */
  private _mapKind(nodeType: string): string | undefined {
    switch (nodeType) {
      case 'function_declaration':
      case 'generator_function_declaration':
        return 'function';
      case 'class_declaration':
        return 'class';
      case 'interface_declaration':
        return 'interface';
      case 'type_alias_declaration':
        return 'type';
      case 'enum_declaration':
        return 'enum';
      case 'lexical_declaration':
      case 'variable_declaration':
        return 'const';
      default:
        return undefined;
    }
  }

  /**
   * @purpose Extracts a declaration node's name (identifier field, or first variable_declarator).
   * @param node Declaration node.
   * @param content Full source text for slicing.
   * @returns The name, or undefined when none is found.
   */
  private _name(node: SyntaxNode, content: string): string | undefined {
    const nameNode = node.childForFieldName?.('name') ?? null;
    if (nameNode) return content.slice(nameNode.startIndex, nameNode.endIndex);
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i);
      if (c?.type === 'variable_declarator') {
        const n = c.child(0);
        if (n) return content.slice(n.startIndex, n.endIndex);
      }
    }
    return undefined;
  }

  /**
   * @purpose Lazily initializes the tree-sitter Parser with the TypeScript grammar.
   * @returns Configured Parser instance.
   */
  private async _initParser(): Promise<Parser> {
    if (!this._parser) {
      const [treeSitterModule, tsModule] = await Promise.all([
        import('tree-sitter'),
        import('tree-sitter-typescript'),
      ]);
      const ParserImpl = treeSitterModule.default;
      const tsLanguage = tsModule.default;
      this._parser = new ParserImpl();
      const language: unknown = (tsLanguage as Record<string, unknown>).tsx ?? tsLanguage;
      this._parser.setLanguage(language as Parser.Language);
    }
    return this._parser;
  }
}
