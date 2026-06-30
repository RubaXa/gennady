// @file: CastSafetyCheck — flag every `expr as Type` assertion (TS) via the AST; any/unknown/never get the strong wording, general assertions the inference-bypass wording.
// @consumers: LintCommand

import { extname } from 'node:path';
import { DbcTsAstAdapter } from '../../../../services/dbc/linter/implementations/ts/dbc-ts-ast-adapter.ts';
import { ERR_CLI_LINT_UNSAFE_CAST, type LintError } from '../lint.types.ts';

// Languages whose casts we resolve via the TS tree-sitter AST. A new language (e.g. '.go') needs its own
// detector — there is no shared regex path: regexes false-positive on `import { x as y }` renames and generics,
// which is exactly why detection moved to the AST (supersedes the regex era — see D-013/D-016).
const TS_EXTS = new Set(['.ts', '.tsx', '.mts', '.cts']);

/**
 * @purpose Build the corrective message for a cast site — strongest for `any`/`unknown`/`never`, inference-bypass wording for a general assertion.
 * @invariant Both branches cite AX_NO_SILENT_ESCAPE_HATCH and offer a documented escape (`@ts-expect-error` / a justifying comment). Pure.
 * @param type The asserted type text.
 * @param dangerous Whether the type is exactly `any` / `unknown` / `never`.
 * @returns The lint message.
 */
function castMessage(type: string, dangerous: boolean): string {
  if (dangerous) {
    return `Unsafe cast \`as ${type}\` defeats the type system — escape hatches must be surfaced, not hidden (AX_NO_SILENT_ESCAPE_HATCH). Fix: remove it (use a proper type or type guard); if a real type error must be suppressed, replace it with a documented \`// @ts-expect-error <reason, D-NNN>\`. If this slipped in under context loss, re-read AX_NO_SILENT_ESCAPE_HATCH.`;
  }
  return `Type assertion \`as ${type}\` bypasses inference — the compiler stops checking this value, a silent escape hatch (AX_NO_SILENT_ESCAPE_HATCH). Fix: narrow with a type guard or correct the source type so the assertion is unnecessary; if it is genuinely required (e.g. a parsed external boundary), keep it and document why in a nearby comment, or use a documented \`// @ts-expect-error <reason, D-NNN>\`. If this slipped in under context loss, re-read AX_NO_SILENT_ESCAPE_HATCH.`;
}

/**
 * @purpose Flag every `expr as Type` assertion in a TS file (AST-precise: skips `as const`, import/export renames, `satisfies`, strings, comments).
 * @invariant Never throws; a parse failure yields [] (DbcContractCheck owns parse errors). Non-TS files return []. Angle-bracket `<T>x` is out of scope (tsx grammar).
 * @param content Source text to scan.
 * @param filePath File path — selects the language and labels errors.
 * @returns Lint errors (one per assertion), ascending by source position; empty when none or the language is unsupported.
 */
export async function check(content: string, filePath: string): Promise<LintError[]> {
  if (!TS_EXTS.has(extname(filePath).toLowerCase())) return [];

  const sites = await new DbcTsAstAdapter().extractCastSites(filePath, content);
  return sites.map((s) => ({
    file: filePath,
    line: s.line,
    col: s.col,
    severity: 'error' as const,
    code: ERR_CLI_LINT_UNSAFE_CAST,
    message: castMessage(s.type, s.dangerous),
  }));
}
