// @file: TypeScript tree-sitter adapter implementing DbcAstAdapter for parsing .ts files.
// @consumers: DbcTsLinter
// @tasks: TSK-08, TSK-11

import { readFileSync } from 'node:fs';
import Parser from 'tree-sitter';
import tsLanguage from 'tree-sitter-typescript';
import type { SyntaxNode } from 'tree-sitter';
import { logger } from '#logger';
import type {
  DbcAstAdapter,
  DbcExportedEntity,
  DbcMember,
  DbcParamInfo,
  DbcParseResult,
  DbcSignatureInfo,
} from '../../dbc-ast-adapter.types.ts';

/** @purpose In-memory representation of JSDoc contract info before attaching to entities. */
type RawContract = {
  text: string;
  startLine: number;
  startCol: number;
};

/**
 * @purpose Parses TypeScript source files via tree-sitter to extract exported entities,
 * their members, JSDoc contracts, and signatures.
 * @implements {DbcAstAdapter} in ../../dbc-ast-adapter.types.ts
 * @invariant Adapter never throws — all error paths are represented via DbcParseResult.
 * @invariant `exported` contains all top-level exported entities, excluding re-exports.
 */
export class DbcTsAstAdapter implements DbcAstAdapter {
  protected _parser: Parser | undefined;

  /** @see {DbcAstAdapter#parseFile} in ../../dbc-ast-adapter.types.ts */
  async parseFile(filePath: string, content?: string): Promise<DbcParseResult> {
    // #region START_PARSE_FILE
    try {
      logger.debug(`[DbcTsAstAdapter#parseFile] [idle → reading] ${filePath}`);
      const source = content ?? readFileSync(filePath, 'utf8');
      const parser = this._initializeParser();
      const tree = parser.parse(source);

      const hasError = tree.rootNode.hasError as unknown as boolean;
      if (hasError) {
        const errorNode = this._findErrorNode(tree.rootNode);
        const detail = errorNode ? ` at line ${errorNode.startPosition.row + 1}` : '';
        logger.warn(`[DbcTsAstAdapter#parseFile] [reading → parse-failed] ${filePath}${detail}`);
        return { ok: false, error: `Syntax error in ${filePath}${detail}` };
      }

      const exported = this._extractExported(tree.rootNode, source);
      logger.info(
        `[DbcTsAstAdapter#parseFile] [reading → parsed] ${filePath} (${exported.length} entities)`
      );
      return { ok: true, exported };
    } catch (cause) {
      // #region START_PARSE_FILE_CATCH
      const isFileNotFound =
        cause instanceof Error &&
        'code' in cause &&
        (cause as NodeJS.ErrnoException).code === 'ENOENT';
      if (isFileNotFound) {
        logger.warn(`[DbcTsAstAdapter#parseFile] [reading → not-found] ${filePath}`);
        return { ok: false, error: `File not found: ${filePath}` };
      }

      const error = new Error(`[DbcTsAstAdapter#parseFile] Parse failed for ${filePath}`, {
        cause,
      });
      logger.error(`[DbcTsAstAdapter#parseFile] [reading → failed] ${filePath}`, { error });
      return { ok: false, error: `Failed to parse ${filePath}: ${String(cause)}` };
      // #endregion END_PARSE_FILE_CATCH
    }
    // #endregion END_PARSE_FILE
  }

  /**
   * @purpose Lazy-initializes the tree-sitter Parser with the TypeScript grammar.
   * @returns Configured Parser instance.
   */
  protected _initializeParser(): Parser {
    if (!this._parser) {
      this._parser = new Parser();
      const language: unknown = (tsLanguage as Record<string, unknown>).tsx ?? tsLanguage;
      this._parser.setLanguage(language as Parser.Language);
    }
    return this._parser;
  }

