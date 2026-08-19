// @file: Unit tests for ENV_FAIL combinators and the config rule compiler.
// @consumers: CI
// @tasks: TSK-95

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { GateOutcome } from '../stack.types.ts';

const { exitCodeMatches, streamMatches, compileEnvFailRules } = await import('../env-fail.ts');

/** @purpose Build a gate outcome fixture. */
function outcome(over: Partial<GateOutcome> = {}): GateOutcome {
  return { exitCode: 1, timedOut: false, stdout: '', stderr: '', output: '', ...over };
}

describe('exitCodeMatches', () => {
  it('supports every operator', () => {
    assert.equal(exitCodeMatches('==2')(outcome({ exitCode: 2 })), true);
    assert.equal(exitCodeMatches('!=0')(outcome({ exitCode: 3 })), true);
    assert.equal(exitCodeMatches('>1')(outcome({ exitCode: 2 })), true);
    assert.equal(exitCodeMatches('>1')(outcome({ exitCode: 1 })), false);
    assert.equal(exitCodeMatches('<5')(outcome({ exitCode: 4 })), true);
    assert.equal(exitCodeMatches('>=64')(outcome({ exitCode: 64 })), true);
    assert.equal(exitCodeMatches('<=78')(outcome({ exitCode: 78 })), true);
  });

  it('ANDs a list of conditions, so a sysexits range is expressible', () => {
    const infra = exitCodeMatches(['>=64', '<=78']);
    assert.equal(infra(outcome({ exitCode: 69 })), true);
    assert.equal(infra(outcome({ exitCode: 79 })), false);
    assert.equal(infra(outcome({ exitCode: 1 })), false);
  });

  it('accepts a bare number as equality', () => {
    assert.equal(exitCodeMatches(69)(outcome({ exitCode: 69 })), true);
  });

  it('never matches a null exit code — JS would coerce it to 0', () => {
    // `null >= 0` and `null <= 0` are true and `null != 0` is true in JS, so a
    // signal-killed gate would spuriously match without the explicit guard.
    for (const condition of ['>=0', '<=0', '!=0', '==0']) {
      assert.equal(
        exitCodeMatches(condition)(outcome({ exitCode: null })),
        false,
        `${condition} must not match a killed gate`
      );
    }
  });

  it('renders itself for --plan', () => {
    assert.equal(exitCodeMatches(['>=64', '<=78']).describe, 'exit >= 64 && exit <= 78');
  });
});

describe('streamMatches', () => {
  it('distinguishes stdout from stderr, and output spans both', () => {
    const onStderr = streamMatches('stderr', /docker daemon/m);
    assert.equal(onStderr(outcome({ stderr: 'Cannot connect to the Docker daemon' })), false);
    assert.equal(onStderr(outcome({ stderr: 'cannot reach docker daemon' })), true);
    assert.equal(onStderr(outcome({ stdout: 'docker daemon' })), false);

    const onOutput = streamMatches('output', /docker daemon/m);
    assert.equal(onOutput(outcome({ output: 'docker daemon' })), true);
  });
});

describe('compileEnvFailRules', () => {
  it('compiles a rule whose conditions AND together', () => {
    const { predicates, errors } = compileEnvFailRules(
      [{ exitCodeMatches: '!=0', stderrMatches: 'daemon', hint: 'start docker' }],
      'stack.golang.extraGates[0].envFail'
    );
    assert.deepEqual(errors, []);
    assert.equal(predicates.length, 1);
    assert.equal(predicates[0]!(outcome({ exitCode: 1, stderr: 'no daemon' })), true);
    assert.equal(predicates[0]!(outcome({ exitCode: 1, stderr: 'other' })), false, 'AND, not OR');
    assert.equal(predicates[0]!.hint, 'start docker');
  });

  it('requires a hint — an ENV_FAIL without remediation tells an agent nothing', () => {
    const { errors } = compileEnvFailRules([{ stderrMatches: 'x' }], 'cfg');
    assert.ok(errors.some((error) => error.path === 'cfg[0].hint'));
  });

  it('rejects a catch-all rule that would make FAIL unreachable', () => {
    for (const condition of ['>0', '!=0', '>=1']) {
      const { errors } = compileEnvFailRules([{ exitCodeMatches: condition, hint: 'h' }], 'cfg');
      assert.ok(
        errors.some((error) => error.message.includes('could never report FAIL')),
        `${condition} alone must be rejected`
      );
    }
  });

  it('accepts a catch-all when ANDed with something discriminating', () => {
    const { errors } = compileEnvFailRules(
      [{ exitCodeMatches: '!=0', stderrMatches: 'daemon', hint: 'h' }],
      'cfg'
    );
    assert.deepEqual(errors, []);
  });

  it('reports unknown keys, bad grammar and bad regexps with paths', () => {
    const { errors } = compileEnvFailRules(
      [
        { exitCodeMatch: '>1', hint: 'h' },
        { exitCodeMatches: '=>1', hint: 'h' },
        { stderrMatches: '(', hint: 'h' },
      ],
      'cfg'
    );
    assert.ok(errors.some((error) => error.path === 'cfg[0].exitCodeMatch'));
    assert.ok(errors.some((error) => error.path === 'cfg[1].exitCodeMatches'));
    assert.ok(errors.some((error) => error.path === 'cfg[2].stderrMatches'));
    // The YAML quoting trap belongs in the message: `>` starts a block scalar.
    const grammar = errors.find((error) => error.path === 'cfg[1].exitCodeMatches');
    assert.match(grammar?.message ?? '', /quote the value in YAML/);
  });

  it('rejects a rule with no condition at all', () => {
    const { errors } = compileEnvFailRules([{ hint: 'h' }], 'cfg');
    assert.ok(errors.some((error) => error.message.includes('needs at least one condition')));
  });
});
