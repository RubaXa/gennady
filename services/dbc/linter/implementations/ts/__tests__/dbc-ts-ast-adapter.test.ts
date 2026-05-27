// @file: Tests for the DbcTsAstAdapter — parsing TypeScript files via tree-sitter.
// @consumers: N/A (testing only)
// @tasks: TSK-08

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DbcTsAstAdapter } from '../dbc-ts-ast-adapter.ts';

/**
 * @purpose Creates a temporary directory with a TypeScript file for testing.
 * @param fileName Temporary file name (e.g., 'test.ts').
 * @param content File content.
 * @returns { dir: tempDir, filePath: full file path }.
 */
function setupTempFile(fileName: string, content: string): { dir: string; filePath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'dbc-ast-test-'));
  const filePath = join(dir, fileName);
  writeFileSync(filePath, content, 'utf8');
  return { dir, filePath };
}

describe('DbcTsAstAdapter', () => {
  /** @purpose Valid TS file with all export kinds for multi-export parsing. */
  const allExportKindsSource = `
/** A simple constant greeting. */
export const hello = "world";

/**
 * Adds two numbers.
 * @param a First number.
 * @param b Second number.
 * @returns Sum of a and b.
 */
export function add(a: number, b: number): number {
  return a + b;
}

/** User entity class. */
export class User {
  /** User's unique identifier. */
  id: string;

  /** Creates a new user. */
  constructor(id: string) {
    this.id = id;
  }

  /** Returns the user's display name. */
  getName(): string {
    return this.id;
  }

  /** The cached avatar URL. */
  get avatar(): string {
    return '';
  }

  /** Sets the avatar URL. */
  set avatar(url: string) {
    // noop
  }
}

/** User shape contract. */
export interface IUser {
  /** Stable identifier. */
  id: string;

  /** Display name. */
  name: string;

  /** Retrieves profile. */
  getProfile(): IUser;
}

/** A shape alias. */
export type UserId = string;

/** Order states. */
export enum OrderState {
  /** New order. */
  NEW,
  /** Paid order. */
  PAID,
}

/** Default exported function. */
export default function defaultFn(x: number): string {
  return String(x);
}
`.trim();

  it('should parse valid TS file with all export kinds', async () => {
    // purpose: verify that all export kinds (const, function, class, interface, type, enum, default) are extracted
    // contract: each entity has name, kind, members, signature

    // #region START_PARSE_ALL_KINDS_SETUP
    const { dir, filePath } = setupTempFile('all-exports.ts', allExportKindsSource);
    const adapter = new DbcTsAstAdapter();
    // #endregion END_PARSE_ALL_KINDS_SETUP

    try {
      // #region START_PARSE_ALL_KINDS_TRIGGER
      const result = await adapter.parseFile(filePath);
      // #endregion END_PARSE_ALL_KINDS_TRIGGER

      // #region START_PARSE_ALL_KINDS_ASSERT
      assert.strictEqual(result.ok, true);
      if (!result.ok) throw new Error('expected ok: true');
      const { exported } = result;

      assert.ok(exported.length >= 7, `expected >= 7 exports, got ${exported.length}`);

      // const
      const constEntity = exported.find((e) => e.name === 'hello');
      assert.ok(constEntity, 'const hello not found');
      assert.strictEqual(constEntity?.kind, 'const');
      assert.match(constEntity?.contract?.text ?? '', /A simple constant greeting/);

      // function
      const fnEntity = exported.find((e) => e.name === 'add');
      assert.ok(fnEntity, 'function add not found');
      assert.strictEqual(fnEntity?.kind, 'function');
      assert.match(fnEntity?.contract?.text ?? '', /Adds two numbers/);
      assert.strictEqual(fnEntity?.signature.params.length, 2);
      assert.strictEqual(fnEntity?.signature.returnType, 'number');

      // class
      const classEntity = exported.find((e) => e.name === 'User');
      assert.ok(classEntity, 'class User not found');
      assert.strictEqual(classEntity?.kind, 'class');
      assert.match(classEntity?.contract?.text ?? '', /User entity class/);
      const memberKinds = classEntity?.members.map((m) => m.kind) ?? [];
      assert.ok(memberKinds.includes('field'), 'should have field member');
      assert.ok(memberKinds.includes('constructor'), 'should have constructor member');
      assert.ok(memberKinds.includes('method'), 'should have method member');
      assert.ok(memberKinds.includes('getter'), 'should have getter member');
      assert.ok(memberKinds.includes('setter'), 'should have setter member');

      // interface
      const ifaceEntity = exported.find((e) => e.name === 'IUser');
      assert.ok(ifaceEntity, 'interface IUser not found');
      assert.strictEqual(ifaceEntity?.kind, 'interface');
      assert.ok(ifaceEntity?.members.some((m) => m.kind === 'interface-property'));
      assert.ok(ifaceEntity?.members.some((m) => m.kind === 'interface-method'));

      // type
      const typeEntity = exported.find((e) => e.name === 'UserId');
      assert.ok(typeEntity, 'type UserId not found');
      assert.strictEqual(typeEntity?.kind, 'type');

      // enum
      const enumEntity = exported.find((e) => e.name === 'OrderState');
      assert.ok(enumEntity, 'enum OrderState not found');
      assert.strictEqual(enumEntity?.kind, 'enum');
      assert.ok(enumEntity?.members.some((m) => m.kind === 'enum-member' && m.name === 'NEW'));
      assert.ok(enumEntity?.members.some((m) => m.kind === 'enum-member' && m.name === 'PAID'));

      // export default
      const defaultExport = exported.find((e) => e.kind === 'function' && e.name === 'defaultFn');
      assert.ok(defaultExport, 'export default function not found');
      assert.strictEqual(defaultExport?.signature.returnType, 'string');
      // #endregion END_PARSE_ALL_KINDS_ASSERT
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should extract JSDoc contract text', async () => {
    // purpose: verify JSDoc comment before export is captured as contract with text and startLine
    // contract: contract.text contains the full JSDoc text; contract.startLine is the comment's line

    const source = `
/** @purpose Calculate sum. */
export function sum(a: number, b: number): number { return a + b; }
`.trim();

    // #region START_JSDOC_SETUP
    const { dir, filePath } = setupTempFile('jsdoc.ts', source);
    const adapter = new DbcTsAstAdapter();
    // #endregion END_JSDOC_SETUP

    try {
      // #region START_JSDOC_TRIGGER
      const result = await adapter.parseFile(filePath);
      // #endregion END_JSDOC_TRIGGER

      // #region START_JSDOC_ASSERT
      assert.strictEqual(result.ok, true);
      if (!result.ok) throw new Error('expected ok: true');
      const entity = result.exported[0];
      assert.ok(entity, 'no entity found');
      assert.ok(entity?.contract, 'contract should be defined');
      assert.match(entity?.contract?.text ?? '', /^\/\*\*.*@purpose/s);
      assert.ok((entity?.contract?.startLine ?? 0) > 0, 'startLine should be positive');
      // #endregion END_JSDOC_ASSERT
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should find contract before export keyword', async () => {
    // purpose: verify heuristic handles contract comment placed directly before 'export' keyword
    // contract: the JSDoc comment before 'export function' is found even though it precedes export, not the declaration

    // #region START_BEFORE_EXPORT_SETUP
    const source = '/** @purpose Brief. */ export function foo() {}\n';
    const { dir, filePath } = setupTempFile('before-export.ts', source);
    const adapter = new DbcTsAstAdapter();
    // #endregion END_BEFORE_EXPORT_SETUP

    try {
      // #region START_BEFORE_EXPORT_TRIGGER
      const result = await adapter.parseFile(filePath);
      // #endregion END_BEFORE_EXPORT_TRIGGER

      // #region START_BEFORE_EXPORT_ASSERT
      assert.strictEqual(result.ok, true);
      if (!result.ok) throw new Error('expected ok: true');
      const entity = result.exported.find((e) => e.name === 'foo');
      assert.ok(entity, 'entity foo not found');
      assert.ok(entity?.contract, 'contract should be found before export keyword');
      assert.match(entity?.contract?.text ?? '', /@purpose/);
      // #endregion END_BEFORE_EXPORT_ASSERT
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should return undefined contract when no JSDoc', async () => {
    // purpose: verify that entities without preceding JSDoc have contract=undefined
    // contract: contract field is undefined when no JSDoc comment precedes the entity

    // #region START_NO_CONTRACT_SETUP
    const source = 'export const x = 1;\nexport function bar(): void {}\n';
    const { dir, filePath } = setupTempFile('no-contract.ts', source);
    const adapter = new DbcTsAstAdapter();
    // #endregion END_NO_CONTRACT_SETUP

    try {
      // #region START_NO_CONTRACT_TRIGGER
      const result = await adapter.parseFile(filePath);
      // #endregion END_NO_CONTRACT_TRIGGER

      // #region START_NO_CONTRACT_ASSERT
      assert.strictEqual(result.ok, true);
      if (!result.ok) throw new Error('expected ok: true');
      for (const entity of result.exported) {
        assert.strictEqual(
          entity.contract,
          undefined,
          `entity ${entity.name} should have no contract`
        );
      }
      // #endregion END_NO_CONTRACT_ASSERT
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should return ok:false on syntax error', async () => {
    // purpose: verify that syntactically broken TypeScript returns ok:false with error string
    // contract: broken TS file → { ok: false, error: string }

    // #region START_SYNTAX_ERROR_SETUP
    const source = 'export function broken( {';
    const { dir, filePath } = setupTempFile('syntax-error.ts', source);
    const adapter = new DbcTsAstAdapter();
    // #endregion END_SYNTAX_ERROR_SETUP

    try {
      // #region START_SYNTAX_ERROR_TRIGGER
      const result = await adapter.parseFile(filePath);
      // #endregion END_SYNTAX_ERROR_TRIGGER

      // #region START_SYNTAX_ERROR_ASSERT
      assert.strictEqual(result.ok, false);
      if (result.ok) throw new Error('expected ok: false');
      assert.ok(result.error.length > 0, 'error string should not be empty');
      assert.match(result.error, /yntax|error|ERROR/);
      // #endregion END_SYNTAX_ERROR_ASSERT
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should return ok:false on missing file', async () => {
    // purpose: verify that a non-existent file path returns ok:false
    // contract: missing file → { ok: false, error: string }

    // #region START_MISSING_FILE_TRIGGER_AND_ASSERT
    const adapter = new DbcTsAstAdapter();
    const result = await adapter.parseFile('/tmp/nonexistent-dbc-file-99999.ts');
    assert.strictEqual(result.ok, false);
    if (result.ok) throw new Error('expected ok: false');
    assert.match(result.error, /not found|ENOENT|nonexistent/);
    // #endregion END_MISSING_FILE_TRIGGER_AND_ASSERT
  });

  it('should skip re-exports', async () => {
    // purpose: verify that re-exports (export { x } from, export * from) are excluded from exported list
    // contract: re-export entities are absent from the exported array

    // #region START_SKIP_REEXPORTS_SETUP
    const source = `
export const keep = 1;
export { keep as reexported } from './other';
export * from './other';
`;
    const { dir, filePath } = setupTempFile('re-exports.ts', source);
    const adapter = new DbcTsAstAdapter();
    // #endregion END_SKIP_REEXPORTS_SETUP

    try {
      // #region START_SKIP_REEXPORTS_TRIGGER
      const result = await adapter.parseFile(filePath);
      // #endregion END_SKIP_REEXPORTS_TRIGGER

      // #region START_SKIP_REEXPORTS_ASSERT
      assert.strictEqual(result.ok, true);
      if (!result.ok) throw new Error('expected ok: true');
      const names = result.exported.map((e) => e.name);
      assert.ok(names.includes('keep'), 'should include non-re-export const');
      assert.strictEqual(
        names.includes('reexported'),
        false,
        'should NOT include re-exported name'
      );
      assert.strictEqual(result.exported.length, 1, 'should only have the direct export');
      // #endregion END_SKIP_REEXPORTS_ASSERT
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should extract function signature correctly', async () => {
    // purpose: verify that function signature params (optional, rest, types) and returnType are correctly extracted
    // contract: params array and returnType match the source declaration

    // #region START_SIGNATURE_SETUP
    const source =
      'export function bar(x: string, y?: number, ...args: boolean[]): User { return {} as any; }';
    const { dir, filePath } = setupTempFile('signature.ts', source);
    const adapter = new DbcTsAstAdapter();
    // #endregion END_SIGNATURE_SETUP

    try {
      // #region START_SIGNATURE_TRIGGER
      const result = await adapter.parseFile(filePath);
      // #endregion END_SIGNATURE_TRIGGER

      // #region START_SIGNATURE_ASSERT
      assert.strictEqual(result.ok, true);
      if (!result.ok) throw new Error('expected ok: true');
      const entity = result.exported[0];
      assert.ok(entity, 'no entity found');
      const { params, returnType } = entity!.signature;

      assert.strictEqual(params.length, 3, `expected 3 params, got ${params.length}`);

      assert.strictEqual(params[0]?.name, 'x');
      assert.strictEqual(params[0]?.type, 'string');
      assert.strictEqual(params[0]?.optional, false);
      assert.strictEqual(params[0]?.isRest, false);

      assert.strictEqual(params[1]?.name, 'y');
      assert.strictEqual(params[1]?.type, 'number');
      assert.strictEqual(params[1]?.optional, true);
      assert.strictEqual(params[1]?.isRest, false);

      assert.strictEqual(params[2]?.name, 'args');
      assert.strictEqual(params[2]?.type, 'boolean[]');
      assert.strictEqual(params[2]?.optional, false);
      assert.strictEqual(params[2]?.isRest, true);

      assert.strictEqual(returnType, 'User');
      // #endregion END_SIGNATURE_ASSERT
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should treat default-value param as optional', async () => {
    // purpose: verify that required_parameter with `=` initializer is marked optional
    // contract: params[0].optional === true when default value is present

    const source = 'export function foo(x: string = "default"): void {}';
    const { dir, filePath } = setupTempFile('default-param.ts', source);
    const adapter = new DbcTsAstAdapter();

    try {
      const result = await adapter.parseFile(filePath);
      assert.strictEqual(result.ok, true);
      if (!result.ok) throw new Error('expected ok: true');
      const entity = result.exported[0];
      assert.ok(entity, 'no entity found');
      const { params } = entity!.signature;
      assert.strictEqual(params.length, 1);
      assert.strictEqual(params[0]?.name, 'x');
      assert.strictEqual(params[0]?.optional, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should never throw', async () => {
    // purpose: verify that the adapter never throws, even on garbage input
    // contract: DbcParseResult is always returned; no unhandled exceptions
    // failure mode: any unexpected throw breaks the linter pipeline

    const adapter = new DbcTsAstAdapter();

    const testCases: Array<{ label: string; content?: string; filePath?: string }> = [
      { label: 'empty file', content: '' },
      { label: 'binary garbage', content: '\x00\x01\x02\xff\xfe' },
      { label: 'random text', content: 'not typescript at all !@#$%^&*()' },
      { label: 'only comments', content: '// just a comment\n/* block comment */' },
      { label: 'missing file', filePath: '/tmp/does-not-exist-12345.ts' },
    ];

    // #region START_NEVER_THROW_TRIGGER_AND_ASSERT
    for (const tc of testCases) {
      let dir: string | undefined;
      let filePath: string;

      if (tc.filePath) {
        filePath = tc.filePath;
      } else {
        const setup = setupTempFile(`${tc.label.replace(/\s+/g, '-')}.ts`, tc.content ?? '');
        dir = setup.dir;
        filePath = setup.filePath;
      }

      try {
        const result = await adapter.parseFile(filePath);
        assert.ok(typeof result.ok === 'boolean', `${tc.label}: should return a result object`);
      } catch (err) {
        assert.fail(`${tc.label}: adapter threw unexpectedly: ${String(err)}`);
      } finally {
        if (dir) rmSync(dir, { recursive: true, force: true });
      }
    }
    // #endregion END_NEVER_THROW_TRIGGER_AND_ASSERT
  });
});
