// @file: Unit tests for the read-only `gennady verify` facade (V-16a, D-13) — invocation parsing
//   and deterministic plan resolution, no execution, no mutation.
// @spec: CLI-VERIFY
// @consumers: CI

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseVerifyInvocation } from '../verify.types.ts';
import { resolveVerifyPlan } from '../verify.cmd.ts';

// `verify.types.ts` keeps its own error-code constant module-private (ordinary decomposition, not
// public surface) — this test asserts on the message text directly instead of importing it.
const ERR_CLI_VERIFY_BAD_INVOCATION = 'ERR_CLI_VERIFY_BAD_INVOCATION';

const argv = (...rest: string[]): string[] => ['node', 'gennady.ts', 'verify', ...rest];

describe('parseVerifyInvocation', () => {
  it('--plan --json is the one valid invocation', () => {
    assert.deepStrictEqual(parseVerifyInvocation(argv('--plan', '--json')), { ok: true });
  });

  it('order does not matter', () => {
    assert.deepStrictEqual(parseVerifyInvocation(argv('--json', '--plan')), { ok: true });
  });

  it('no flags at all is a hard error, not an implicit plan', () => {
    const r = parseVerifyInvocation(argv());
    assert.strictEqual(r.ok, false);
    if (r.ok) return;
    assert.match(r.message, new RegExp(ERR_CLI_VERIFY_BAD_INVOCATION));
    assert.match(r.message, /both --plan and --json are required/);
  });

  it('--plan alone (no --json) is rejected', () => {
    const r = parseVerifyInvocation(argv('--plan'));
    assert.strictEqual(r.ok, false);
  });

  it('--json alone (no --plan) is rejected', () => {
    const r = parseVerifyInvocation(argv('--json'));
    assert.strictEqual(r.ok, false);
  });

  it('an unrelated flag (e.g. a mutating-sounding --fix) is rejected, not silently dropped', () => {
    const r = parseVerifyInvocation(argv('--plan', '--json', '--fix'));
    assert.strictEqual(r.ok, false);
    if (r.ok) return;
    assert.match(r.message, new RegExp(ERR_CLI_VERIFY_BAD_INVOCATION));
  });

  it('a stray positional path is rejected, not silently ignored', () => {
    const r = parseVerifyInvocation(argv('--plan', '--json', 'src/app.ts'));
    assert.strictEqual(r.ok, false);
    if (r.ok) return;
    assert.match(r.message, /unexpected path argument\(s\): src\/app\.ts/);
  });

  it('bad-invocation message always names the one usage', () => {
    const r = parseVerifyInvocation(argv());
    assert.strictEqual(r.ok, false);
    if (r.ok) return;
    assert.match(r.message, /usage: npx gennady verify --plan --json/);
  });
});

