// @file: Entity counter — tree-sitter-based comparison of top-level exported entities between base and MR.
// @consumers: mr-stats.cmd
// @tasks: TSK-139

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import type { default as Parser, SyntaxNode } from 'tree-sitter';
import { logger } from '#logger';
import type { EntityDelta } from './mr-stats.types.ts';

/** @purpose Compact representation of a top-level exported entity for comparison. */
type EntityFingerprint = {
  /** @purpose Entity name as declared */
  name: string;
  /** @purpose Entity kind (function, class, interface, type, const, enum, export-default) */
  kind: string;
  /** @purpose Normalized source text of the entity (whitespace-collapsed, JSDoc stripped) */
  body: string;
  /** @purpose Sorted, normalized member fingerprints (for class/interface/type with members) */
  members: string;
};

/**
 * @purpose Lazy-initialize the tree-sitter Parser with TypeScript grammar.
 * Uses dynamic imports so tree-sitter is only loaded when entity counting runs.
 * @returns Configured Parser instance.
 */
async function initializeParser(): Promise<Parser> {
  const [treeSitterModule, tsModule] = await Promise.all([
    import('tree-sitter'),
    import('tree-sitter-typescript'),
  ]);
  const ParserImpl = treeSitterModule.default;
  const tsLanguage = tsModule.default;
  const parser = new ParserImpl();
  const language: unknown = (tsLanguage as Record<string, unknown>).tsx ?? tsLanguage;
  parser.setLanguage(language as Parser.Language);
  return parser;
}

// #region START_AST_TRAVERSAL — walk AST to find top-level exported declarations and extract fingerprints

/**
 * @purpose Map a tree-sitter node type to an entity kind string.
 * @param nodeType tree-sitter node type string.
 * @returns Entity kind.
 */
function mapKind(nodeType: string): string {
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
      return nodeType;
  }
}

/**
 * @purpose Find a direct child node by type.
 * @param parent Parent node.
 * @param type Child type to find.
 * @returns First matching child or null.
 */
function findChild(parent: SyntaxNode, type: string): SyntaxNode | null {
  for (let i = 0; i < parent.childCount; i += 1) {
    const c = parent.child(i);
    if (c && c.type === type) return c;
  }
  return null;
}

/**
 * @purpose Extract entity name from a declaration node.
 * @param node Declaration node.
 * @param source Full source text.
 * @returns Entity name string.
 */
function extractName(node: SyntaxNode, source: string): string {
  const nameNode = node.childForFieldName?.('name') ?? null;
  if (nameNode) {
    return source.slice(nameNode.startIndex, nameNode.endIndex);
  }

  for (let i = 0; i < node.childCount; i += 1) {
    const c = node.child(i);
    if (c?.type === 'variable_declarator') {
      const nameChild = c.child(0);
      if (nameChild) return source.slice(nameChild.startIndex, nameChild.endIndex);
    }
  }
  return 'unknown';
}

/**
 * @purpose Determine whether an export_statement is a re-export that should be skipped.
 */
function isReExport(node: SyntaxNode): boolean {
  for (let i = 0; i < node.childCount; i += 1) {
    const c = node.child(i);
    if (c?.type === 'export_clause' || c?.type === '*') return true;
  }
  return false;
}

/**
 * @purpose Normalize source text: collapse whitespace, strip JSDoc, trim.
 */
