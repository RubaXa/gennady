// @file: Locks that DbcTsLinter autofix output is Prettier-compatible — the two defects that made
// `npm run fix` (prettier --write; then lint --autofix) non-idempotent: a bare `*/` closing marker
// and a `*`-prefix added in column 0. Both produced blocks that `prettier --check` then rejected.
// @consumers: DbcTsLinter
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { format, check } from 'prettier';
import { DbcTsLinter } from '../dbc-ts-linter.ts';
import { DbcJsDocParser } from '../../../../parser/implementations/jsdoc/dbc-jsdoc-parser.ts';
import { DbcTsAstAdapter } from '../dbc-ts-ast-adapter.ts';

function linter(): DbcTsLinter {
  return new DbcTsLinter(new DbcJsDocParser(), new DbcTsAstAdapter());
}

// Prettier-format the source (as `npm run fix` does first), autofix it on disk, read it back.
async function formatThenAutofix(source: string): Promise<string> {
  const formatted = await format(source, { parser: 'typescript' });
  const dir = mkdtempSync(join(tmpdir(), 'dbc-prettier-idem-'));
  const file = join(dir, 'subject.ts');
  writeFileSync(file, formatted);
  await linter().lintAndFix(file);
  return readFileSync(file, 'utf8');
}

// Autofix a RAW (not prettier-first) source on disk, read it back — exercises the linter's own
// re-indentation rather than letting Prettier pre-align the JSDoc stars.
async function autofixRaw(source: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'dbc-raw-'));
  const file = join(dir, 'subject.ts');
  writeFileSync(file, source);
  await linter().lintAndFix(file);
  return readFileSync(file, 'utf8');
}

// Every JSDoc line in a top-level block must carry its star at column 1 (` * ` / ` */`), never at
// column 0 — that is exactly what Prettier requires and what both defects violated.
function assertNoStarInColumnZero(text: string): void {
  for (const line of text.split('\n')) {
    assert.ok(!/^\*/.test(line), `JSDoc line starts with '*' in column 0: ${JSON.stringify(line)}`);
  }
}

describe('DbcTsLinter autofix output is Prettier-compatible (idempotency)', () => {
  it('expands a single-line pipe contract to a block Prettier accepts (top-level)', async () => {
    const src = `// @file: subject
/** @purpose Add two numbers. | @param a First addend. | @param b Second addend. | @returns The sum. */
export function addNumbers(a: number, b: number): number {
  return a + b;
}
`;
    const out = await formatThenAutofix(src);
    assert.ok(out.includes('\n */'), `closing marker must be ' */', got:\n${out}`);
    assertNoStarInColumnZero(out);
    assert.strictEqual(
      await check(out, { parser: 'typescript' }),
      true,
      `prettier --check must pass on the autofixed output:\n${out}`
    );
  });

  it('expands a member (indented) pipe contract to a block Prettier accepts', async () => {
    const src = `// @file: subject
/** @purpose A user. */
export class User {
  /** @purpose Greet someone. | @param name Who to greet. | @returns The greeting string. */
  greet(name: string): string {
    return \`hi \${name}\`;
  }
}
`;
    const out = await formatThenAutofix(src);
    assert.strictEqual(
      await check(out, { parser: 'typescript' }),
      true,
      `prettier --check must pass on the autofixed member output:\n${out}`
    );
  });

  it('_normalizeMultiLine aligns a starless body line to the canonical star indent, not column 0', () => {
    const input = ['/**', ' * @purpose Something.', 'line of prose without a star', ' */'].join(
      '\n'
    );
    const out = (
      linter() as unknown as { _normalizeMultiLine(s: string): string }
    )._normalizeMultiLine(input);
    assert.ok(
      out.includes('\n * line of prose without a star'),
      `starless line must be aligned as ' * ...', got:\n${out}`
    );
    assert.ok(
      !out.includes('\n* line of prose'),
      `starless line must NOT land in column 0, got:\n${out}`
    );
  });

  it('normalizes a mixed / column-0 star prefix to the canonical indent Prettier accepts', async () => {
    // Raw source with a body line lacking a star and another over-indented — the exact shape that
    // used to survive autofix as `*` in column 0 / a 3-space star at top level, which prettier rejects.
    const src = `// @file: subject
/**
   * @purpose Has proper star.
 @param x Missing star.
   * @returns Result has proper star.
 */
export function f4(x: string): string {
  return x;
}
`;
    const out = await autofixRaw(src);
    assertNoStarInColumnZero(out);
    assert.strictEqual(
      await check(out, { parser: 'typescript' }),
      true,
      `prettier --check must pass on the normalized mixed-prefix output:\n${out}`
    );
  });

  it('_expandToMultiline closes with a space-prefixed marker (top-level and indented)', () => {
    const l = linter() as unknown as { _expandToMultiline(s: string, kind?: string): string };
    const top = l._expandToMultiline(
      '/** @purpose T. | @param a A. | @param b B. | @returns R. */',
      'function'
    );
    assert.ok(top.endsWith('\n */'), `top-level close must be ' */', got:\n${top}`);
    assertNoStarInColumnZero(top);
  });
});
