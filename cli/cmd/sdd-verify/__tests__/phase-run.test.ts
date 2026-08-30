// @file: End-to-end ownership tests for one phase run and its atomic receipt.
// @consumers: N/A
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parsePhaseReceipts } from '../../../../shared/sdd/phase-receipt.ts';
import { runPhaseVerification } from '../phase-run.ts';
import type { PhaseVerifyContext } from '../phase-context.ts';

function fixture(): { root: string; context: PhaseVerifyContext } {
  const root = mkdtempSync(join(tmpdir(), 'sdd-phase-run-'));
  mkdirSync(join(root, 'specs/app'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'node_modules/.bin'), { recursive: true });
  writeFileSync(join(root, 'node_modules/.bin/gennady'), '');
  writeFileSync(join(root, 'src/a.ts'), 'export const a = 1;');
  writeFileSync(join(root, 'contract-one.js'), 'process.exit(0);');
  writeFileSync(join(root, 'contract-two.js'), 'process.exit(0);');
  writeFileSync(join(root, 'specs/app/app.spec.md'), '# App');
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:fix': 'prettier --write',
        'lint:fix': 'eslint --fix',
        'type-check': 'tsc --noEmit',
        test: 'node --test',
        'test:coverage': 'c8 node --test',
        format: 'prettier --check .',
        lint: 'gennady lint src/',
        fix: 'npm run format:fix -- . && npm run lint:fix -- .',
        'contract-one': 'node contract-one.js',
        'contract-two': 'node contract-two.js',
      },
    })
  );
  const taskPath = 'specs/app/app.task.TSK-1.md';
  writeFileSync(
    join(root, taskPath),
    [
      '<!--SECTION:META-->',
      '- **Task-ID:** TSK-1',
      '<!--/SECTION:META-->',
      '<!--SECTION:PHASES_OVERVIEW-->',
      '| ID | Kind | Deps | Status |',
      '|---|---|---|---|',
      '| P1 | impl | — | [ ] |',
      '| P2 | impl | P1 | [ ] |',
      '| P3 | impl | P2 | [ ] |',
      '<!--/SECTION:PHASES_OVERVIEW-->',
      '<!--SECTION:PHASE_P1-->',
      '- **Rules:**',
      '  - [Contract](contract-rule)',
      '- **Target Files:**',
      '  - src/a.ts',
      '- **Deleted Files:**',
      '  - none',
      '<!--/SECTION:PHASE_P1-->',
      '<!--SECTION:PHASE_P2-->',
      '- **Rules:**',
      '  - [Contract](contract-rule)',
      '- **Target Files:**',
      '  - src/a.ts',
      '- **Deleted Files:**',
      '  - none',
      '<!--/SECTION:PHASE_P2-->',
      '<!--SECTION:PHASE_P3-->',
      '- **Rules:**',
      '  - [Contract](contract-rule)',
      '- **Target Files:**',
      '  - src/a.ts',
      '- **Deleted Files:**',
      '  - none',
      '<!--/SECTION:PHASE_P3-->',
      '<!--SECTION:VERIFICATION-->',
      '<!--PHASE_RECEIPTS:v1-->',
      '| Command | Required by | Role |',
      '|---|---|---|',
      '| npm run contract-one | contract-rule | extra |',
      '| npm run contract-two | contract-rule | extra |',
      '<!--/SECTION:VERIFICATION-->',
      '<!--SECTION:EXECUTION_LOG-->',
      '## Execution Log',
      '<!--/SECTION:EXECUTION_LOG-->',
    ].join('\n')
  );
  return {
    root,
    context: {
      profile: 'code',
      profileBasis: 'phase-kind',
      targets: ['src/a.ts'],
      deletedFiles: [],
      specPath: 'specs/app/app.spec.md',
      taskPath,
      phaseId: 'P1',
      producesCoverage: false,
      verification: [
        { command: 'npm run contract-one', role: 'extra' },
        { command: 'npm run contract-two', role: 'extra' },
      ],
    },
  };
}