function normalizeSource(text: string): string {
  const noJsdoc = text.replace(/\/\*\*[\s\S]*?\*\//g, '');
  const noComments = noJsdoc.replace(/\/\/[^\n]*/g, '');
  return noComments.replace(/\s+/g, ' ').trim();
}

/**
 * @purpose Extract member fingerprints (normalized) from a class/interface/type body node.
 * Members are normalized and sorted by name for reordering invariance.
 */
function extractMemberFingerprints(bodyNode: SyntaxNode, source: string): string {
  const members: string[] = [];

  for (let i = 0; i < bodyNode.childCount; i += 1) {
    const child = bodyNode.child(i);
    if (!child) continue;

    if (
      child.type === 'method_definition' ||
      child.type === 'method_signature' ||
      child.type === 'public_field_definition' ||
      child.type === 'property_signature'
    ) {
      const memberText = normalizeSource(source.slice(child.startIndex, child.endIndex));
      const nameNode = child.childForFieldName?.('name') ?? null;
      const name = nameNode ? source.slice(nameNode.startIndex, nameNode.endIndex) : '';

      if (name && memberText) {
        members.push(`${name}:${memberText}`);
      }
    }
  }

  members.sort();
  return members.join(';');
}

/**
 * @purpose Find the JSDoc comment immediately preceding an export_statement.
 * Returns the node's end index so its text can be excluded from the entity's fingerprint.
 */
function findJsdocEnd(exportNode: SyntaxNode, source: string): number {
  const parent = exportNode.parent;
  if (!parent) return exportNode.startIndex;

  let prevSibling: SyntaxNode | null = null;
  for (let i = 0; i < parent.childCount; i += 1) {
    const c = parent.child(i);
    if (c?.startIndex === exportNode.startIndex) break;
    prevSibling = c ?? null;
  }

  if (prevSibling?.type === 'comment') {
    const commentText = source.slice(prevSibling.startIndex, prevSibling.endIndex);
    if (commentText.startsWith('/**')) {
      return prevSibling.endIndex;
    }
  }

  return exportNode.startIndex;
}

/**
 * @purpose Extract all top-level exported entity fingerprints from a TypeScript source file.
 * Skips re-exports and imports.
 */
function extractExportedFingerprints(source: string, tree: Parser.Tree): EntityFingerprint[] {
  const fingerprints: EntityFingerprint[] = [];
  const root = tree.rootNode;

  for (let i = 0; i < root.childCount; i += 1) {
    const child = root.child(i);
    if (!child || child.type !== 'export_statement') continue;
    if (isReExport(child)) continue;

    const jsdocEnd = findJsdocEnd(child, source);

    let declNode: SyntaxNode | null = null;
    for (let j = 0; j < child.childCount; j += 1) {
      const c = child.child(j);
      if (
        c &&
        c.type !== 'export' &&
        c.type !== 'default' &&
        c.type !== ';' &&
        c.type !== 'abstract'
      ) {
        declNode = c;
        break;
      }
    }
    if (!declNode) continue;

    const kind = mapKind(declNode.type);
    const name = extractName(declNode, source);
    const declText = source.slice(jsdocEnd, declNode.endIndex);
    const body = normalizeSource(declText);

    let members = '';
    const bodyChild =
      kind === 'class'
        ? findChild(declNode, 'class_body')
        : kind === 'interface'
          ? findChild(declNode, 'interface_body')
          : kind === 'type'
            ? findChild(declNode, 'object_type')
            : null;

    if (bodyChild) {
      members = extractMemberFingerprints(bodyChild, source);
    }

    fingerprints.push({ name, kind, body, members });
  }

  return fingerprints;
}

// #endregion END_AST_TRAVERSAL

// #region START_ENTITY_COMPARISON — compare base and MR entity sets

/**
 * @purpose Compute the EntityDelta between base and MR for a single TypeScript file.
 */
function computeFileEntityDelta(
  clonePath: string,
  baseSha: string,
  mrDir: string,
  parser: Parser,
  filePath: string
): EntityDelta | null {
  const mrAbs = join(mrDir, filePath);

  // #region START_READ_BASE_FILE — use git show to get the base version
  let baseSource = '';
  try {
    baseSource = execFileSync('git', ['-C', clonePath, 'show', `${baseSha}:${filePath}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    // File didn't exist at baseSha (added in MR) — all entities introduced
  }
  // #endregion END_READ_BASE_FILE

  let mrSource: string;
  try {
    mrSource = readFileSync(mrAbs, 'utf8');
  } catch {
    return null;
  }

  if (!baseSource && !mrSource) return null;

  const baseTree = baseSource ? parser.parse(baseSource) : null;
  const mrTree = parser.parse(mrSource);

  const baseEntities = baseTree ? extractExportedFingerprints(baseSource, baseTree) : [];
  const mrEntities = extractExportedFingerprints(mrSource, mrTree);

  const baseMap = new Map<string, EntityFingerprint>();
  for (const e of baseEntities) {
    baseMap.set(`${e.kind}:${e.name}`, e);
  }

  const mrMap = new Map<string, EntityFingerprint>();
  for (const e of mrEntities) {
    mrMap.set(`${e.kind}:${e.name}`, e);
  }

  const introduced: EntityDelta['introduced'] = [];
  const modified: EntityDelta['modified'] = [];
  const removed: EntityDelta['removed'] = [];

  // #region START_COMPARE_ENTITIES — introduced, modified, removed classification
  for (const [key, mrEntity] of mrMap) {
    const baseEntity = baseMap.get(key);
    if (!baseEntity) {
      introduced.push({ file: filePath, symbol: mrEntity.name });
    } else {
      const baseFp = `${baseEntity.body}|${baseEntity.members}`;
      const mrFp = `${mrEntity.body}|${mrEntity.members}`;
      if (baseFp !== mrFp) {
        modified.push({ file: filePath, symbol: mrEntity.name });
      }
    }
  }

  for (const [key, baseEntity] of baseMap) {
    if (!mrMap.has(key)) {
      removed.push({ file: filePath, symbol: baseEntity.name });
    }
  }
  // #endregion END_COMPARE_ENTITIES

  return { introduced, modified, removed };
}

// #endregion END_ENTITY_COMPARISON

/**
 * @purpose Compute entity delta for realCode files between base and MR worktrees.
 * @param clonePath Local clone path with git history.
 * @param baseSha Base commit SHA.
 * @param mrDir MR worktree directory.
 * @param files RealCode file paths.
 * @returns EntityDelta with introduced, modified, removed counts.
 * @sideEffect FS: reads source files from MR worktree; git: shows base files.
 */
export async function computeEntityDelta(
  clonePath: string,
  baseSha: string,
  mrDir: string,
  files: string[]
): Promise<EntityDelta> {
  const result: EntityDelta = { introduced: [], modified: [], removed: [] };

  if (files.length === 0) return result;

  let parser: Parser;
  try {
    parser = await initializeParser();
  } catch {
    logger.warn(
      `[computeEntityDelta] [idle → init-failed] tree-sitter unavailable, skipping entity counting`
    );
    return result;
  }

  // #region START_PROCESS_FILES — iterate changed realCode files, parse and compare
  for (const file of files) {
    if (file.endsWith('.js') && !file.endsWith('.jsx')) {
      logger.warn(`entity-counter: skipping ${file} (JS, not TS)`);
      continue;
    }

    if (!file.endsWith('.ts') && !file.endsWith('.tsx') && !file.endsWith('.jsx')) continue;

    try {
      const delta = computeFileEntityDelta(clonePath, baseSha, mrDir, parser, file);
      if (delta) {
        result.introduced.push(...delta.introduced);
        result.modified.push(...delta.modified);
        result.removed.push(...delta.removed);
      }
    } catch {
      logger.warn(`entity-counter: parse error in ${file} — skipping`);
    }
  }
  // #endregion END_PROCESS_FILES

  return result;
}
