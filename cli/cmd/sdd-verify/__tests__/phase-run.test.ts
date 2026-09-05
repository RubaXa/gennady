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
import { resolvePhaseContext, type PhaseVerifyContext } from '../phase-context.ts';
import { phaseReceiptCommandIssue, phaseReceiptIssue } from '../phase-receipt-validation.ts';
import { collectTicketCorpus } from '../../../../shared/sdd/ticket-resolve.ts';
import { phaseVerificationNodeReaches } from '../../../../shared/sdd/phase-verification-plan.ts';
import { checkPhaseReceipts } from '../../sdd-check/phase-receipt-check.ts';

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

function canonicalContext(root: string, taskPath: string, phase: string): PhaseVerifyContext {
  const result = resolvePhaseContext(taskPath, phase, root);
  assert.strictEqual(result.ok, true, result.ok ? '' : result.message);
  if (!result.ok) throw new Error(result.message);
  assert.ok(result.context.gatePlan);
  return result.context;
}

describe('runPhaseVerification', () => {
  it('records a setup receipt after running only configured gates and extras while a foreign gate remains delegated', async () => {
    const f = fixture();
    const ladder: string[] = [];
    const extras: string[] = [];
    try {
      const context: PhaseVerifyContext = {
        ...f.context,
        profile: 'setup',
        verification: [{ command: 'npm run contract-one', role: 'extra' }],
        gatePlan: {
          ticket: 'TSK-1',
          phase: 'P1',
          profile: 'setup',
          producesCoverage: false,
          gates: [
            {
              name: 'fix',
              state: 'COMMAND_MISSING',
              required: false,
              command: null,
              prerequisites: [],
              provider: null,
              next: 'declare runnable repair leaves',
            },
            {
              name: 'type-check',
              state: 'PREREQUISITE_PENDING',
              required: false,
              command: 'npm run type-check',
              prerequisites: ['typescript.compiler'],
              provider: 'TSK-1/P2',
              next: 'continue with P2',
            },
            {
              name: 'test',
              state: 'CONFIGURED',
              required: false,
              command: 'npm run test',
              prerequisites: [],
              provider: null,
              next: 'run npm run test',
            },
          ],
        },
      };
      const result = await runPhaseVerification(
        f.root,
        context,
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
      assert.deepStrictEqual(ladder, ['npm run test']);
      assert.deepStrictEqual(extras, ['npm run contract-one']);
      const parsed = parsePhaseReceipts(readFileSync(join(f.root, context.taskPath), 'utf-8'));
      assert.strictEqual(parsed.ok, true);
      if (parsed.ok) {
        const receipt = parsed.receipts.find((candidate) => candidate.phase === 'P1');
        assert.deepStrictEqual(
          receipt?.commands.map(({ gate, command }) => ({ gate, command })),
          [
            { gate: 'test', command: 'npm run test' },
            { gate: 'verification', command: 'npm run contract-one' },
          ]
        );
        assert.deepStrictEqual(
          receipt?.gateEvidence?.map(({ name, state, provider }) => ({ name, state, provider })),
          [
            { name: 'fix', state: 'COMMAND_MISSING', provider: null },
            { name: 'type-check', state: 'PREREQUISITE_PENDING', provider: 'TSK-1/P2' },
            { name: 'test', state: 'PROVEN', provider: null },
          ]
        );
        assert.ok(receipt);
        assert.strictEqual(phaseReceiptCommandIssue(receipt, context.gatePlan), null);
        assert.match(
          phaseReceiptCommandIssue(
            { ...receipt, commands: receipt.commands.filter((command) => command.gate !== 'test') },
            context.gatePlan
          ) ?? '',
          /differs from canonical applicable plan/
        );
      }
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('lets the structural plan own ordinary-test versus coverage execution and receipt evidence', async () => {
    for (const owner of [false, true]) {
      const f = fixture();
      const calls: string[] = [];
      try {
        const gateName = owner ? 'test:coverage' : 'test';
        const context: PhaseVerifyContext = {
          ...f.context,
          profile: 'test',
          producesCoverage: !owner,
          verification: [],
          gatePlan: {
            ticket: 'TSK-1',
            phase: 'P1',
            profile: 'test',
            producesCoverage: owner,
            gates: [
              {
                name: gateName,
                state: 'CONFIGURED',
                required: true,
                command: `npm run ${gateName}`,
                prerequisites: [],
                provider: null,
                next: `run npm run ${gateName}`,
              },
            ],
          },
        };
        const result = await runPhaseVerification(
          f.root,
          context,
          (command, args) => {
            calls.push(`${command} ${args.join(' ')}`);
            return { exitCode: 0, output: '' };
          },
          () => ({ exitCode: 0, output: '' })
        );
        assert.strictEqual(result.ok, true);
        assert.deepStrictEqual(calls, [`npm run ${gateName}`]);
        const parsed = parsePhaseReceipts(readFileSync(join(f.root, context.taskPath), 'utf-8'));
        assert.strictEqual(parsed.ok, true);
        if (parsed.ok) {
          const receipt = parsed.receipts.find((candidate) => candidate.phase === 'P1');
          assert.strictEqual(receipt?.producesCoverage, owner);
          assert.deepStrictEqual(
            receipt?.commands.map(({ gate, command }) => ({ gate, command })),
            [{ gate: gateName, command: `npm run ${gateName}` }]
          );
          assert.deepStrictEqual(
            receipt?.gateEvidence?.map(({ name, state }) => ({ name, state })),
            [{ name: gateName, state: 'PROVEN' }]
          );
        }
      } finally {
        rmSync(f.root, { recursive: true, force: true });
      }
    }
  });

  it('executes the exact typecheck alias selected by the canonical phase plan', async () => {
    const f = fixture();
    const pkgPath = join(f.root, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
      scripts: Record<string, string>;
    };
    pkg.scripts.typecheck = pkg.scripts['type-check'] as string;
    delete pkg.scripts['type-check'];
    writeFileSync(pkgPath, JSON.stringify(pkg));
    const calls: string[] = [];
    try {
      const context: PhaseVerifyContext = {
        ...f.context,
        verification: [],
        gatePlan: {
          ticket: 'TSK-1',
          phase: 'P1',
          profile: 'code',
          producesCoverage: false,
          gates: [
            {
              name: 'type-check',
              state: 'CONFIGURED',
              required: true,
              command: 'npm run typecheck',
              prerequisites: ['typescript.compiler'],
              provider: 'TSK-1/P1',
              next: 'run npm run typecheck',
            },
          ],
        },
      };
      const result = await runPhaseVerification(
        f.root,
        context,
        (command, args) => {
          calls.push(`${command} ${args.join(' ')}`);
          return { exitCode: 0, output: '' };
        },
        () => ({ exitCode: 0, output: '' })
      );
      assert.strictEqual(result.ok, true);
      assert.deepStrictEqual(calls, ['npm run typecheck']);
      const parsed = parsePhaseReceipts(readFileSync(join(f.root, context.taskPath), 'utf-8'));
      assert.strictEqual(parsed.ok, true);
      if (parsed.ok)
        assert.deepStrictEqual(
          parsed.receipts[0]?.commands.map((command) => command.command),
          ['npm run typecheck']
        );
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('keeps an earlier shared-target receipt current only through a valid dependent writer receipt', async () => {
    const f = fixture();
    const ticketPath = join(f.root, f.context.taskPath);
    const original = readFileSync(ticketPath, 'utf-8');
    writeFileSync(
      ticketPath,
      original
        .replace('  - src/a.ts', '  - __P1_SRC__\n  - package.json')
        .replaceAll('  - src/a.ts', '  - package.json')
        .replace('  - __P1_SRC__', '  - src/a.ts')
        .replace('| P1 | impl | — | [ ] |', '| P1 | impl | — | [x] |')
    );
    writeFileSync(join(f.root, 'tsconfig.json'), '{}');
    const pass = () => ({ exitCode: 0, output: '' });
    const p1 = canonicalContext(f.root, f.context.taskPath, 'P1');
    try {
      assert.strictEqual((await runPhaseVerification(f.root, p1, pass, pass)).ok, true);
      const p2 = canonicalContext(f.root, f.context.taskPath, 'P2');
      const before = parsePhaseReceipts(readFileSync(ticketPath, 'utf-8'));
      assert.strictEqual(before.ok, true);
      if (!before.ok) return;
      const p1Receipt = before.receipts.find((receipt) => receipt.phase === 'P1');
      assert.ok(p1Receipt);
      assert.strictEqual(phaseReceiptIssue(f.root, p1Receipt, 'P1', ticketPath), null);

      let changed = false;
      const p2Result = await runPhaseVerification(
        f.root,
        p2,
        (command, args) => {
          if (!changed && `${command} ${args.join(' ')}`.includes('format:fix')) {
            const pkg = JSON.parse(readFileSync(join(f.root, 'package.json'), 'utf-8')) as Record<
              string,
              unknown
            >;
            pkg.description = 'written by P2';
            writeFileSync(join(f.root, 'package.json'), JSON.stringify(pkg));
            changed = true;
          }
          return { exitCode: 0, output: '' };
        },
        pass
      );
      assert.strictEqual(p2Result.ok, true, p2Result.ok ? '' : p2Result.message);
      const after = parsePhaseReceipts(readFileSync(ticketPath, 'utf-8'));
      assert.strictEqual(after.ok, true);
      if (!after.ok) return;
      const persistedP1 = after.receipts.find((receipt) => receipt.phase === 'P1');
      const persistedP2 = after.receipts.find((receipt) => receipt.phase === 'P2');
      assert.ok(persistedP1 && persistedP2);
      const corpus = collectTicketCorpus(f.root);
      assert.strictEqual(corpus.ok, true);
      if (!corpus.ok) return;
      assert.strictEqual(
        phaseVerificationNodeReaches(
          corpus.refs,
          { ticketFile: ticketPath, phaseId: 'P2' },
          { ticketFile: ticketPath, phaseId: 'P1' }
        ),
        true,
        JSON.stringify(corpus.refs.map((ref) => ({ file: ref.file, taskId: ref.taskId })))
      );
      assert.strictEqual(
        phaseReceiptIssue(f.root, persistedP1, 'P1', ticketPath),
        null,
        'P2 is a valid DAG-downstream writer of the same target'
      );
      assert.deepStrictEqual(
        checkPhaseReceipts(ticketPath, ticketPath, readFileSync(ticketPath, 'utf-8'), f.root).map(
          (finding) => finding.code
        ),
        []
      );
      writeFileSync(join(f.root, 'src/a.ts'), 'unrelated drift after P2');
      assert.deepStrictEqual(
        checkPhaseReceipts(ticketPath, ticketPath, readFileSync(ticketPath, 'utf-8'), f.root).map(
          (finding) => finding.code
        ),
        ['SDD_PHASE_RECEIPT_STALE_TARGETS']
      );
      writeFileSync(join(f.root, 'src/a.ts'), 'export const a = 1;');
      const pkg = JSON.parse(readFileSync(join(f.root, 'package.json'), 'utf-8')) as Record<
        string,
        unknown
      >;
      pkg.description = 'changed after P2 receipt';
      writeFileSync(join(f.root, 'package.json'), JSON.stringify(pkg));
      assert.match(
        phaseReceiptIssue(f.root, persistedP2, 'P2', ticketPath) ?? '',
        /Target Files or Deleted Files changed/
      );
      assert.ok(
        checkPhaseReceipts(ticketPath, ticketPath, readFileSync(ticketPath, 'utf-8'), f.root).some(
          (finding) => finding.code === 'SDD_PHASE_RECEIPT_STALE_TARGETS'
        )
      );
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('recognizes a valid shared-target supersession across an ordered ticket dependency', async () => {
    const f = fixture();
    const firstPath = join(f.root, f.context.taskPath);
    writeFileSync(
      firstPath,
      readFileSync(firstPath, 'utf-8').replaceAll('  - src/a.ts', '  - package.json')
    );
    const secondTaskPath = 'specs/app/app.task.TSK-2.md';
    writeFileSync(
      join(f.root, secondTaskPath),
      [
        '<!--SECTION:META-->',
        '- **Task-ID:** TSK-2',
        '- **Status:** [ ] TODO',
        '- **Scope:** app',
        '- **Dependencies:** TSK-1',
        '<!--/SECTION:META-->',
        '<!--SECTION:PHASES_OVERVIEW-->',
        '| ID | Kind | Deps | Status |',
        '|---|---|---|---|',
        '| P1 | impl | — | [ ] |',
        '<!--/SECTION:PHASES_OVERVIEW-->',
        '<!--SECTION:PHASE_P1-->',
        '- **Rules:**',
        '  - [Contract](contract-rule)',
        '- **Target Files:**',
        '  - package.json',
        '- **Deleted Files:**',
        '  - none',
        '<!--/SECTION:PHASE_P1-->',
        '<!--SECTION:VERIFICATION-->',
        '| Command | Required by | Role |',
        '|---|---|---|',
        '| npm run contract-one | contract-rule | extra |',
        '<!--/SECTION:VERIFICATION-->',
        '<!--SECTION:EXECUTION_LOG-->',
        '## Execution Log',
        '<!--/SECTION:EXECUTION_LOG-->',
      ].join('\n')
    );
    writeFileSync(join(f.root, 'tsconfig.json'), '{}');
    const pass = () => ({ exitCode: 0, output: '' });
    const first = canonicalContext(f.root, f.context.taskPath, 'P1');
    const second = canonicalContext(f.root, secondTaskPath, 'P1');
    try {
      assert.strictEqual((await runPhaseVerification(f.root, first, pass, pass)).ok, true);
      const firstParsed = parsePhaseReceipts(readFileSync(firstPath, 'utf-8'));
      assert.strictEqual(firstParsed.ok, true);
      if (!firstParsed.ok) return;
      const firstReceipt = firstParsed.receipts.find((receipt) => receipt.phase === 'P1');
      assert.ok(firstReceipt);
      let changed = false;
      const secondResult = await runPhaseVerification(
        f.root,
        second,
        (command, args) => {
          if (!changed && `${command} ${args.join(' ')}`.includes('format:fix')) {
            const pkg = JSON.parse(readFileSync(join(f.root, 'package.json'), 'utf-8')) as Record<
              string,
              unknown
            >;
            pkg.description = 'written by dependent TSK-2';
            writeFileSync(join(f.root, 'package.json'), JSON.stringify(pkg));
            changed = true;
          }
          return { exitCode: 0, output: '' };
        },
        pass
      );
      assert.strictEqual(secondResult.ok, true, secondResult.ok ? '' : secondResult.message);
      const corpus = collectTicketCorpus(f.root);
      assert.strictEqual(corpus.ok, true);
      if (!corpus.ok) return;
      assert.strictEqual(
        phaseVerificationNodeReaches(
          corpus.refs,
          { ticketFile: join(f.root, secondTaskPath), phaseId: 'P1' },
          { ticketFile: firstPath, phaseId: 'P1' }
        ),
        true,
        JSON.stringify(corpus.refs.map((ref) => ({ file: ref.file, taskId: ref.taskId })))
      );
      assert.strictEqual(
        phaseReceiptIssue(f.root, firstReceipt, 'P1', firstPath),
        null,
        'TSK-2 depends on TSK-1 and has a current receipt for the shared target'
      );
      assert.deepStrictEqual(
        checkPhaseReceipts(firstPath, firstPath, readFileSync(firstPath, 'utf-8'), f.root).map(
          (finding) => finding.code
        ),
        []
      );
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('validates shared-target supersession per target across a three-phase writer chain', async () => {
    const f = fixture();
    const ticketPath = join(f.root, f.context.taskPath);
    const original = readFileSync(ticketPath, 'utf-8');
    writeFileSync(
      ticketPath,
      original
        .replace(
          '<!--SECTION:PHASE_P2-->\n- **Rules:**\n  - [Contract](contract-rule)\n- **Target Files:**\n  - src/a.ts',
          '<!--SECTION:PHASE_P2-->\n- **Rules:**\n  - [Contract](contract-rule)\n- **Target Files:**\n  - src/a.ts\n  - src/b.ts'
        )
        .replace(
          '<!--SECTION:PHASE_P3-->\n- **Rules:**\n  - [Contract](contract-rule)\n- **Target Files:**\n  - src/a.ts',
          '<!--SECTION:PHASE_P3-->\n- **Rules:**\n  - [Contract](contract-rule)\n- **Target Files:**\n  - src/b.ts'
        )
        .replace('| P1 | impl | — | [ ] |', '| P1 | impl | — | [x] |')
        .replace('| P2 | impl | P1 | [ ] |', '| P2 | impl | P1 | [x] |')
        .replace('| P3 | impl | P2 | [ ] |', '| P3 | impl | P2 | [x] |')
    );
    writeFileSync(join(f.root, 'src/b.ts'), 'export const b = 1;');
    writeFileSync(join(f.root, 'tsconfig.json'), '{}');
    const pass = () => ({ exitCode: 0, output: '' });
    try {
      const p1 = canonicalContext(f.root, f.context.taskPath, 'P1');
      assert.strictEqual((await runPhaseVerification(f.root, p1, pass, pass)).ok, true);

      const p2 = canonicalContext(f.root, f.context.taskPath, 'P2');
      let p2Changed = false;
      const p2Result = await runPhaseVerification(
        f.root,
        p2,
        (command, args) => {
          if (!p2Changed && `${command} ${args.join(' ')}`.includes('format:fix')) {
            writeFileSync(join(f.root, 'src/a.ts'), 'export const a = 2;');
            writeFileSync(join(f.root, 'src/b.ts'), 'export const b = 2;');
            p2Changed = true;
          }
          return pass();
        },
        pass
      );
      assert.strictEqual(p2Result.ok, true, p2Result.ok ? '' : p2Result.message);

      const p3 = canonicalContext(f.root, f.context.taskPath, 'P3');
      let p3Changed = false;
      const p3Result = await runPhaseVerification(
        f.root,
        p3,
        (command, args) => {
          if (!p3Changed && `${command} ${args.join(' ')}`.includes('format:fix')) {
            writeFileSync(join(f.root, 'src/b.ts'), 'export const b = 3;');
            p3Changed = true;
          }
          return pass();
        },
        pass
      );
      assert.strictEqual(p3Result.ok, true, p3Result.ok ? '' : p3Result.message);

      const content = readFileSync(ticketPath, 'utf-8');
      const receipts = parsePhaseReceipts(content);
      assert.strictEqual(receipts.ok, true);
      if (!receipts.ok) return;
      for (const phase of ['P1', 'P2', 'P3']) {
        const receipt = receipts.receipts.find((candidate) => candidate.phase === phase);
        assert.ok(receipt);
        assert.strictEqual(
          phaseReceiptIssue(f.root, receipt, phase, ticketPath),
          null,
          `${phase} must remain valid through its downstream per-target receipt chain`
        );
      }
      assert.deepStrictEqual(
        checkPhaseReceipts(ticketPath, ticketPath, content, f.root).map((finding) => finding.code),
        []
      );
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('reports PROVEN only after the real gate run and persists receipt evidence', async () => {
    const f = fixture();
    try {
      const context: PhaseVerifyContext = {
        ...f.context,
        gatePlan: {
          ticket: 'TSK-1',
          phase: 'P1',
          profile: 'code',
          producesCoverage: false,
          gates: [
            {
              name: 'type-check',
              state: 'CONFIGURED',
              required: true,
              command: 'npm run type-check',
              prerequisites: ['typescript.compiler'],
              provider: 'INF-typescript/P1',
              next: 'run npm run type-check',
            },
          ],
        },
      };
      const pass = () => ({ exitCode: 0, output: '' });
      const result = await runPhaseVerification(f.root, context, pass, pass);
      assert.strictEqual(result.ok, true);
      if (result.ok) assert.match(result.text, /gate-state: type-check PROVEN/);
      const receipts = parsePhaseReceipts(readFileSync(join(f.root, context.taskPath), 'utf-8'));
      assert.strictEqual(receipts.ok, true);
      if (receipts.ok) {
        assert.ok(
          receipts.receipts
            .find((receipt) => receipt.phase === 'P1')
            ?.commands.some((command) => command.gate === 'type-check' && command.exitCode === 0)
        );
      }
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

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
      const ticket = join(f.root, f.context.taskPath);
      writeFileSync(join(f.root, 'src/b.ts'), 'export const b = 1;');
      writeFileSync(
        ticket,
        readFileSync(ticket, 'utf-8').replace(
          '<!--SECTION:PHASE_P2-->\n- **Rules:**\n  - [Contract](contract-rule)\n- **Target Files:**\n  - src/a.ts',
          '<!--SECTION:PHASE_P2-->\n- **Rules:**\n  - [Contract](contract-rule)\n- **Target Files:**\n  - src/b.ts'
        )
      );
      const p2 = { ...f.context, phaseId: 'P2', targets: ['src/b.ts'] };
      const unchecked = await runPhaseVerification(f.root, p2, runner, runner);
      assert.strictEqual(unchecked.ok, false);
      if (!unchecked.ok) assert.match(unchecked.message, /dependency P1 is not checked complete/);
      assert.strictEqual(ladderCalls, 0);

      assert.strictEqual((await runPhaseVerification(f.root, f.context, runner, runner)).ok, true);
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

  it('lets the current DAG-downstream phase replace an exact shared target before recording its own receipt', async () => {
    const f = fixture();
    const runner = () => ({ exitCode: 0, output: '' });
    try {
      assert.strictEqual((await runPhaseVerification(f.root, f.context, runner, runner)).ok, true);
      const ticket = join(f.root, f.context.taskPath);
      writeFileSync(
        ticket,
        readFileSync(ticket, 'utf-8').replace('| P1 | impl | — | [ ] |', '| P1 | impl | — | [x] |')
      );
      writeFileSync(join(f.root, 'src/a.ts'), 'changed by the declared P2 writer');
      const result = await runPhaseVerification(
        f.root,
        { ...f.context, phaseId: 'P2' },
        runner,
        runner
      );
      assert.strictEqual(result.ok, true, result.ok ? '' : result.message);
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
      const p2Result = await runPhaseVerification(
        f.root,
        { ...f.context, phaseId: 'P2' },
        runner,
        runner
      );
      assert.strictEqual(p2Result.ok, true, p2Result.ok ? '' : p2Result.message);
      writeFileSync(
        ticketPath,
        readFileSync(ticketPath, 'utf-8').replace(
          '| P2 | impl | P1 | [ ] |',
          '| P2 | impl | P1 | [x] |'
        )
      );
      writeFileSync(join(f.root, 'src/b.ts'), 'current P3 target');
      writeFileSync(
        ticketPath,
        readFileSync(ticketPath, 'utf-8').replace(
          '<!--SECTION:PHASE_P3-->\n- **Rules:**\n  - [Contract](contract-rule)\n- **Target Files:**\n  - src/a.ts',
          '<!--SECTION:PHASE_P3-->\n- **Rules:**\n  - [Contract](contract-rule)\n- **Target Files:**\n  - src/b.ts'
        )
      );
      writeFileSync(join(f.root, 'src/a.ts'), 'stale ancestor');
      const before = ladderCalls;
      const result = await runPhaseVerification(
        f.root,
        { ...f.context, phaseId: 'P3', targets: ['src/b.ts'] },
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