  /**
   * @purpose Walks the root AST node and extracts all exported entities,
   * skipping re-exports.
   * @param root Root CST node.
   * @param source Full source text for slicing.
   * @returns Array of exported entities.
   */
  protected _extractExported(root: SyntaxNode, source: string): DbcExportedEntity[] {
    // #region START_EXTRACT_EXPORTED
    const entities: DbcExportedEntity[] = [];
    let pendingContract: RawContract | undefined;

    for (let idx = 0; idx < root.childCount; idx += 1) {
      const child = root.child(idx);
      if (!child) continue;

      if (child.type === 'comment') {
        const commentText = source.slice(child.startIndex, child.endIndex);
        if (commentText.startsWith('/**')) {
          pendingContract = {
            text: commentText,
            startLine: child.startPosition.row + 1,
            startCol: child.startPosition.column + 1,
          };
        } else {
          pendingContract = undefined;
        }
        continue;
      }

      if (child.type === 'export_statement') {
        const entity = this._extractExportEntity(child, source, pendingContract);
        if (entity) {
          entities.push(entity);
        }
        // contract consumed — only applies to the immediate next export
        pendingContract = undefined;
        continue;
      }

      // Non-export, non-comment node resets the pending contract
      if (child.type !== 'comment') {
        pendingContract = undefined;
      }
    }

    return entities;
    // #endregion END_EXTRACT_EXPORTED
  }

  /**
   * @purpose Extracts a single exported entity from an export_statement node.
   * Skips re-exports.
   * @param node export_statement node.
   * @param source Full source text.
   * @param pendingContract JSDoc contract that precedes this export, if any.
   * @returns Exported entity or undefined for re-exports.
   */
  protected _extractExportEntity(
    node: SyntaxNode,
    source: string,
    pendingContract: RawContract | undefined
  ): DbcExportedEntity | undefined {
    // #region START_EXTRACT_EXPORT_ENTITY
    // Detect re-exports: `export { ... } from '...'` or `export * from '...'`
    if (this._isReExport(node)) {
      return undefined;
    }

    // Handle `export default <expr>` or `export default function/class`
    let isDefault = false;
    let declaration: SyntaxNode | null = null;

    for (let i = 0; i < node.childCount; i += 1) {
      const c = node.child(i);
      if (!c) continue;
      if (c.type === 'default') {
        isDefault = true;
        continue;
      }
      if (c.type === 'export' || c.type === ';') continue;

      if (!declaration && c.type !== 'export' && c.type !== ';') {
        declaration = c;
      }
    }

    if (!declaration) {
      return undefined;
    }

    const kind = this._mapKind(declaration.type, isDefault);
    const name = this._extractName(declaration, source, isDefault);
    const signature = this._extractSignature(declaration, source);
    const members = this._extractMembers(declaration, source, kind);

    const contract = pendingContract
      ? {
          text: pendingContract.text,
          startLine: pendingContract.startLine,
          startCol: pendingContract.startCol,
        }
      : undefined;

    return {
      name,
      kind,
      members,
      contract,
      signature,
    };
    // #endregion END_EXTRACT_EXPORT_ENTITY
  }

  /**
   * @purpose Determines whether an export_statement is a re-export.
   * @param node export_statement node.
   * @returns True if the export is a re-export that should be skipped.
   */
  protected _isReExport(node: SyntaxNode): boolean {
    for (let i = 0; i < node.childCount; i += 1) {
      const c = node.child(i);
      if (!c) continue;
      // `export { x }` or `export { x, y } from '...'` or `export * from '...'`
      if (c.type === 'export_clause' || c.type === '*') {
        return true;
      }
    }
    return false;
  }