/** @purpose Create a temp project dir with given files, run fn, clean up. */
function withProject<T>(files: Record<string, string>, fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-plan-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), content);
    }
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('resolveVerifyPlan — read-only, exactly what sdd-verify --profile full would run', () => {
  it('a node repo with real scripts resolves each gate to `npm run <script>`; yagni always dispatches through gennady', () => {
    withProject(
      {
        'package.json': JSON.stringify({
          name: 'consumer',
          scripts: {
            'type-check': 'tsc --noEmit',
            'test:coverage': 'c8 node --test',
            lint: 'eslint .',
            format: 'prettier --check .',
          },
        }),
      },
      (dir) => {
        const plan = resolveVerifyPlan(dir);
        assert.strictEqual(plan.kind, 'plan');
        assert.strictEqual(plan.evidence, false);
        assert.strictEqual(plan.profile, 'full');
        assert.strictEqual(plan.stack, 'node');
        assert.deepStrictEqual(
          plan.gates
            .filter((g) => g.name !== 'yagni')
            .map((g) => ({ name: g.name, command: g.command, required: g.required })),
          [
            { name: 'type-check', command: 'npm run type-check', required: true },
            { name: 'test:coverage', command: 'npm run test:coverage', required: true },
            { name: 'lint', command: 'npm run lint', required: true },
            { name: 'format', command: 'npm run format', required: true },
          ]
        );
        // `yagni`'s exact self-hosting/consumer branch depends on `isSelfHosting()`'s own cwd read
        // (not this fixture's `root`, matching sdd-verify.cmd.ts's identical cwd-relative behavior)
        // — this unit test only proves it is a gennady-native dispatch, never an npm script lookup.
        const yagni = plan.gates.find((g) => g.name === 'yagni');
        assert.match(yagni?.command ?? '', /npx --no-install .*yagni$/);
        assert.strictEqual(yagni?.required, true);
      }
    );
  });

  it('a repo with no package.json at all still resolves a plan — command null for non-gennady gates, never throws', () => {
    withProject({}, (dir) => {
      const plan = resolveVerifyPlan(dir);
      assert.strictEqual(plan.stack, 'node');
      assert.deepStrictEqual(
        plan.gates.filter((g) => g.name !== 'yagni').map((g) => g.command),
        [null, null, null, null]
      );
      // yagni is a gennady-native dispatch, never gated by an npm script (matches sdd-verify.cmd.ts).
      assert.match(
        plan.gates.find((g) => g.name === 'yagni')?.command ?? '',
        /npx --no-install .*yagni$/
      );
    });
  });

  it('D-64: a detected secondary stack follows node as a qualified non-blocking tail in both plan consumers', () => {
    withProject(
      {
        'package.json': '{}',
        'go.mod': 'module example.com/x\n\ngo 1.22\n',
        'gennady.yaml':
          'stack:\n  use: [node, golang]\n  golang:\n    extraGates:\n      - id: govulncheck\n        argv: [govulncheck]\n',
      },
      (dir) => {
        const plan = resolveVerifyPlan(dir, {
          use: ['node', 'golang'],
          golang: { extraGates: [{ id: 'govulncheck', argv: ['govulncheck'] }] },
        });
        assert.strictEqual(plan.stack, 'node');
        assert.deepStrictEqual(
          plan.gates.map((g) => g.name),
          [
            'type-check',
            'test:coverage',
            'lint',
            'format',
            'yagni',
            'golang:generate',
            'golang:build',
            'golang:vet',
            'golang:fmt',
            'golang:lint',
            'golang:test',
            'golang:govulncheck',
          ]
        );
        assert.deepEqual(plan.stacks, ['node', 'golang']);
        assert.deepEqual(plan.gates.at(-1), {
          name: 'golang:govulncheck',
          stack: 'golang',
          command: 'govulncheck',
          required: false,
          blocking: false,
        });
      }
    );
  });

  it('D-64: stack.use can prioritize explicit always-match anystack; absent Swift never becomes primary', () => {
    withProject({ 'package.json': '{}' }, (dir) => {
      const explicit = resolveVerifyPlan(dir, {
        use: ['anystack', 'node'],
        anystack: { extraGates: [{ id: 'syntax', argv: ['check', 'syntax'] }] },
      });
      assert.strictEqual(explicit.stack, 'anystack');
      assert.deepEqual(explicit.stacks, ['anystack', 'node']);
      assert.deepEqual(
        explicit.gates.map((gate) => gate.name),
        [
          'syntax',
          'node:type-check',
          'node:test:coverage',
          'node:lint',
          'node:format',
          'node:yagni',
        ]
      );
      assert.equal(explicit.gates[0]?.blocking, true);
      assert.ok(explicit.gates.slice(1).every((gate) => gate.stack === 'node'));
      assert.ok(explicit.gates.slice(1).every((gate) => gate.blocking === false));

      const absent = resolveVerifyPlan(dir, { use: ['swift', 'node'] });
      assert.strictEqual(absent.stack, 'node');
      assert.deepEqual(absent.stacks, ['node']);

      assert.throws(
        () => resolveVerifyPlan(dir, { use: ['swift'] }),
        /SDD_VERIFY_NO_STACK_DETECTED/
      );
    });
  });

  it('D-64: explicit markerless anystack owns its own blocking full profile, never a Node ladder', () => {
    withProject({}, (dir) => {
      const plan = resolveVerifyPlan(dir, {
        use: ['anystack'],
        anystack: { extraGates: [{ id: 'syntax', argv: ['check', 'syntax'] }] },
      });
      assert.strictEqual(plan.stack, 'anystack');
      assert.deepEqual(plan.stacks, ['anystack']);
      assert.deepEqual(plan.gates, [
        {
          name: 'syntax',
          stack: 'anystack',
          command: 'check syntax',
          required: false,
          blocking: true,
        },
      ]);
    });
  });

  it('D-64: markerless bootstrap and single-stack node retain the historical full ladder', () => {
    withProject({}, (dir) => {
      const plan = resolveVerifyPlan(dir);
      assert.strictEqual(plan.stack, 'node');
      assert.deepEqual(plan.stacks, ['node']);
      assert.deepEqual(
        plan.gates.map(({ name, blocking }) => ({ name, blocking })),
        ['type-check', 'test:coverage', 'lint', 'format', 'yagni'].map((name) => ({
          name,
          blocking: true,
        }))
      );
    });
  });

  it('D-64 makes Go primary and blocking once V-09 supplies its preset', () => {
    withProject({ 'go.mod': 'module example.com/x\n\ngo 1.22\n' }, (dir) => {
      const plan = resolveVerifyPlan(dir);
      assert.equal(plan.stack, 'golang');
      assert.deepEqual(plan.stacks, ['golang']);
      assert.deepEqual(
        plan.gates.map((gate) => gate.name),
        ['generate', 'build', 'vet', 'fmt', 'lint', 'test']
      );
      assert.ok(plan.gates.every((gate) => gate.blocking));
    });
  });
});