describe('runPhaseVerification', () => {
  it('runs foundation and ticket commands once in order, then writes complete evidence', async () => {
    const f = fixture();
    const ladder: string[] = [];
    const extras: string[] = [];
    try {
      const result = await runPhaseVerification(
        f.root,
        f.context,
        (command, args) => {
          ladder.push(`${command} ${args.join(' ')}`);
          return { exitCode: 0, output: '' };
        },
        (command) => {
          extras.push(command);
          return { exitCode: 0, output: '' };
        }
      );
      assert.strictEqual(result.ok, true);
      assert.strictEqual(ladder.filter((line) => line === 'npm run type-check').length, 1);
      assert.strictEqual(ladder.filter((line) => line === 'npm run test').length, 1);
      assert.deepStrictEqual(extras, ['npm run contract-one', 'npm run contract-two']);
      const parsed = parsePhaseReceipts(readFileSync(join(f.root, f.context.taskPath), 'utf-8'));
      assert.strictEqual(parsed.ok, true);
      if (parsed.ok) {
        assert.deepStrictEqual(
          parsed.receipts[0]?.commands.map(({ gate, role, exitCode }) => ({
            gate,
            role,
            exitCode,
          })),
          [
            { gate: 'fix', role: 'repair', exitCode: 0 },
            { gate: 'type-check', role: 'foundation', exitCode: 0 },
            { gate: 'test', role: 'foundation', exitCode: 0 },
            { gate: 'verification', role: 'extra', exitCode: 0 },
            { gate: 'verification', role: 'extra', exitCode: 0 },
          ]
        );
      }
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('does not follow a preplanted predictable receipt-temp symlink', async () => {
    const f = fixture();
    const ticket = join(f.root, f.context.taskPath);
    const victim = join(f.root, 'specs/app/victim.md');
    const planted = join(
      f.root,
      'specs/app',
      `.${f.context.taskPath.split('/').at(-1)}.phase-receipt-${process.pid}.tmp`
    );
    writeFileSync(victim, 'victim bytes');
    symlinkSync('victim.md', planted);
    try {
      const pass = () => ({ exitCode: 0, output: '' });
      const result = await runPhaseVerification(f.root, f.context, pass, pass);
      assert.strictEqual(result.ok, true, result.ok ? '' : result.message);
      assert.strictEqual(readFileSync(victim, 'utf-8'), 'victim bytes');
      assert.strictEqual(lstatSync(planted).isSymbolicLink(), true);
      assert.strictEqual(lstatSync(ticket).isFile(), true);
      assert.strictEqual(lstatSync(ticket).isSymbolicLink(), false);
      assert.match(readFileSync(ticket, 'utf-8'), /SDD_PHASE_RECEIPT:P1/);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('rejects a foundation write outside generated artifacts and writes no receipt', async () => {
    const f = fixture();
    const ticket = join(f.root, f.context.taskPath);
    writeFileSync(join(f.root, 'src/unrelated.ts'), 'before');
    try {
      const result = await runPhaseVerification(
        f.root,
        f.context,
        (command, args) => {
          if (`${command} ${args.join(' ')}` === 'npm run type-check')
            writeFileSync(join(f.root, 'src/unrelated.ts'), 'foundation mutation');
          return { exitCode: 0, output: '' };
        },
        () => ({ exitCode: 0, output: '' })
      );
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.match(result.message, /foundation mutated paths outside its permitted write-set/);
        assert.match(result.message, /src\/unrelated\.ts/);
      }
      assert.deepStrictEqual(parsePhaseReceipts(readFileSync(ticket, 'utf-8')), {
        ok: true,
        receipts: [],
      });
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('leaves a ticket symlink replacement intact and writes no green receipt', async () => {
    const f = fixture();
    const ticket = join(f.root, f.context.taskPath);
    const destination = join(f.root, 'specs/app/replacement.md');
    writeFileSync(destination, 'replacement destination');
    try {
      const result = await runPhaseVerification(
        f.root,
        f.context,
        (command, args) => {
          if (`${command} ${args.join(' ')}` === 'npm run type-check') {
            rmSync(ticket);
            symlinkSync('replacement.md', ticket);
          }
          return { exitCode: 0, output: '' };
        },
        () => ({ exitCode: 0, output: '' })
      );
      assert.strictEqual(result.ok, false);
      if (!result.ok) assert.match(result.message, /foundation mutated paths|ticket containment/);
      assert.strictEqual(lstatSync(ticket).isSymbolicLink(), true);
      assert.strictEqual(readFileSync(destination, 'utf-8'), 'replacement destination');
      assert.doesNotMatch(readFileSync(destination, 'utf-8'), /SDD_PHASE_RECEIPT/);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('leaves an atomic regular-file ticket replacement unreceipted', async () => {
    const f = fixture();
    const ticket = join(f.root, f.context.taskPath);
    try {
      const result = await runPhaseVerification(
        f.root,
        f.context,
        (command, args) => {
          if (`${command} ${args.join(' ')}` === 'npm run type-check')
            writeFileSync(ticket, 'concurrent replacement');
          return { exitCode: 0, output: '' };
        },
        () => ({ exitCode: 0, output: '' })
      );
      assert.strictEqual(result.ok, false);
      if (!result.ok) assert.match(result.message, /foundation mutated paths/);
      assert.strictEqual(readFileSync(ticket, 'utf-8'), 'concurrent replacement');
      assert.doesNotMatch(readFileSync(ticket, 'utf-8'), /SDD_PHASE_RECEIPT/);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('rejects a same-bytes ticket inode replacement that a content diff cannot see', async () => {
    const f = fixture();
    const ticket = join(f.root, f.context.taskPath);
    const original = readFileSync(ticket, 'utf-8');
    const originalInode = lstatSync(ticket).ino;
    mkdirSync(join(f.root, '.git'));
    const replacement = join(f.root, '.git/same-bytes-replacement.md');
    writeFileSync(replacement, original);
    assert.notStrictEqual(lstatSync(replacement).ino, originalInode);
    try {
      const result = await runPhaseVerification(
        f.root,
        f.context,
        (command, args) => {
          if (`${command} ${args.join(' ')}` === 'npm run type-check') {
            renameSync(replacement, ticket);
          }
          return { exitCode: 0, output: '' };
        },
        () => ({ exitCode: 0, output: '' })
      );
      assert.strictEqual(result.ok, false);
      if (!result.ok) assert.match(result.message, /ticket file identity changed/);
      assert.notStrictEqual(lstatSync(ticket).ino, originalInode);
      assert.strictEqual(readFileSync(ticket, 'utf-8'), original);
      assert.doesNotMatch(readFileSync(ticket, 'utf-8'), /SDD_PHASE_RECEIPT/);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('rejects type-check writing coverage in a test profile before the producer can run', async () => {
    const f = fixture();
    const ticket = join(f.root, f.context.taskPath);
    const context: PhaseVerifyContext = {
      ...f.context,
      profile: 'test',
      producesCoverage: true,
      verification: [],
    };
    let coverageRuns = 0;
    try {
      const result = await runPhaseVerification(
        f.root,
        context,
        (command, args) => {
          const invocation = `${command} ${args.join(' ')}`;
          if (invocation === 'npm run type-check') {
            mkdirSync(join(f.root, 'coverage'), { recursive: true });
            writeFileSync(join(f.root, 'coverage/type-check-owned.txt'), 'not producer-owned');
          }
          if (invocation === 'npm run test:coverage') coverageRuns++;
          return { exitCode: 0, output: '' };
        },
        () => ({ exitCode: 0, output: '' }),
        {
          writableArtifactDirectories: ['coverage'],
          clear: () => ({ ok: true as const }),
          wroteFresh: () => ({ ok: true as const }),
        }
      );
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.match(result.message, /foundation segment type-check/);
        assert.match(result.message, /coverage\/type-check-owned\.txt/);
      }
      assert.strictEqual(
        coverageRuns,
        0,
        'coverage producer must not run after a dirty strict segment'
      );
      assert.deepStrictEqual(parsePhaseReceipts(readFileSync(ticket, 'utf-8')), {
        ok: true,
        receipts: [],
      });
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('allows the coverage producer to write only its declared artifact directory', async () => {
    const f = fixture();
    const ticket = join(f.root, f.context.taskPath);
    const context: PhaseVerifyContext = {
      ...f.context,
      profile: 'test',
      producesCoverage: true,
      verification: [],
    };
    try {
      const result = await runPhaseVerification(
        f.root,
        context,
        (command, args) => {
          if (`${command} ${args.join(' ')}` === 'npm run test:coverage') {
            mkdirSync(join(f.root, 'coverage'), { recursive: true });
            writeFileSync(join(f.root, 'coverage/coverage-final.json'), '{}');
          }
          return { exitCode: 0, output: '' };
        },
        () => ({ exitCode: 0, output: '' }),
        {
          writableArtifactDirectories: ['coverage'],
          clear: () => ({ ok: true as const }),
          wroteFresh: () => ({ ok: true as const }),
        }
      );
      assert.strictEqual(result.ok, true, result.ok ? '' : result.message);
      const parsed = parsePhaseReceipts(readFileSync(ticket, 'utf-8'));
      assert.strictEqual(parsed.ok, true);
      if (parsed.ok)
        assert.ok(parsed.receipts[0]?.commands.some((command) => command.gate === 'test:coverage'));
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('allows declared coverage artifacts but rejects a coverage producer source write', async () => {
    const f = fixture();
    const ticket = join(f.root, f.context.taskPath);
    writeFileSync(join(f.root, 'src/unrelated.ts'), 'before');
    const context: PhaseVerifyContext = {
      ...f.context,
      profile: 'test',
      producesCoverage: true,
      verification: [],
    };
    try {
      const result = await runPhaseVerification(
        f.root,
        context,
        (command, args) => {
          if (`${command} ${args.join(' ')}` === 'npm run test:coverage') {
            mkdirSync(join(f.root, 'coverage'), { recursive: true });
            writeFileSync(join(f.root, 'coverage/coverage-final.json'), '{}');
            writeFileSync(join(f.root, 'src/unrelated.ts'), 'coverage source mutation');
          }
          return { exitCode: 0, output: '' };
        },
        () => ({ exitCode: 0, output: '' }),
        {
          writableArtifactDirectories: ['coverage'],
          clear: () => ({ ok: true as const }),
          wroteFresh: () => ({ ok: true as const }),
        }
      );
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.match(result.message, /foundation mutated paths outside its permitted write-set/);
        assert.match(result.message, /src\/unrelated\.ts/);
        assert.doesNotMatch(result.message, /coverage\/coverage-final\.json/);
      }
      assert.deepStrictEqual(parsePhaseReceipts(readFileSync(ticket, 'utf-8')), {
        ok: true,
        receipts: [],
      });
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('invalidates prior evidence before a failing rerun and never runs later §5 commands', async () => {
    const f = fixture();
    try {
      const pass = () => ({ exitCode: 0, output: '' });
      assert.strictEqual((await runPhaseVerification(f.root, f.context, pass, pass)).ok, true);
      const extras: string[] = [];
      const failed = await runPhaseVerification(f.root, f.context, pass, (command) => {
        extras.push(command);
        return { exitCode: 2, output: 'contract red' };
      });
      assert.strictEqual(failed.ok, false);
      assert.deepStrictEqual(extras, ['npm run contract-one']);
      assert.deepStrictEqual(
        parsePhaseReceipts(readFileSync(join(f.root, f.context.taskPath), 'utf-8')),
        { ok: true, receipts: [] }
      );
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('rejects dynamic §5 input before any command and preserves the prior receipt', async () => {
    const f = fixture();
    try {
      const pass = () => ({ exitCode: 0, output: '' });
      assert.strictEqual((await runPhaseVerification(f.root, f.context, pass, pass)).ok, true);
      const ticket = join(f.root, f.context.taskPath);
      const before = readFileSync(ticket, 'utf-8');
      let calls = 0;
      const countingRunner = () => {
        calls++;
        return { exitCode: 0, output: '' };
      };
      const result = await runPhaseVerification(
        f.root,
        {
          ...f.context,
          verification: [{ command: 'node --test ${TEST_FILE}', role: 'extra' }],
        },
        countingRunner,
        countingRunner
      );
      assert.strictEqual(result.ok, false);
      if (!result.ok) assert.match(result.message, /dynamic shell expansion is unsupported/);
      assert.strictEqual(calls, 0, 'preflight failure must invoke neither ladder nor §5 runner');
      assert.strictEqual(
        readFileSync(ticket, 'utf-8'),
        before,
        'a preflight failure occurs before old receipt deletion'
      );
      const parsed = parsePhaseReceipts(before);
      assert.strictEqual(parsed.ok, true);
      if (parsed.ok) assert.strictEqual(parsed.receipts.length, 1);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('rejects an unsupported package-manager option before any command', async () => {
    const f = fixture();
    let calls = 0;
    const countingRunner = () => {
      calls++;
      return { exitCode: 0, output: '' };
    };
    try {
      const ticket = join(f.root, f.context.taskPath);
      const before = readFileSync(ticket, 'utf-8');
      const result = await runPhaseVerification(
        f.root,
        {
          ...f.context,
          verification: [{ command: 'npm --workspace app run contract-one', role: 'extra' }],
        },
        countingRunner,
        countingRunner
      );
      assert.strictEqual(result.ok, false);
      if (!result.ok) assert.match(result.message, /unsupported npm option/);
      assert.strictEqual(calls, 0);
      assert.strictEqual(readFileSync(ticket, 'utf-8'), before);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('checks dependency completion and current receipt before any mutation', async () => {
    const f = fixture();
    let ladderCalls = 0;
    const runner = () => {
      ladderCalls++;
      return { exitCode: 0, output: '' };
    };
    try {
      const p2 = { ...f.context, phaseId: 'P2' };
      const unchecked = await runPhaseVerification(f.root, p2, runner, runner);
      assert.strictEqual(unchecked.ok, false);
      if (!unchecked.ok) assert.match(unchecked.message, /dependency P1 is not checked complete/);
      assert.strictEqual(ladderCalls, 0);

      assert.strictEqual((await runPhaseVerification(f.root, f.context, runner, runner)).ok, true);
      const ticket = join(f.root, f.context.taskPath);
      writeFileSync(
        ticket,
        readFileSync(ticket, 'utf-8').replace('| P1 | impl | — | [ ] |', '| P1 | impl | — | [x] |')
      );
      writeFileSync(join(f.root, 'src/a.ts'), 'changed after dependency receipt');
      const beforeBlocked = ladderCalls;
      const stale = await runPhaseVerification(f.root, p2, runner, runner);
      assert.strictEqual(stale.ok, false);
      if (!stale.ok) assert.match(stale.message, /dependency P1 is not current/);
      assert.strictEqual(ladderCalls, beforeBlocked);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('checks a transitive stale ancestor before a P3 attempt can mutate', async () => {
    const f = fixture();
    let ladderCalls = 0;
    const runner = () => {
      ladderCalls++;
      return { exitCode: 0, output: '' };
    };
    try {
      assert.strictEqual((await runPhaseVerification(f.root, f.context, runner, runner)).ok, true);
      const ticketPath = join(f.root, f.context.taskPath);
      writeFileSync(
        ticketPath,
        readFileSync(ticketPath, 'utf-8').replace(
          '| P1 | impl | — | [ ] |',
          '| P1 | impl | — | [x] |'
        )
      );
      assert.strictEqual(
        (await runPhaseVerification(f.root, { ...f.context, phaseId: 'P2' }, runner, runner)).ok,
        true
      );
      writeFileSync(
        ticketPath,
        readFileSync(ticketPath, 'utf-8').replace(
          '| P2 | impl | P1 | [ ] |',
          '| P2 | impl | P1 | [x] |'
        )
      );
      writeFileSync(join(f.root, 'src/a.ts'), 'stale ancestor');
      const before = ladderCalls;
      const result = await runPhaseVerification(
        f.root,
        { ...f.context, phaseId: 'P3' },
        runner,
        runner
      );
      assert.strictEqual(result.ok, false);
      if (!result.ok) assert.match(result.message, /dependency P1 is not current/);
      assert.strictEqual(ladderCalls, before);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });
});
