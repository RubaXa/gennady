// @file: InventorySyncCheck — reconcile code exports with the module Entity Inventory both ways: undeclared exports (forward) and declared-but-unimplemented entities (reverse sweep).
// @consumers: LintCommand

import { DbcTsAstAdapter } from '../../../../services/dbc/linter/implementations/ts/dbc-ts-ast-adapter.ts';
import {
  ERR_CLI_LINT_INVENTORY_UNDECLARED,
  ERR_CLI_LINT_INVENTORY_UNIMPLEMENTED,
  type LintError,
} from '../lint.types.ts';

/**
 * @purpose Flag exported entities introduced in code but not declared in the module's closed-world Entity Inventory.
 * @invariant TS-only via the AST adapter; a parse failure yields [] (DbcContractCheck owns parse errors). Pure w.r.t. `declared`.
 * @param content Source text.
 * @param filePath File path — AST input and error location.
 * @param declared Entity names declared in the module spec inventory.
 * @returns One error per exported entity not in `declared`; empty when every export is declared.
 */
export async function check(
  content: string,
  filePath: string,
  declared: string[]
): Promise<LintError[]> {
  const result = await new DbcTsAstAdapter().parseFile(filePath, content);
  if (!result.ok) return [];
  const declaredSet = new Set(declared);
  return result.exported
    .filter((e) => !declaredSet.has(e.name))
    .map((e) => ({
      file: filePath,
      line: 1,
      col: 1,
      severity: 'error' as const,
      code: ERR_CLI_LINT_INVENTORY_UNDECLARED,
      message: `Exported \`${e.name}\` is not in the module's closed-world Entity Inventory (AX_CLOSED_WORLD_INVENTORY). Fix: remove it, or — if genuinely needed — log an \`intro <name> ← <reason>\` line (AX_INTRODUCED_DISCIPLINE) and backflow it into the spec inventory; never silently keep an undeclared export. If you added it under drift / context loss, re-read the module spec ## 3 Entity Inventory and AX_INTRODUCED_DISCIPLINE.`,
    }));
}

/**
 * @purpose Exported entity names of one TS file — the per-file contribution to the module's implemented set (reverse-direction sweep).
 * @invariant TS-only via the AST adapter; a parse failure yields [] (DbcContractCheck owns parse errors). Pure.
 * @param content Source text.
 * @param filePath File path — AST input.
 * @returns Exported entity names; empty when the file does not parse.
 */
export async function collectExports(content: string, filePath: string): Promise<string[]> {
  const result = await new DbcTsAstAdapter().parseFile(filePath, content);
  return result.ok ? result.exported.map((e) => e.name) : [];
}

/**
 * @purpose Flag inventory entities declared in the spec but exported by no scanned file — planned-but-unbuilt / renamed-away.
 * @invariant SOUND only when `implemented` is the union over the WHOLE module — the opt-in `--inventory-reverse` flag is the guard against partial sweeps. Pure.
 * @param declared Entity names from the module spec inventory.
 * @param implemented Union of exported names across every scanned file.
 * @param specPath Module spec path — error location for the operator.
 * @returns One error per declared entity absent from `implemented`; empty when all are implemented.
 */
export function reverseUnimplemented(
  declared: string[],
  implemented: Set<string>,
  specPath: string
): LintError[] {
  return declared
    .filter((name) => !implemented.has(name))
    .map((name) => ({
      file: specPath,
      line: 1,
      col: 1,
      severity: 'error' as const,
      code: ERR_CLI_LINT_INVENTORY_UNIMPLEMENTED,
      message: `Inventory entity \`${name}\` is declared in the spec but exported by no scanned file — planned-but-unbuilt or renamed-away. Fix: implement it, or remove the stale inventory row (and supersede the decision that introduced it). If the sweep did not cover the whole module, re-run \`lint --spec=<spec> --inventory-reverse <module-dir>\` over the full code root before trusting this.`,
    }));
}
