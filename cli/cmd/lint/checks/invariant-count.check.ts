// @file: Invariant count validation — checks that exported entities don't exceed the invariant threshold.
// @consumers: LintCommand
// @tasks: TSK-XX

import type { LintError } from '../lint.types.ts';
import { ERR_CLI_LINT_TOO_MANY_INVARIANTS } from '../lint.types.ts';
import { stripStringsAndComments } from './utils/strip-strings-comments.ts';

const EXPORT_DECL_RE =
  /^\s*export\s+(?:(?:default\s+)?(?:function|class|abstract\s+class|interface))\s+(\w+)/;

const PLAIN_DECL_RE = /^\s*(?:function|class|abstract\s+class|interface)\s+(\w+)/;

const REGION_INVARIANT_RE = /\/\/\s*#region\s+START_\w+.*\binvariant\s*:/;

interface EntityContext {
  name: string;
  nameLine: number;
  nameCol: number;
  bodyDepth: number;
  count: number;
}

/**
 * @purpose Streams through the file tracking brace depth and current enclosing entity.
 *         Counts @invariant JSDoc tags and invariant: region comments per entity.
 *         When an entity body closes, checks threshold and emits error if exceeded.
 * @param content Source text to validate.
 * @param filePath File path for error messages.
 * @param maxInvariants Threshold — entities with more invariants trigger an error.
 * @returns List of lint errors, empty when all entities are within limit.
 */
export function check(content: string, filePath: string, maxInvariants: number): LintError[] {
  const lines = content.split('\n');
  const errors: LintError[] = [];
  let braceDepth = 0;

  const entityStack: EntityContext[] = [];
  let currentEntity: EntityContext | null = null;

  // State for detecting class/function declarations
  let pendingExport = false;
  let pendingEntityName = '';
  let pendingEntityLine = 0;
  let pendingEntityCol = 0;

  // JSDoc tracking: when inside JSDoc block, capture @invariant tags
  let inJSDoc = false;
  let jsdocInvariants: number[] = []; // line numbers of @invariant

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    // JSDoc block start
    if (trimmed.startsWith('/**')) {
      // Single-line JSDoc: /** @invariant ... */
      if (trimmed.includes('*/') && trimmed.length > 3) {
        const count = countInvariants(trimmed);
        jsdocInvariants = [];
        for (let k = 0; k < count; k++) jsdocInvariants.push(lineNum);
        // Don't skip — let the code below detect export declaration on same line
      } else {
        inJSDoc = true;
        jsdocInvariants = [];
        continue;
      }
    }

    // Inside JSDoc block — collect @invariant
    if (inJSDoc) {
      if (trimmed.includes('*/')) {
        inJSDoc = false;
        continue;
      }
      const count = countInvariants(trimmed);
      for (let k = 0; k < count; k++) jsdocInvariants.push(lineNum);
      continue;
    }

    // Detect export declaration (may appear after JSDoc on same line)
    const declMatch = line.match(EXPORT_DECL_RE);
    const afterJSDoc = trimmed.includes('*/') ? trimmed.slice(trimmed.lastIndexOf('*/') + 2) : null;
    const afterJSDocMatch = afterJSDoc
      ? afterJSDoc.match(
          /^\s*export\s+(?:(?:default\s+)?(?:function|class|abstract\s+class|interface))\s+(\w+)/
        )
      : null;
    const effectiveDeclMatch = declMatch || afterJSDocMatch;
    const jsdocOffset = afterJSDocMatch ? trimmed.lastIndexOf('*/') + 2 : 0;
    if (effectiveDeclMatch) {
      pendingExport = true;
      pendingEntityName = effectiveDeclMatch[1];
      pendingEntityLine = lineNum;
      const matchIdx = (effectiveDeclMatch.index ?? 0) + jsdocOffset;
      const nameIdx = line.indexOf(pendingEntityName, matchIdx);
      pendingEntityCol = (nameIdx >= 0 ? nameIdx : matchIdx) + 1;
    } else if (jsdocInvariants.length > 0 && PLAIN_DECL_RE.test(line)) {
      // Non-export declaration consumes JSDoc — reset invariant count
      jsdocInvariants = [];
    }

    // Process braces on this line
    const cleanLine = stripStringsAndComments(line);
    for (const ch of cleanLine) {
      if (ch === '{') {
        braceDepth++;

        // If we have a pending export declaration, this { starts its body
        if (pendingExport) {
          const entity: EntityContext = {
            name: pendingEntityName,
            nameLine: pendingEntityLine,
            nameCol: pendingEntityCol,
            bodyDepth: braceDepth,
            count: jsdocInvariants.length, // JSDoc invariants collected before the declaration
          };

          // Also push to stack so nested entity can be tracked
          entityStack.push(entity);
          currentEntity = entity;
          pendingExport = false;
          jsdocInvariants = [];
        }
      } else if (ch === '}') {
        // Check if current entity's body is closing
        if (currentEntity && braceDepth === currentEntity.bodyDepth) {
          if (currentEntity.count > maxInvariants) {
            errors.push({
              file: filePath,
              line: currentEntity.nameLine,
              col: currentEntity.nameCol,
              severity: 'error',
              code: ERR_CLI_LINT_TOO_MANY_INVARIANTS,
              message: `Entity "${currentEntity.name}" has ${currentEntity.count} invariants (max ${maxInvariants}) — consider reviewing the contract; too many invariants suggest the entity is overloaded`,
            });
          }
          entityStack.pop();
          currentEntity = entityStack.length > 0 ? entityStack[entityStack.length - 1] : null;
        }
        braceDepth--;
      }
    }

    // Check for region invariant on this line
    if (currentEntity && REGION_INVARIANT_RE.test(line)) {
      currentEntity.count++;
    }
  }

  // Clean up remaining entities (unclosed — shouldn't happen normally but just in case)
  for (const entity of entityStack) {
    if (entity.count > maxInvariants) {
      errors.push({
        file: filePath,
        line: entity.nameLine,
        col: entity.nameCol,
        severity: 'error',
        code: ERR_CLI_LINT_TOO_MANY_INVARIANTS,
        message: `Entity "${entity.name}" has ${entity.count} invariants (max ${maxInvariants}) — consider reviewing the contract; too many invariants suggest the entity is overloaded`,
      });
    }
  }

  errors.sort((a, b) => a.line - b.line || a.col - b.col);
  return errors;
}

function countInvariants(text: string): number {
  const matches = text.match(/@invariant\b/g);
  return matches ? matches.length : 0;
}
