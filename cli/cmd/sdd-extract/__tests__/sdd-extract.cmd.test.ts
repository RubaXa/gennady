// @file: Integration tests for SddExtractCommand#run — arg parsing, file-I/O mapping, outcome + exit codes.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

type SddExtractModule = typeof import('../sdd-extract.cmd.ts');

let mod: SddExtractModule;
let origExit: typeof process.exit;
let origArgv: string[];
let tmpDir: string;
let ticket: string;

const TICKET = [
  '# cli-foo: Task Ticket',
  '',
  '<!--SECTION:META-->',
  '- **Task-ID:** cli-foo',
  '- **Status:** [ ] TODO',
  '<!--/SECTION:META-->',
  '',
  '<!--SECTION:DANGLING-->',
  'orphan open, no close',
  '',
  '<!--SECTION:DUP-->',
  'first',
  '<!--/SECTION:DUP-->',
  '<!--SECTION:DUP-->',
  'second',
  '<!--/SECTION:DUP-->',
  '',
  '<!--SECTION:HOLLOW-->',
  '<!--/SECTION:HOLLOW-->',
].join('\n');

function argv(...rest: string[]): string[] {
  return ['node', 'gennady', 'sdd-extract', ...rest];
}

describe('SddExtractCommand', () => {
  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    process.argv = ['node', 'gennady', 'sdd-extract'];
    tmpDir = mkdtempSync(join(tmpdir(), 'sdd-extract-test-'));
    ticket = join(tmpDir, 'ticket.md');
    writeFileSync(ticket, TICKET, 'utf-8');
    mod = await import('../sdd-extract.cmd.ts');
  });

  after(() => {
    process.exit = origExit;
    process.argv = origArgv;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns the section body on success, without marker lines', async () => {
    const outcome = await mod.run(argv(ticket, 'META'));
    assert.strictEqual(outcome.ok, true);
    if (outcome.ok) {
      assert.match(outcome.content, /Task-ID/);
      assert.doesNotMatch(outcome.content, /SECTION:META/);
    }
  });

  it('maps an absent anchor to exit 2 / ANCHOR_NOT_FOUND', async () => {
    const outcome = await mod.run(argv(ticket, 'EXECUTION_LOG'));
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.strictEqual(outcome.exitCode, 2);
      assert.match(outcome.code, /ANCHOR_NOT_FOUND/);
      assert.ok(outcome.message.length > 0, 'message must never be empty');
    }
  });

  it('maps unbalanced markers to exit 3 / ANCHOR_UNBALANCED', async () => {
    const outcome = await mod.run(argv(ticket, 'DANGLING'));
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.strictEqual(outcome.exitCode, 3);
      assert.match(outcome.code, /ANCHOR_UNBALANCED/);
    }
  });

  it('maps a duplicated section to exit 3 / ANCHOR_DUPLICATED', async () => {
    const outcome = await mod.run(argv(ticket, 'DUP'));
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.strictEqual(outcome.exitCode, 3);
      assert.match(outcome.code, /ANCHOR_DUPLICATED/);
    }
  });

  it('maps an empty section to exit 2 / ANCHOR_EMPTY', async () => {
    const outcome = await mod.run(argv(ticket, 'HOLLOW'));
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.strictEqual(outcome.exitCode, 2);
      assert.match(outcome.code, /ANCHOR_EMPTY/);
    }
  });

  it('rejects a non-canonical name with exit 4 / INVALID_NAME before reading', async () => {
    const outcome = await mod.run(argv(ticket, 'meta'));
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.strictEqual(outcome.exitCode, 4);
      assert.match(outcome.code, /INVALID_NAME/);
    }
  });

  it('rejects wrong argument count with exit 4 / BAD_INVOCATION', async () => {
    const outcome = await mod.run(argv(ticket));
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.strictEqual(outcome.exitCode, 4);
      assert.match(outcome.code, /BAD_INVOCATION/);
    }
  });

  it('maps a missing file to exit 1 / FILE_NOT_FOUND', async () => {
    const outcome = await mod.run(argv(join(tmpDir, 'nope.md'), 'META'));
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.strictEqual(outcome.exitCode, 1);
      assert.match(outcome.code, /FILE_NOT_FOUND/);
    }
  });
});
