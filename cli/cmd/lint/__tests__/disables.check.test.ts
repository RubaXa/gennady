// @file: Unit tests for DisablesCheck — validates that every TS / linter disable cites a Decision Log entry AND carries a purpose.
// @consumers: LintCommand
// @tasks: TSK-51, TSK-52

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../checks/disables.check.ts';
import {
  ERR_CLI_LINT_UNAUTHORIZED_DISABLE,
  ERR_CLI_LINT_DISABLE_MISSING_PURPOSE,
  type LintError,
} from '../lint.types.ts';

const S = '/' + '/';
const BS = '/' + '*';
const BE = '*' + '/';

/**
 * DisablesCheck Test Graph (DC-01 .. DC-20 per specs/cli/lint/lint.spec.md §6.1):
 * ├── DC-01 contract typing
 * ├── DC-02 empty content
 * ├── DC-03 valid @ts-expect-error with D-NNN
 * ├── DC-04 unauthorized @ts-expect-error
 * ├── DC-05 @ts-ignore without D-NNN
 * ├── DC-06 @ts-nocheck without D-NNN
 * ├── DC-07 eslint-disable with D-NNN justification
 * ├── DC-08 eslint-disable-next-line without D-NNN
 * ├── DC-09 file-level eslint-disable without D-NNN
 * ├── DC-10 block comment with D-NNN
 * ├── DC-11 block comment without D-NNN
 * ├── DC-12 inline trailing valid
 * ├── DC-13 inline trailing without D-NNN
 * ├── DC-14 marker in string literal
 * ├── DC-15 multiple markers mixed
 * ├── DC-16 single-digit D-N
 * ├── DC-17 D-NNN in comment without disable marker
 * ├── DC-18 file header is not a disable marker
 * ├── DC-19 case insensitive D-NNN
 * └── DC-20 error col points to marker
 */
