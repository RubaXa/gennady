// @file: Structural regression guard for explicit, platform-neutral ticket coverage applicability.
// @consumers: scaffold, phase execution, audit, sdd-task
// @tasks: N/A

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseVerificationTable } from '../../../shared/sdd/ticket.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf-8');

describe('explicit coverage policy contract', () => {
  const scaffold = read('ai', 'kit', 'templates', 'sdd-v2', 'scaffold.directive.hbs');
  const phase = read(
    'ai',
    'kit',
    'templates',
    'sdd-v2',
    'phase-execution-protocol.directive.hbs'
  );
  const audit = read('ai', 'kit', 'templates', 'sdd-v2', 'audit.directive.hbs');
  const execute = read('ai', 'kit', 'templates', 'sdd-v2', 'execute.directive.hbs');

  it('scaffold records one semantic decision and never invents Node defaults', () => {
    assert.match(scaffold, /Exactly one state:/);
    assert.match(scaffold, /relevant infra\/platform Verification Commands contract/);
    assert.match(scaffold, /N\+1 outer backticks/);
    assert.match(scaffold, /Parser strips only that wrapper/);
    assert.match(scaffold, /never XML-escape/);
    assert.match(scaffold, /EXCLUDING the coverage-reader alias owned solely by 5b/);
    assert.match(scaffold, /Config\/doc\/bootstrap\/infra labels alone do not decide/);
    assert.match(scaffold, /Do not invent\s+`testcov`, `80`, target paths, or another platform/);
    assert.match(scaffold, /record exactly one test phase as\s+`Coverage Owner Phase`/);
  });

  it('round-trips a pipeline with inner backticks and rejects its raw table form', () => {
    const command = 'printf `x` | grep x';
    const longest = Math.max(0, ...[...command.matchAll(/`+/g)].map((run) => run[0].length));
    const delimiter = '`'.repeat(longest + 1);
    const wrapped = parseVerificationTable(
      `| Command | Required by | Role |\n|---|---|---|\n| ${delimiter}${command}${delimiter} | RULE | extra |`
    );
    assert.deepStrictEqual(wrapped, {
      ok: true,
      gates: [{ command, requiredBy: ['RULE'], role: 'extra' }],
    });

    const raw = parseVerificationTable(
      `| Command | Required by | Role |\n|---|---|---|\n| ${command} | RULE | extra |`
    );
    assert.strictEqual(raw.ok, false);
    if (!raw.ok) assert.match(raw.issues.join('; '), /expected exactly 3 cells/);
  });

  it('phase selects the producer only from policy and audit consumes transported readers', () => {
    assert.match(phase, /Only in the declared `Coverage Owner Phase`/);
    assert.match(phase, /produces once then executes the one §5 Role=`coverage` reader/);
    assert.match(audit, /sdd-task --group-scope` already prints `coverage-gates:/);
    assert.match(audit, /Never derive extensions, paths,\s+thresholds, `testcov`, or platform defaults/);
    assert.match(execute, /each ticket's structured required coverage reader/);
  });
});