  /**
   * @purpose Maps a declaration node type to an entity kind string.
   * @param nodeType tree-sitter node type.
   * @param isDefault Whether this is a default export.
   * @returns Entity kind.
   */
  protected _mapKind(nodeType: string, isDefault: boolean): string {
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
        // export default <expr> → export-default
        if (isDefault) return 'export-default';
        return nodeType;
    }
  }

  /**
   * @purpose Extracts the entity name from a declaration node.
   * @param node Declaration node.
   * @param source Full source text.
   * @param isDefault Whether this is a default export.
   * @returns Entity name.
   */
  protected _extractName(node: SyntaxNode, source: string, isDefault: boolean): string {
    // Function, class, interface, type alias, enum — name is a direct child
    const nameNode = node.childForFieldName?.('name') ?? null;
    if (nameNode) {
      return source.slice(nameNode.startIndex, nameNode.endIndex);
    }

    // `export default function foo()` — function_declaration with name
    // `export default class Foo` — class_declaration with name
    // `export default 42` — no name, use 'default' as name

    // Variable declarations: `export const x = ...` → lexical_declaration with variable_declarator child
    for (let i = 0; i < node.childCount; i += 1) {
      const c = node.child(i);
      if (!c) continue;
      if (c.type === 'variable_declarator') {
        const nameChild = c.child(0);
        if (nameChild) {
          return source.slice(nameChild.startIndex, nameChild.endIndex);
        }
      }
      // Shorthand: `export const x = 1` where the const is inside a `value` child (export default case)
      if (c.type === 'identifier' && isDefault) {
        return source.slice(c.startIndex, c.endIndex);
      }
    }

    return isDefault ? '_default' : 'unknown';
  }

  /**
   * @purpose Extracts signature info (params + returnType) from a callable declaration.
   * @param node Declaration node.
   * @param source Full source text.
   * @returns Signature info with empty arrays for non-callable entities.
   */
  protected _extractSignature(node: SyntaxNode, source: string): DbcSignatureInfo {
    const params: DbcParamInfo[] = [];
    let returnType = 'void';

    // Find formal_parameters child
    const paramList = this._findChild(node, 'formal_parameters');
    if (paramList) {
      for (let i = 0; i < paramList.childCount; i += 1) {
        const p = paramList.child(i);
        if (!p) continue;
        if (p.type === 'required_parameter' || p.type === 'optional_parameter') {
          params.push(this._extractParam(p, source));
        }
      }
    }

    // For function_type nodes, return type is the node after '=>'
    if (node.type === 'function_type') {
      const children: SyntaxNode[] = [];
      for (let i = 0; i < node.childCount; i += 1) {
        const c = node.child(i);
        if (c) children.push(c);
      }
      const arrowIdx = children.findIndex((c) => c.type === '=>');
      if (arrowIdx >= 0 && arrowIdx + 1 < children.length) {
        returnType = source
          .slice(children[arrowIdx + 1].startIndex, children[arrowIdx + 1].endIndex)
          .trim();
        if (!returnType) returnType = 'unknown';
      }
      return { params, returnType };
    }

    // Find return_type child (field name for method/function declarations)
    const rtNode = node.childForFieldName?.('return_type') ?? null;
    if (rtNode) {
      returnType = source.slice(rtNode.startIndex + 1, rtNode.endIndex).trim(); // strip leading `:`
      if (!returnType) returnType = 'unknown';
    }

    // For non-callable entities, check if there's an implicit return from initialized value
    if (params.length === 0 && !rtNode) {
      returnType = 'void';
    }

    return { params, returnType };
  }

  /**
   * @purpose Extracts a single parameter (required or optional) from the formal_parameters list.
   * @param paramNode required_parameter or optional_parameter node.
   * @param source Full source text.
   * @returns Parameter info.
   */
  protected _extractParam(paramNode: SyntaxNode, source: string): DbcParamInfo {
    // #region START_EXTRACT_PARAM
    let name = '';
    let type = 'any';
    let optional = paramNode.type === 'optional_parameter';
    let isRest = false;

    for (let i = 0; i < paramNode.childCount; i += 1) {
      const child = paramNode.child(i);
      if (!child) continue;

      // Rest parameter: `...args` wrapped in `rest_pattern`
      if (child.type === 'rest_pattern') {
        isRest = true;
        for (let j = 0; j < child.childCount; j += 1) {
          const rc = child.child(j);
          if (
            rc &&
            (rc.type === 'identifier' ||
              rc.type === 'object_pattern' ||
              rc.type === 'array_pattern')
          ) {
            name = source.slice(rc.startIndex, rc.endIndex);
          }
        }
        continue;
      }

      // Raw rest token `...` (edge case for older tree-sitter versions)
      if (child.type === '...') {
        isRest = true;
        continue;
      }

      // Optional marker `?` inside optional_parameter
      if (child.type === '?') {
        optional = true;
        continue;
      }

      // Identifier / destructuring pattern
      if (
        child.type === 'identifier' ||
        child.type === 'object_pattern' ||
        child.type === 'array_pattern'
      ) {
        name = source.slice(child.startIndex, child.endIndex);
        continue;
      }

      // Type annotation
      if (child.type === 'type_annotation') {
        // Skip `:`, get the type child
        for (let j = 0; j < child.childCount; j += 1) {
          const tc = child.child(j);
          if (!tc) continue;
          if (tc.type !== ':') {
            type = source.slice(tc.startIndex, tc.endIndex);
          }
        }
        continue;
      }
    }

    return { name, type, optional, isRest };
    // #endregion END_EXTRACT_PARAM
  }

  /**
   * @purpose Extracts members of a class, interface, or enum entity.
   * @param node Declaration node.
   * @param source Full source text.
   * @param kind Entity kind.
   * @returns Array of members (empty for non-collection entities).
   */
  protected _extractMembers(node: SyntaxNode, source: string, kind: string): DbcMember[] {
    // #region START_EXTRACT_MEMBERS
    if (kind === 'class') {
      return this._extractClassMembers(node, source);
    }
    if (kind === 'interface') {
      return this._extractInterfaceMembers(node, source);
    }
    if (kind === 'enum') {
      return this._extractEnumMembers(node, source);
    }
    if (kind === 'type') {
      return this._extractTypeAliasMembers(node, source);
    }
    return [];
    // #endregion END_EXTRACT_MEMBERS
  }

  /**
   * @purpose Extracts members from a class declaration body.
   * @param node class_declaration node.
   * @param source Full source text.
   * @returns Array of class members.
   */
  protected _extractClassMembers(node: SyntaxNode, source: string): DbcMember[] {
    // #region START_EXTRACT_CLASS_MEMBERS
    const body = node.childForFieldName?.('body') ?? null;
    if (!body) return [];

    const members: DbcMember[] = [];
    let pendingContract: RawContract | undefined;

    for (let i = 0; i < body.childCount; i += 1) {
      const child = body.child(i);
      if (!child) continue;

      if (child.type === 'comment') {
        const commentText = source.slice(child.startIndex, child.endIndex);
        if (commentText.startsWith('/**')) {
          pendingContract = {
            text: commentText,
            startLine: child.startPosition.row + 1,
            startCol: child.startPosition.column + 1,
          };
        } else {
          pendingContract = undefined;
        }
        continue;
      }

      if (child.type === 'comment') {
        pendingContract = undefined;
        continue;
      }

      let memberKind: string | undefined;
      let name = '';
      let signatureNode: SyntaxNode | null = null;

      if (child.type === 'method_definition') {
        name = this._extractMethodName(child, source);
        if (name === 'constructor') {
          memberKind = 'constructor';
        } else if (this._hasToken(child, 'get')) {
          memberKind = 'getter';
        } else if (this._hasToken(child, 'set')) {
          memberKind = 'setter';
        } else {
          memberKind = 'method';
        }
        signatureNode = child;
      } else if (child.type === 'public_field_definition') {
        name = this._extractFieldName(child, source);
        memberKind = 'field';
      }

      if (memberKind && name) {
        const signature = signatureNode
          ? this._extractSignature(signatureNode, source)
          : { params: [], returnType: 'void' };
        const contract = pendingContract
          ? {
              text: pendingContract.text,
              startLine: pendingContract.startLine,
              startCol: pendingContract.startCol,
            }
          : undefined;
        members.push({ name, kind: memberKind, contract, signature });
        pendingContract = undefined;
      } else {
        pendingContract = undefined;
      }
    }

    return members;
    // #endregion END_EXTRACT_CLASS_MEMBERS
  }

  /**
   * @purpose Extracts members from an interface declaration body.
   * @param node interface_declaration node.
   * @param source Full source text.
   * @returns Array of interface members.
   */
  protected _extractInterfaceMembers(node: SyntaxNode, source: string): DbcMember[] {
    // #region START_EXTRACT_INTERFACE_MEMBERS
    const body = node.childForFieldName?.('body') ?? null;
    if (!body) return [];
    return this._extractObjectTypeMembers(body, source);
    // #endregion END_EXTRACT_INTERFACE_MEMBERS
  }

  /**
   * @purpose Extracts members from a type alias with an object type literal body.
   * Delegates to the same logic as interface members since object_type ≡ interface body.
   * @param node type_alias_declaration node.
   * @param source Full source text.
   * @returns Array of object type members.
   */
  protected _extractTypeAliasMembers(node: SyntaxNode, source: string): DbcMember[] {
    // Find the object_type child inside the type alias
    for (let i = 0; i < node.childCount; i += 1) {
      const child = node.child(i);
      if (child?.type === 'object_type') {
        return this._extractObjectTypeMembers(child, source);
      }
    }
    return [];
  }

  /**
   * @purpose Extracts members from an object_type or interface body node.
   * Shared by type alias (object_type) and interface declarations.
   * @param body object_type or interface_body node.
   * @param source Full source text.
   * @returns Array of members.
   */
  protected _extractObjectTypeMembers(body: SyntaxNode, source: string): DbcMember[] {
    const members: DbcMember[] = [];
    let pendingContract: RawContract | undefined;

    for (let i = 0; i < body.childCount; i += 1) {
      const child = body.child(i);
      if (!child) continue;

      if (child.type === 'comment') {
        const commentText = source.slice(child.startIndex, child.endIndex);
        if (commentText.startsWith('/**')) {
          pendingContract = {
            text: commentText,
            startLine: child.startPosition.row + 1,
            startCol: child.startPosition.column + 1,
          };
        } else {
          pendingContract = undefined;
        }
        continue;
      }

      if (child.type === '{' || child.type === '}' || child.type === ';' || child.type === ',') {
        continue;
      }

      let memberKind: string | undefined;
      let name = '';
      let signatureNode: SyntaxNode | null = null;

      if (child.type === 'method_signature') {
        const nameNode = child.childForFieldName?.('name') ?? null;
        if (nameNode) name = source.slice(nameNode.startIndex, nameNode.endIndex);
        memberKind = 'interface-method';
        signatureNode = child;
      } else if (child.type === 'property_signature') {
        const nameNode = child.childForFieldName?.('name') ?? null;
        if (nameNode) name = source.slice(nameNode.startIndex, nameNode.endIndex);
        // Check if the property type annotation is a function type
        if (this._isFunctionTypedProperty(child)) {
          memberKind = 'interface-method';
          signatureNode = this._findFunctionTypeNode(child);
        } else {
          memberKind = 'interface-property';
        }
      }

      if (memberKind && name) {
        const signature = signatureNode
          ? this._extractSignature(signatureNode, source)
          : { params: [], returnType: 'void' };
        const contract = pendingContract
          ? {
              text: pendingContract.text,
              startLine: pendingContract.startLine,
              startCol: pendingContract.startCol,
            }
          : undefined;
        members.push({ name, kind: memberKind, contract, signature });
        pendingContract = undefined;
      } else {
        pendingContract = undefined;
      }
    }

    return members;
  }

  /**
   * @purpose Checks if a property_signature node has a function type annotation.
   * @param node property_signature node.
   * @returns True if the property is function-typed.
   */
  protected _isFunctionTypedProperty(node: SyntaxNode): boolean {
    for (let i = 0; i < node.childCount; i += 1) {
      const child = node.child(i);
      if (child?.type === 'type_annotation') {
        for (let j = 0; j < child.childCount; j += 1) {
          if (child.child(j)?.type === 'function_type') return true;
        }
      }
    }
    return false;
  }

  /**
   * @purpose Finds the function_type node inside a property_signature's type annotation.
   * @param node property_signature node.
   * @returns The function_type node, or null.
   */
  protected _findFunctionTypeNode(node: SyntaxNode): SyntaxNode | null {
    for (let i = 0; i < node.childCount; i += 1) {
      const child = node.child(i);
      if (child?.type === 'type_annotation') {
        for (let j = 0; j < child.childCount; j += 1) {
          const inner = child.child(j);
          if (inner?.type === 'function_type') return inner;
        }
      }
    }
    return null;
  }

  /**
   * @purpose Extracts members from an enum declaration body.
   * @param node enum_declaration node.
   * @param source Full source text.
   * @returns Array of enum members.
   */
  protected _extractEnumMembers(node: SyntaxNode, source: string): DbcMember[] {
    // #region START_EXTRACT_ENUM_MEMBERS
    const body = node.childForFieldName?.('body') ?? null;
    if (!body) return [];

    const members: DbcMember[] = [];
    let pendingContract: RawContract | undefined;

    for (let i = 0; i < body.childCount; i += 1) {
      const child = body.child(i);
      if (!child) continue;

      if (child.type === 'comment') {
        const commentText = source.slice(child.startIndex, child.endIndex);
        if (commentText.startsWith('/**')) {
          pendingContract = {
            text: commentText,
            startLine: child.startPosition.row + 1,
            startCol: child.startPosition.column + 1,
          };
        } else {
          pendingContract = undefined;
        }
        continue;
      }

      // Enum members can be: property_identifier, string, number, etc.
      // In the enum_body, children are the member names (identifiers or shorthand properties)
      if (
        child.type === 'property_identifier' ||
        child.type === 'identifier' ||
        child.type === 'string' ||
        child.type === 'shorthand_property_identifier'
      ) {
        const name = source.slice(child.startIndex, child.endIndex);
        const contract = pendingContract
          ? {
              text: pendingContract.text,
              startLine: pendingContract.startLine,
              startCol: pendingContract.startCol,
            }
          : undefined;
        members.push({
          name,
          kind: 'enum-member',
          contract,
          signature: { params: [], returnType: 'void' },
        });
        pendingContract = undefined;
      } else if (child.type !== ',' && child.type !== '{' && child.type !== '}') {
        pendingContract = undefined;
      }
    }

    return members;
    // #endregion END_EXTRACT_ENUM_MEMBERS
  }

  /**
   * @purpose Extracts the method name from a method_definition node,
   * handling getter/setter property names.
   * @param node method_definition node.
   * @param source Full source text.
   * @returns Method name.
   */
  protected _extractMethodName(node: SyntaxNode, source: string): string {
    const nameNode = node.childForFieldName?.('name') ?? null;
    if (nameNode) {
      return source.slice(nameNode.startIndex, nameNode.endIndex);
    }
    return 'unknown';
  }

  /**
   * @purpose Extracts the field name from a public_field_definition node.
   * @param node public_field_definition node.
   * @param source Full source text.
   * @returns Field name.
   */
  protected _extractFieldName(node: SyntaxNode, source: string): string {
    for (let i = 0; i < node.childCount; i += 1) {
      const child = node.child(i);
      if (!child) continue;
      if (child.type === 'property_identifier' || child.type === 'identifier') {
        return source.slice(child.startIndex, child.endIndex);
      }
    }
    return 'unknown';
  }

  /**
   * @purpose Checks if a method_definition has a given token (e.g., 'get', 'set').
   * @param node method_definition node.
   * @param token Token text to search for.
   * @returns True if the token is present.
   */
  protected _hasToken(node: SyntaxNode, token: string): boolean {
    for (let i = 0; i < node.childCount; i += 1) {
      const child = node.child(i);
      if (child && child.type === token) {
        return true;
      }
    }
    return false;
  }

  /**
   * @purpose Finds a direct child node by type, returning first match.
   * @param parent Parent node.
   * @param type Child node type to find.
   * @returns First matching child or null.
   */
  protected _findChild(parent: SyntaxNode, type: string): SyntaxNode | null {
    for (let i = 0; i < parent.childCount; i += 1) {
      const child = parent.child(i);
      if (child && child.type === type) {
        return child;
      }
    }
    return null;
  }

  /**
   * @purpose Recursively searches for the first ERROR node in the tree.
   * @param node Root node to search from.
   * @returns First ERROR node found, or undefined.
   */
  protected _findErrorNode(node: SyntaxNode): SyntaxNode | undefined {
    // #region START_FIND_ERROR_NODE
    if (node.type === 'ERROR' || (node as unknown as { isError: boolean }).isError) {
      return node;
    }
    for (let i = 0; i < node.childCount; i += 1) {
      const child = node.child(i);
      if (!child) continue;
      const found = this._findErrorNode(child);
      if (found) return found;
    }
    return undefined;
    // #endregion END_FIND_ERROR_NODE
  }
}