describe('DisablesCheck', () => {
  it('DC-01 contract typing — check(content, filePath) returns LintError[]', () => {
    // Type-level assertion: assigning the return to LintError[] must compile without `as` casts.
    const result: LintError[] = check('', 'foo.ts');
    assert.ok(Array.isArray(result));
  });

  it('DC-02 empty content → []', () => {
    assert.deepEqual(check('', 'foo.ts'), []);
  });

  it('DC-03 valid @ts-expect-error with D-NNN → []', () => {
    const content = `${S} @ts-expect-error: D-042 — abstract class instantiation test\nclass _X {}\n`;
    assert.deepEqual(check(content, 'foo.ts'), []);
  });

  // --- TSK-52 additions: purpose enforcement (DC-21..DC-25) ---

  it('DC-21 D-NNN without purpose → MISSING_PURPOSE', () => {
    const content = `${S} @ts-expect-error: D-042\nclass _X {}\n`;
    const errors = check(content, 'foo.ts');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, ERR_CLI_LINT_DISABLE_MISSING_PURPOSE);
    assert.ok(errors[0].message.includes('D-042'));
    assert.ok(errors[0].message.includes('@ts-expect-error'));
    assert.ok(errors[0].message.includes('≥'));
  });

  it('DC-22 D-NNN with too-short purpose → MISSING_PURPOSE', () => {
    const content = `${S} @ts-ignore D-042 fix\nfoo()\n`;
    const errors = check(content, 'foo.ts');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, ERR_CLI_LINT_DISABLE_MISSING_PURPOSE);
  });

  it('DC-23 D-NNN with sufficient purpose → []', () => {
    // purpose text: `: — abstract class gate` (after stripping marker + D-042) — 19 non-ws chars
    const content = `${S} @ts-ignore: D-042 — abstract class gate\nfoo()\n`;
    assert.deepEqual(check(content, 'foo.ts'), []);
  });

  it('DC-24 eslint-disable with rule name but no reason → MISSING_PURPOSE', () => {
    // After stripping `eslint-disable-next-line` and `D-017`: ` foo -- ` → `foo--` = 5 non-ws chars
    const content = `${S} eslint-disable-next-line foo -- D-017\nconst x: any = 1;\n`;
    const errors = check(content, 'foo.ts');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, ERR_CLI_LINT_DISABLE_MISSING_PURPOSE);
  });

  it('DC-25 block comment with D-NNN but no purpose → MISSING_PURPOSE', () => {
    const content = `${BS} @ts-ignore: D-099 ${BE}\nfoo()\n`;
    const errors = check(content, 'foo.ts');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, ERR_CLI_LINT_DISABLE_MISSING_PURPOSE);
  });

  it('DC-04 unauthorized @ts-expect-error → 1 error', () => {
    const content = `${S} @ts-expect-error: Cannot instantiate abstract class\nclass _X {}\n`;
    const errors = check(content, 'foo.ts');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, ERR_CLI_LINT_UNAUTHORIZED_DISABLE);
    assert.equal(errors[0].line, 1);
    assert.ok(errors[0].message.includes('@ts-expect-error'));
    assert.ok(errors[0].message.includes('D-NNN'));
  });

  it('DC-05 @ts-ignore without D-NNN → 1 error', () => {
    const errors = check(`${S} @ts-ignore\nfoo()\n`, 'foo.ts');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, ERR_CLI_LINT_UNAUTHORIZED_DISABLE);
  });

  it('DC-06 @ts-nocheck without D-NNN → 1 error', () => {
    const errors = check(`${S} @ts-nocheck\n`, 'foo.ts');
    assert.equal(errors.length, 1);
  });

  it('DC-07 eslint-disable-next-line with D-NNN justification → []', () => {
    const content = `${S} eslint-disable-next-line no-explicit-any -- D-017: third-party type missing\nconst x: any = 1;\n`;
    assert.deepEqual(check(content, 'foo.ts'), []);
  });

  it('DC-08 eslint-disable-next-line without D-NNN → 1 error', () => {
    const errors = check(`${S} eslint-disable-next-line no-explicit-any\nconst x: any = 1;\n`, 'foo.ts');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, ERR_CLI_LINT_UNAUTHORIZED_DISABLE);
  });

  it('DC-09 file-level eslint-disable without D-NNN → 1 error', () => {
    const errors = check(`${S} eslint-disable\nfoo()\n`, 'foo.ts');
    assert.equal(errors.length, 1);
  });

  it('DC-10 block comment with D-NNN → []', () => {
    const content = `${BS} @ts-ignore: D-099 (see spec) ${BE}\nfoo()\n`;
    assert.deepEqual(check(content, 'foo.ts'), []);
  });

  it('DC-11 block comment without D-NNN → 1 error', () => {
    const errors = check(`${BS} @ts-ignore ${BE}\nfoo()\n`, 'foo.ts');
    assert.equal(errors.length, 1);
  });

  it('DC-12 inline trailing with D-NNN → []', () => {
    const content = `foo(); ${S} @ts-expect-error D-042 — boundary type\n`;
    assert.deepEqual(check(content, 'foo.ts'), []);
  });

  it('DC-13 inline trailing without D-NNN → 1 error', () => {
    const errors = check(`foo(); ${S} @ts-expect-error\n`, 'foo.ts');
    assert.equal(errors.length, 1);
  });

  it('DC-14 marker text in string literal → []', () => {
    const content = 'const docs = `Use ' + S + ' @ts-ignore: foo` + "more text";\n';
    assert.deepEqual(check(content, 'foo.ts'), []);
  });

  it('DC-15 multiple markers mixed → 1 error for the unauthorized one', () => {
    const content =
      `${S} @ts-ignore: D-001 — first valid disable\n` +
      `${S} @ts-expect-error: D-002 — second valid disable\n` +
      `${S} @ts-nocheck\n` +
      `${S} eslint-disable-next-line no-explicit-any -- D-003 third valid disable\n`;
    const errors = check(content, 'foo.ts');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].line, 3);
    assert.equal(errors[0].code, ERR_CLI_LINT_UNAUTHORIZED_DISABLE);
  });

  it('DC-16 single-digit D-N is valid', () => {
    assert.deepEqual(check(`${S} @ts-ignore: D-7 — quick fix\n`, 'foo.ts'), []);
  });

  it('DC-17 D-NNN in comment without disable marker → []', () => {
    assert.deepEqual(check(`${S} See D-042 for rationale\n`, 'foo.ts'), []);
  });

  it('DC-18 file header is not a disable marker → []', () => {
    const content = `${S} @file: Module description D-042\n${S} @consumers: Foo\n`;
    assert.deepEqual(check(content, 'foo.ts'), []);
  });

  it('DC-19 case insensitive D-NNN', () => {
    assert.deepEqual(check(`${S} @ts-ignore: d-042 — lowercase\n`, 'foo.ts'), []);
    const lacksDigits = check(`${S} @ts-ignore: D-NNN — letters not digits\n`, 'foo.ts');
    assert.equal(lacksDigits.length, 1);
  });

  it('DC-20 error col points to start of the marker', () => {
    // Layout: 4 leading spaces, then slash-slash, then space, then marker. Expected col equals indexOf marker + 1.
    const line = '    ' + S + ' @ts-ignore\n';
    const errors = check(line, 'foo.ts');
    assert.equal(errors.length, 1);
    const expectedCol = line.indexOf('@ts-ignore') + 1;
    assert.equal(errors[0].col, expectedCol);
  });
});
