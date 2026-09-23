// @file: Batch 23A acceptance corpora — frozen V1 zero-new-error proof (E-22), isolated adversarial
//   V2 both-way cases (E-23), and one deterministic named-outcome injection (V14-3).
// @spec: AI-SKILLS
// @consumers: N/A (test file)

import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  dedupeSortFindings,
  toBaselineFindings,
  zeroNewErrorVerdict,
  type BaselineFinding,
  type SddCheckBaseline,
} from '../scripts/sdd-check-baseline-compare.ts';
import type { SddCheckJsonPayload } from '../scripts/run-sdd-check-json.ts';
import { checkTaskGraph, type Finding, type TicketRef } from '../../../shared/sdd/check.ts';
import { collectTicketCorpus, resolveTicketArg } from '../../../shared/sdd/ticket-resolve.ts';
import {
  checkBddCoverage,
  checkUnparsedCoverageRows,
  extractTestCaseNames,
  parseTestCoverage,
} from '../../../shared/sdd/bdd-coverage.ts';
import {
  buildGroupReceipt,
  checkGroupReceipts,
  upsertGroupReceipt,
  type GroupMemberInput,
  type GroupReceiptKind,
} from '../../../shared/sdd/group-receipt.ts';
import { ambiguousIdError, formatFindings } from '../../../cli/cmd/sdd-check/sdd-check.types.ts';
import { checkPhaseReceipts } from '../../../cli/cmd/sdd-check/phase-receipt-check.ts';
import { resolvePhaseContext } from '../../../cli/cmd/sdd-verify/phase-context.ts';
import { runPhaseVerification } from '../../../cli/cmd/sdd-verify/phase-run.ts';
import { checkCompletion } from '../quality-gate.ts';

const PROJECT_ROOT = resolve(import.meta.dirname, '../../..');
const GOLDEN_CONTRACT_PATH = join(import.meta.dirname, 'fixtures/golden-v1/contract.json');
const ADVERSARIAL_CONTRACT_PATH = join(
  import.meta.dirname,
  'fixtures/adversarial-v2/contract.json'
);

type GoldenContract = {
  schema: 'gennady.flow-eval.golden-v1.v1';
  batch: '23A';
  acceptance: 'E-22';
  source: {
    tag: string;
    commit: string;
    expectedExit: number;
    expectedFileCount: number;
  };
  baseline: string;
  warningDelta: { new: BaselineFinding[]; resolved: BaselineFinding[] };
  deferred: string[];
};

type ExpectedOutcome = { code: string; severity: 'error' | 'warn' | 'unknown' };
type AdversarialCase = { id: string; expected: ExpectedOutcome[]; exit: number };
type AdversarialContract = {
  schema: 'gennady.flow-eval.adversarial-v2.v1';
  batch: '23A';
  acceptance: string[];
  cases: AdversarialCase[];
  injection: {
    id: string;
    baselineExit: number;
    injectedExit: number;
    onlyOutcome: ExpectedOutcome;
  };
  deferred: string[];
};

type CorpusRun = {
  exitCode: number;
  payload: SddCheckJsonPayload & {
    readonly summary: { readonly errors: number; readonly warnings: number };
  };
};

const goldenContract = JSON.parse(readFileSync(GOLDEN_CONTRACT_PATH, 'utf8')) as GoldenContract;
const adversarialContract = JSON.parse(
  readFileSync(ADVERSARIAL_CONTRACT_PATH, 'utf8')
) as AdversarialContract;

function runChecked(
  bin: string,
  args: string[],
  cwd: string,
  options: { stdoutFd?: number; allowExit?: readonly number[] } = {}
): ReturnType<typeof spawnSync> {
  const result = spawnSync(bin, args, {
    cwd,
    encoding: 'utf8',
    stdio: options.stdoutFd === undefined ? 'pipe' : ['ignore', options.stdoutFd, 'pipe'],
    env: {
      ...process.env,
      NO_COLOR: '1',
      GIT_AUTHOR_NAME: 'golden-v1-corpus',
      GIT_AUTHOR_EMAIL: 'golden-v1@example.invalid',
      GIT_COMMITTER_NAME: 'golden-v1-corpus',
      GIT_COMMITTER_EMAIL: 'golden-v1@example.invalid',
      GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
    },
  });
  const allowed = options.allowExit ?? [0];
  assert.equal(
    result.error,
    undefined,
    `${bin} ${args.join(' ')} could not start: ${result.error?.message ?? ''}`
  );
  assert.ok(
    allowed.includes(result.status ?? -1),
    `${bin} ${args.join(' ')} exited ${result.status}\n${result.stderr ?? ''}`
  );
  return result;
}

function prepareFrozenV1Corpus(root: string, contract: GoldenContract): void {
  const peeled = runChecked('git', ['rev-parse', `${contract.source.tag}^{}`], PROJECT_ROOT)
    .stdout?.toString()
    .trim();
  assert.equal(
    peeled,
    contract.source.commit,
    `${contract.source.tag} must peel to the frozen E-22 commit; no fetch/rebaseline is allowed`
  );
  const objectType = runChecked('git', ['cat-file', '-t', contract.source.commit], PROJECT_ROOT)
    .stdout?.toString()
    .trim();
  assert.equal(
    objectType,
    'commit',
    `frozen E-22 object is unavailable: ${contract.source.commit}`
  );

  const archive = join(root, 'golden-v1.tar');
  const archiveFd = openSync(archive, 'w');
  try {
    runChecked('git', ['archive', '--format=tar', contract.source.commit], PROJECT_ROOT, {
      stdoutFd: archiveFd,
    });
  } finally {
    closeSync(archiveFd);
  }
  const checkout = join(root, 'checkout');
  mkdirSync(checkout);
  runChecked('tar', ['-xf', archive, '-C', checkout], PROJECT_ROOT);

  // Lazy checks compare against HEAD. Recreate the frozen tree's own unchanged HEAD inside the
  // isolated corpus; otherwise every old requirement looks newly authored and produces false deltas.
  runChecked('git', ['init', '-q'], checkout);
  runChecked('git', ['add', '.'], checkout);
  runChecked(
    'git',
    [
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'commit.gpgSign=false',
      'commit',
      '-q',
      '-m',
      'frozen rc-baseline-1 corpus',
    ],
    checkout
  );
}

function runCurrentSddCheck(
  root: string,
  scratch: string,
  selection: readonly string[] = ['--all', '.']
): CorpusRun {
  const stdoutPath = join(scratch, 'sdd-check.json');
  const stdoutFd = openSync(stdoutPath, 'w');
  let result: ReturnType<typeof spawnSync>;
  try {
    result = runChecked(
      process.execPath,
      [
        '--import',
        import.meta.resolve('tsx'),
        join(PROJECT_ROOT, 'cli/gennady.ts'),
        'sdd-check',
        ...selection,
        '--format',
        'json',
      ],
      root,
      { stdoutFd, allowExit: [0, 1] }
    );
  } finally {
    closeSync(stdoutFd);
  }
  const text = readFileSync(stdoutPath, 'utf8');
  assert.notEqual(text, '', `sdd-check produced no JSON: ${result.stderr ?? ''}`);
  const payload = JSON.parse(text) as CorpusRun['payload'];
  assert.equal(payload.schema, 'gennady.sdd-check.findings.v1');
  return { exitCode: result.status ?? -1, payload };
}

function runCurrentSddCheckText(
  root: string,
  selection: readonly string[]
): { exitCode: number; text: string } {
  const result = runChecked(
    process.execPath,
    [
      '--import',
      import.meta.resolve('tsx'),
      join(PROJECT_ROOT, 'cli/gennady.ts'),
      'sdd-check',
      ...selection,
    ],
    root,
    { allowExit: [0, 1, 2, 4] }
  );
  return { exitCode: result.status ?? -1, text: result.stdout?.toString() ?? '' };
}

function runCurrentGennady(
  root: string,
  args: readonly string[]
): { exitCode: number; text: string } {
  const result = runChecked(
    process.execPath,
    ['--import', import.meta.resolve('tsx'), join(PROJECT_ROOT, 'cli/gennady.ts'), ...args],
    root,
    { allowExit: [0, 1, 2, 4] }
  );
  return { exitCode: result.status ?? -1, text: result.stdout?.toString() ?? '' };
}

function warningMovement(
  baseline: SddCheckBaseline,
  fresh: readonly BaselineFinding[]
): { new: BaselineFinding[]; resolved: BaselineFinding[] } {
  const key = (finding: BaselineFinding): string =>
    `${finding.code}\u0000${finding.file}\u0000${finding.severity}`;
  const baselineWarnings = baseline.findings.filter((finding) => finding.severity === 'warn');
  const freshWarnings = fresh.filter((finding) => finding.severity === 'warn');
  const baselineKeys = new Set(baselineWarnings.map(key));
  const freshKeys = new Set(freshWarnings.map(key));
  return {
    new: freshWarnings.filter((finding) => !baselineKeys.has(key(finding))),
    resolved: baselineWarnings.filter((finding) => !freshKeys.has(key(finding))),
  };
}

function withTempRoot<T>(prefix: string, work: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), prefix));
  try {
    return work(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function expectedCase(id: string): AdversarialCase {
  const found = adversarialContract.cases.find((entry) => entry.id === id);
  assert.ok(found, `adversarial contract has no case ${id}`);
  return found;
}

function outcome(findings: readonly Finding[]): ExpectedOutcome[] {
  return findings.map(({ code, severity }) => ({ code, severity }));
}

function cliOutcome(payload: SddCheckJsonPayload): ExpectedOutcome[] {
  return payload.findings.map(({ code, severity }) => ({
    code,
    severity: severity === 'error' ? 'error' : 'warn',
  }));
}

function cleanTicket(taskId: string, extraSections = ''): string {
  return [
    '<!--SECTION:META-->',
    `- **Task-ID:** ${taskId}`,
    '- **Status:** [x] DONE',
    '- **Dependencies:** None',
    '<!--/SECTION:META-->',
    extraSections,
    '<!--SECTION:EXECUTION_LOG-->',
    '- [x] `2026-09-20T10:00:00Z` DONE',
    '<!--/SECTION:EXECUTION_LOG-->',
  ]
    .filter(Boolean)
    .join('\n');
}

function writeTracker(root: string, rows: readonly { id: string; status?: string }[]): void {
  const dir = join(root, 'specs/demo');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'demo.3-tasks.md'),
    [
      '# demo — Tasks',
      '## 1. Tracker Index',
      '| Task-ID | Title | Dependencies | Status | Reopens |',
      '|---------|-------|--------------|--------|---------|',
      ...rows.map(({ id, status = '[x] DONE' }) => `| ${id} | Fixture | — | ${status} | 0 |`),
    ].join('\n')
  );
}

function cleanScopeSpec(): string {
  return [
    '<!--SECTION:SCOPE_TYPE-->',
    'product',
    '<!--/SECTION:SCOPE_TYPE-->',
    '<!--SECTION:VISION-->',
    'Deterministic receipt acceptance.',
    '<!--/SECTION:VISION-->',
    '<!--SECTION:OVERVIEW-->',
    '```text',
    'actor -> receipt gate',
    '```',
    '_Receipt gate context._',
    '<!--/SECTION:OVERVIEW-->',
    '<!--SECTION:GOLDEN_DX-->',
    'A current receipt closes the group; a stale receipt does not.',
    '<!--/SECTION:GOLDEN_DX-->',
    '<!--SECTION:REQUIREMENTS_AND_CONSTRAINTS-->',
    'No additional product requirements in this mechanical fixture.',
    '<!--/SECTION:REQUIREMENTS_AND_CONSTRAINTS-->',
    '<!--SECTION:USE_CASES-->',
    'Validate one completed ticket group.',
    '<!--/SECTION:USE_CASES-->',
    '<!--SECTION:ARCHITECTURE-->',
    'The spec owns its durable receipts.',
    '<!--/SECTION:ARCHITECTURE-->',
    '<!--SECTION:MODULE_MAP-->',
    'No modules in this acceptance fixture.',
    '<!--/SECTION:MODULE_MAP-->',
    '<!--SECTION:DECISION_LOG-->',
    '<details>',
    '<summary>No decisions</summary>',
    'No durable design decisions.',
    '</details>',
    '<!--/SECTION:DECISION_LOG-->',
  ].join('\n');
}

function ticket(taskId: string, options: { done?: boolean; receiptAware?: boolean } = {}): string {
  return [
    '<!--SECTION:META-->',
    `- **Task-ID:** ${taskId}`,
    `- **Status:** ${options.done ? '[x] DONE' : '[ ] TODO'}`,
    '- **Dependencies:** None',
    '<!--/SECTION:META-->',
    '<!--SECTION:EXECUTION_LOG-->',
    '### Round 1 — 2026-09-20, acceptance corpus',
    ...(options.receiptAware === false ? [] : ['<!--PHASE_RECEIPTS:v1-->']),
    '<!--/SECTION:EXECUTION_LOG-->',
  ].join('\n');
}

function graphRefs(root: string): TicketRef[] {
  const corpus = collectTicketCorpus(root);
  assert.equal(corpus.ok, true, corpus.ok ? '' : corpus.detail);
  return corpus.ok ? corpus.refs : [];
}

function phaseFixture(root: string): { path: string; content: string } {
  mkdirSync(join(root, 'specs/app'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'node_modules/.bin'), { recursive: true });
  writeFileSync(join(root, 'node_modules/.bin/gennady'), '');
  writeFileSync(join(root, 'specs/app/app.spec.md'), '# App acceptance spec\n');
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:fix': 'prettier --write',
        'lint:fix': 'gennady lint --autofix',
        'type-check': 'tsc --noEmit',
        test: 'node --test',
        'test:coverage': 'c8 node --test',
        format: 'prettier --check .',
        lint: 'gennady lint',
        fix: 'npm run format:fix -- . && npm run lint:fix -- .',
      },
    })
  );
  writeFileSync(join(root, 'src/a.ts'), 'export const a = 1;');
  const path = join(root, 'specs/app/app.task.APP-one.md');
  const content = [
    '<!--SECTION:META-->',
    '- **Task-ID:** APP-one',
    '- **Status:** [~] IN_PROGRESS',
    '- **Dependencies:** None',
    '- **Reopens:** 0',
    '<!--/SECTION:META-->',
    '<!--SECTION:PHASES_OVERVIEW-->',
    '| ID | Kind | Deps | Status |',
    '|---|---|---|---|',
    '| P1 | impl | — | [x] |',
    '<!--/SECTION:PHASES_OVERVIEW-->',
    '<!--SECTION:PHASE_P1-->',
    '- **Target Files:**',
    '  - src/a.ts',
    '<!--/SECTION:PHASE_P1-->',
    '<!--SECTION:VERIFICATION-->',
    '<!--PHASE_RECEIPTS:v1-->',
    '<!--COVERAGE_POLICY:v1-->',
    '- **Coverage Policy:** not-applicable',
    '- **Coverage Reason:** receipt acceptance corpus',
    '| Command | Required by | Role |',
    '|---|---|---|',
    '| — | — | extra |',
    '<!--/SECTION:VERIFICATION-->',
    '<!--SECTION:EXECUTION_LOG-->',
    '## Execution Log',
    '### Round 1 — 2026-09-20, acceptance corpus',
    '#### P1',
    '<!--/SECTION:EXECUTION_LOG-->',
  ].join('\n');
  writeFileSync(path, content);
  return { path, content };
}

function groupTicket(taskId: string, rounds: number, aware: boolean): string {
  return [
    '<!--SECTION:META-->',
    `- **Task-ID:** ${taskId}`,
    '- **Status:** [x] DONE',
    '- **Dependencies:** None',
    '- **Reopens:** 0',
    '<!--/SECTION:META-->',
    '<!--SECTION:EXECUTION_LOG-->',
    ...Array.from({ length: rounds }, (_, index) => [
      `### Round ${index + 1} — 2026-09-${20 + index}, acceptance corpus`,
      '#### Round close',
      `- [x] \`2026-09-${20 + index}T10:00:00Z\` DONE`,
    ]).flat(),
    ...(aware ? ['<!--PHASE_RECEIPTS:v1-->'] : []),
    '<!--/SECTION:EXECUTION_LOG-->',
  ].join('\n');
}

function specWithGroupReceipts(specFile: string, members: GroupMemberInput[]): string {
  let spec = '';
  for (const kind of ['audit', 'review'] as GroupReceiptKind[]) {
    const built = buildGroupReceipt(kind, specFile, members, 'fixture-head', 'PASS', 'ts');
    assert.equal(built.ok, true, built.ok ? '' : built.issue);
    if (built.ok) spec = upsertGroupReceipt(spec, built.receipt);
  }
  return spec;
}

describe('Batch 23A acceptance corpora', () => {
  it('E-22: frozen golden-v1 has zero new error identity; expected red exit and warning movement stay explicit', () => {
    assert.equal(goldenContract.schema, 'gennady.flow-eval.golden-v1.v1');
    assert.deepEqual(goldenContract.deferred, ['E-18']);
    withTempRoot('gennady-golden-v1-', (scratch) => {
      prepareFrozenV1Corpus(scratch, goldenContract);
      const checkout = join(scratch, 'checkout');
      const run = runCurrentSddCheck(checkout, scratch);
      const baseline = JSON.parse(
        readFileSync(join(PROJECT_ROOT, goldenContract.baseline), 'utf8')
      ) as SddCheckBaseline;
      assert.equal(baseline.commit, goldenContract.source.commit);
      assert.equal(baseline.tag, goldenContract.source.tag);
      assert.equal(run.exitCode, goldenContract.source.expectedExit);
      assert.equal(run.payload.fileCount, goldenContract.source.expectedFileCount);

      const fresh = dedupeSortFindings(toBaselineFindings(run.payload.findings));
      assert.deepEqual(zeroNewErrorVerdict(baseline, fresh), { ok: true });
      assert.deepEqual(warningMovement(baseline, fresh), goldenContract.warningDelta);
      assert.equal(run.payload.summary.errors, baseline.totals.errors);
      assert.equal(run.payload.summary.warnings, 432);
    });
  });

  it('E-23/V14-3: one Task-ID injection flips exactly one named outcome and exit', () => {
    const contract = expectedCase('task-id-collision');
    withTempRoot('gennady-adversarial-task-id-', (root) => {
      mkdirSync(join(root, 'specs/demo'), { recursive: true });
      const first = join(root, 'specs/demo/demo.task.DEM-one.md');
      const second = join(root, 'specs/demo/demo.task.DEM-two.md');
      writeFileSync(first, ticket('DEM-one'));
      writeFileSync(second, ticket('DEM-two'));

      const baselineFindings = checkTaskGraph(graphRefs(root));
      assert.deepEqual(baselineFindings, []);
      assert.equal(
        formatFindings(baselineFindings, 2).exitCode,
        adversarialContract.injection.baselineExit
      );

      writeFileSync(second, ticket('DEM-one'));
      const injectedFindings = checkTaskGraph(graphRefs(root));
      assert.deepEqual(outcome(injectedFindings), contract.expected);
      assert.deepEqual(outcome(injectedFindings), [adversarialContract.injection.onlyOutcome]);
      assert.equal(formatFindings(injectedFindings, 2).exitCode, contract.exit);
      assert.equal(contract.exit, adversarialContract.injection.injectedExit);

      const validCliRoot = join(root, 'cli-valid');
      mkdirSync(join(validCliRoot, 'specs/demo'), { recursive: true });
      writeFileSync(join(validCliRoot, 'specs/demo/demo.task.DEM-one.md'), cleanTicket('DEM-one'));
      writeFileSync(join(validCliRoot, 'specs/demo/demo.task.DEM-two.md'), cleanTicket('DEM-two'));
      writeTracker(validCliRoot, [{ id: 'DEM-one' }, { id: 'DEM-two' }]);
      const validCli = runCurrentSddCheck(validCliRoot, root);
      assert.equal(validCli.exitCode, 0);
      assert.deepEqual(cliOutcome(validCli.payload), []);

      const invalidCliRoot = join(root, 'cli-invalid');
      mkdirSync(join(invalidCliRoot, 'specs/demo'), { recursive: true });
      writeFileSync(
        join(invalidCliRoot, 'specs/demo/demo.task.DEM-one.md'),
        cleanTicket('DEM-one')
      );
      writeFileSync(
        join(invalidCliRoot, 'specs/demo/demo.task.DEM-copy.md'),
        cleanTicket('DEM-one')
      );
      writeTracker(invalidCliRoot, [{ id: 'DEM-one' }]);
      const invalidCli = runCurrentSddCheck(invalidCliRoot, root);
      assert.equal(invalidCli.exitCode, contract.exit);
      assert.deepEqual(cliOutcome(invalidCli.payload), contract.expected);
    });
  });

  it('E-23: an ambiguous legacy Task-ID is explicit; the unique counterpart resolves', () => {
    const contract = expectedCase('ambiguous-legacy-reference');
    withTempRoot('gennady-adversarial-legacy-ref-', (root) => {
      const dir = join(root, 'tasks/legacy');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'legacy.task-1.md'), ticket('LEG-dup', { receiptAware: false }));
      writeFileSync(join(dir, 'legacy.task-2.md'), ticket('LEG-other', { receiptAware: false }));
      const valid = resolveTicketArg('LEG-dup', root);
      assert.equal(valid.ok, true);
      const validCli = runCurrentSddCheckText(root, ['--task', 'LEG-dup']);
      assert.equal(validCli.exitCode, 0, validCli.text);
      assert.match(validCli.text, /✅ clean/);

      writeFileSync(join(dir, 'legacy.task-2.md'), ticket('LEG-dup', { receiptAware: false }));
      const ambiguous = resolveTicketArg('LEG-dup', root);
      assert.equal(ambiguous.ok, false);
      assert.equal(ambiguous.ok ? '' : ambiguous.reason, 'ambiguous-id');
      if (ambiguous.ok || ambiguous.reason !== 'ambiguous-id') return;
      const result = ambiguousIdError(ambiguous.id, ambiguous.matches, root);
      assert.equal(result.exitCode, contract.exit);
      assert.match(result.text, new RegExp(contract.expected[0]?.code ?? 'unreachable'));
      assert.match(result.text, /legacy\.task-1\.md/);
      assert.match(result.text, /legacy\.task-2\.md/);
      const invalidCli = runCurrentSddCheckText(root, ['--task', 'LEG-dup']);
      assert.equal(invalidCli.exitCode, contract.exit);
      assert.match(invalidCli.text, new RegExp(contract.expected[0]?.code ?? 'unreachable'));
    });
  });

  it('E-23: malformed coverage is fail-closed on V2, valid is clean, equivalent V1 stays warn-only', () => {
    const contract = expectedCase('malformed-coverage-row');
    withTempRoot('gennady-adversarial-coverage-row-', (root) => {
      const malformed = '- All scenarios → Deferred Test Ownership: DEM-other';
      const valid = '- scenario → `case.test.ts` :: `does the thing`';
      writeFileSync(join(root, 'malformed.md'), malformed);
      writeFileSync(join(root, 'valid.md'), valid);

      const v2 = checkUnparsedCoverageRows(
        'specs/demo/demo.task.DEM-row.md',
        readFileSync(join(root, 'malformed.md'), 'utf8'),
        'v2'
      );
      assert.deepEqual(outcome(v2), contract.expected);
      assert.equal(formatFindings(v2, 1).exitCode, contract.exit);
      assert.deepEqual(
        checkUnparsedCoverageRows('specs/demo/demo.task.DEM-row.md', valid, 'v2'),
        []
      );

      const legacy = checkUnparsedCoverageRows('tasks/demo/demo.task-1.md', malformed, 'v1');
      assert.deepEqual(outcome(legacy), [
        { code: 'SDD_BDD_COVERAGE_ROW_UNPARSED', severity: 'warn' },
      ]);
      assert.equal(formatFindings(legacy, 1).exitCode, 0);

      const cliRoot = join(root, 'cli');
      mkdirSync(join(cliRoot, 'specs/demo'), { recursive: true });
      const ticketPath = 'specs/demo/demo.task.DEM-row.md';
      const coverage = (row: string): string =>
        cleanTicket(
          'DEM-row',
          ['<!--SECTION:TEST_COVERAGE-->', row, '<!--/SECTION:TEST_COVERAGE-->'].join('\n')
        );
      writeFileSync(join(cliRoot, 'case.test.ts'), "it('does the thing', () => {});");
      writeFileSync(join(cliRoot, ticketPath), coverage(valid));
      const validCli = runCurrentSddCheck(cliRoot, root, ['--task', ticketPath]);
      assert.equal(validCli.exitCode, 0, JSON.stringify(validCli.payload.findings, null, 2));
      assert.deepEqual(cliOutcome(validCli.payload), []);
      writeFileSync(join(cliRoot, ticketPath), coverage(malformed));
      const invalidCli = runCurrentSddCheck(cliRoot, root, ['--task', ticketPath]);
      assert.equal(invalidCli.exitCode, contract.exit);
      assert.deepEqual(cliOutcome(invalidCli.payload), contract.expected);

      const legacyPath = 'tasks/demo/demo.task-1.md';
      mkdirSync(join(cliRoot, 'tasks/demo'), { recursive: true });
      writeFileSync(join(cliRoot, legacyPath), coverage(malformed));
      const legacyCli = runCurrentSddCheck(cliRoot, root, ['--task', legacyPath]);
      assert.equal(legacyCli.exitCode, 0);
      assert.deepEqual(cliOutcome(legacyCli.payload), [
        { code: 'SDD_BDD_COVERAGE_ROW_UNPARSED', severity: 'warn' },
      ]);
    });
  });

  it('E-23: skipped/todo tests cannot close V2 coverage; active counterpart closes; V1 stays warn-only', () => {
    const contract = expectedCase('inactive-skip-todo-test');
    withTempRoot('gennady-adversarial-inactive-test-', (root) => {
      const row = '- scenario → `case.test.ts` :: `does the thing`';
      const rows = parseTestCoverage(row);
      const active = extractTestCaseNames("it('does the thing', () => {});");
      const skipped = extractTestCaseNames("it.skip('does the thing', () => {});");
      const todo = extractTestCaseNames("it.todo('does the thing');");
      writeFileSync(join(root, 'active.test.ts'), "it('does the thing', () => {});");
      writeFileSync(join(root, 'skipped.test.ts'), "it.skip('does the thing', () => {});");
      writeFileSync(join(root, 'todo.test.ts'), "it.todo('does the thing');");

      assert.deepEqual(
        checkBddCoverage(
          'specs/demo/demo.task.DEM-test.md',
          rows,
          new Map([['case.test.ts', active]]),
          'v2'
        ),
        []
      );
      const v2 = [
        ...checkBddCoverage(
          'specs/demo/demo.task.DEM-test.md',
          rows,
          new Map([['case.test.ts', skipped]]),
          'v2'
        ),
        ...checkBddCoverage(
          'specs/demo/demo.task.DEM-test.md',
          rows,
          new Map([['case.test.ts', todo]]),
          'v2'
        ),
      ];
      assert.deepEqual(outcome(v2), contract.expected);
      assert.equal(formatFindings(v2, 1).exitCode, contract.exit);

      const legacy = checkBddCoverage(
        'tasks/demo/demo.task-1.md',
        rows,
        new Map([['case.test.ts', skipped]]),
        'v1'
      );
      assert.deepEqual(outcome(legacy), [{ code: 'SDD_BDD_SCENARIO_UNTESTED', severity: 'warn' }]);
      assert.equal(formatFindings(legacy, 1).exitCode, 0);

      const cliRoot = join(root, 'cli');
      mkdirSync(join(cliRoot, 'specs/demo'), { recursive: true });
      const ticketPath = 'specs/demo/demo.task.DEM-test.md';
      const coverage = [
        '<!--SECTION:TEST_COVERAGE-->',
        '- skipped scenario → `skip.test.ts` :: `skipped case`',
        '- todo scenario → `todo.test.ts` :: `todo case`',
        '<!--/SECTION:TEST_COVERAGE-->',
      ].join('\n');
      writeFileSync(join(cliRoot, ticketPath), cleanTicket('DEM-test', coverage));
      writeFileSync(join(cliRoot, 'skip.test.ts'), "it('skipped case', () => {});");
      writeFileSync(join(cliRoot, 'todo.test.ts'), "it('todo case', () => {});");
      const validCli = runCurrentSddCheck(cliRoot, root, ['--task', ticketPath]);
      assert.equal(validCli.exitCode, 0);
      assert.deepEqual(cliOutcome(validCli.payload), []);
      writeFileSync(join(cliRoot, 'skip.test.ts'), "it.skip('skipped case', () => {});");
      writeFileSync(join(cliRoot, 'todo.test.ts'), "it.todo('todo case');");
      const invalidCli = runCurrentSddCheck(cliRoot, root, ['--task', ticketPath]);
      assert.equal(invalidCli.exitCode, contract.exit);
      assert.deepEqual(cliOutcome(invalidCli.payload), contract.expected);

      const legacyPath = 'tasks/demo/demo.task-1.md';
      mkdirSync(join(cliRoot, 'tasks/demo'), { recursive: true });
      writeFileSync(join(cliRoot, legacyPath), cleanTicket('DEM-legacy', coverage));
      const legacyCli = runCurrentSddCheck(cliRoot, root, ['--task', legacyPath]);
      assert.equal(legacyCli.exitCode, 0);
      assert.deepEqual(cliOutcome(legacyCli.payload), [
        { code: 'SDD_BDD_SCENARIO_UNTESTED', severity: 'warn' },
        { code: 'SDD_BDD_SCENARIO_UNTESTED', severity: 'warn' },
      ]);
    });
  });

  it('E-23: stale phase receipt fails closed; current receipt and unmarked V1 counterpart stay clean', async () => {
    const contract = expectedCase('stale-phase-receipt');
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'gennady-adversarial-phase-receipt-')));
    try {
      const fixtureRoot = join(root, 'fixture');
      mkdirSync(fixtureRoot);
      const fixture = phaseFixture(fixtureRoot);
      const context = resolvePhaseContext('specs/app/app.task.APP-one.md', 'P1', fixtureRoot);
      assert.equal(context.ok, true, context.ok ? '' : context.message);
      if (!context.ok) return;
      const verified = await runPhaseVerification(
        fixtureRoot,
        context.context,
        (command, args) => ({ exitCode: 0, output: `${command} ${args.join(' ')}` }),
        (command) => ({ exitCode: 0, output: command })
      );
      assert.equal(verified.ok, true, verified.ok ? '' : verified.message);
      const current = readFileSync(fixture.path, 'utf8');
      assert.deepEqual(checkPhaseReceipts(fixture.path, fixture.path, current, fixtureRoot), []);

      const stale = current.replace('| P1 | impl | — | [x] |', '| P1 | test | — | [x] |');
      writeFileSync(fixture.path, stale);
      const findings = checkPhaseReceipts(fixture.path, fixture.path, stale, fixtureRoot);
      assert.deepEqual(outcome(findings), contract.expected);
      assert.equal(formatFindings(findings, 1).exitCode, contract.exit);

      const legacy = fixture.content.replace('<!--PHASE_RECEIPTS:v1-->\n', '');
      writeFileSync(fixture.path, legacy);
      assert.deepEqual(checkPhaseReceipts(fixture.path, fixture.path, legacy, fixtureRoot), []);

      const ticketPath = 'specs/app/app.task.APP-one.md';
      writeFileSync(fixture.path, current);
      const validCli = runCurrentSddCheck(fixtureRoot, root, ['--task', ticketPath]);
      assert.equal(validCli.exitCode, 0, JSON.stringify(validCli.payload.findings, null, 2));
      assert.deepEqual(cliOutcome(validCli.payload), []);
      writeFileSync(fixture.path, stale);
      const invalidCli = runCurrentSddCheck(fixtureRoot, root, ['--task', ticketPath]);
      assert.equal(invalidCli.exitCode, contract.exit);
      assert.deepEqual(cliOutcome(invalidCli.payload), contract.expected);

      const legacyPath = 'tasks/app/app.task-1.md';
      mkdirSync(join(fixtureRoot, 'tasks/app'), { recursive: true });
      writeFileSync(join(fixtureRoot, legacyPath), legacy);
      const legacyCli = runCurrentSddCheck(fixtureRoot, root, ['--task', legacyPath]);
      assert.equal(legacyCli.exitCode, 0);
      assert.deepEqual(cliOutcome(legacyCli.payload), []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('E-23: stale group receipt stays explicit warn; current and unmarked V1 counterparts stay clean', () => {
    const contract = expectedCase('stale-group-receipt');
    withTempRoot('gennady-adversarial-group-receipt-', (root) => {
      const specFile = 'specs/demo/demo.spec.md';
      const memberA: GroupMemberInput = {
        file: join(root, 'specs/demo/demo.task.DEM-a.md'),
        content: groupTicket('DEM-a', 1, true),
      };
      const members = [memberA];
      const specContent = specWithGroupReceipts(specFile, members);
      assert.deepEqual(checkGroupReceipts([{ specFile, specContent, members }]), []);

      const staleMembers = [{ ...memberA, content: groupTicket('DEM-a', 2, true) }];
      const findings = checkGroupReceipts([{ specFile, specContent, members: staleMembers }]);
      assert.deepEqual(outcome(findings), contract.expected);
      assert.equal(formatFindings(findings, 1).exitCode, contract.exit);
      assert.ok(findings.every((finding) => /stale/.test(finding.message)));

      const legacyMembers = members.map((member) => ({
        ...member,
        content: member.content.replace('<!--PHASE_RECEIPTS:v1-->\n', ''),
      }));
      assert.deepEqual(checkGroupReceipts([{ specFile, specContent, members: legacyMembers }]), []);

      mkdirSync(join(root, 'specs/demo'), { recursive: true });
      writeFileSync(join(root, specFile), `${cleanScopeSpec()}\n${specContent}`);
      writeFileSync(memberA.file, memberA.content);
      writeTracker(root, [{ id: 'DEM-a' }]);
      writeFileSync(join(root, 'artifact.txt'), 'provisioned baseline\n');
      runChecked('git', ['init', '-q'], root);
      runChecked('git', ['add', '.'], root);
      runChecked(
        'git',
        [
          '-c',
          'core.hooksPath=/dev/null',
          '-c',
          'commit.gpgSign=false',
          'commit',
          '-q',
          '-m',
          'provision acceptance fixture',
        ],
        root
      );
      writeFileSync(join(root, 'artifact.txt'), 'produced\n');
      const validCli = runCurrentSddCheck(root, root);
      assert.equal(validCli.exitCode, 0, JSON.stringify(validCli.payload.findings, null, 2));
      assert.deepEqual(cliOutcome(validCli.payload), []);
      const complete = checkCompletion(root, {
        artifact: 'artifact.txt',
        ticket: 'specs/demo/demo.task.DEM-a.md',
        spec: specFile,
      });
      assert.equal(complete.pass, true, complete.detail);

      writeFileSync(memberA.file, staleMembers[0]?.content ?? '');
      const invalidCli = runCurrentSddCheck(root, root);
      assert.equal(invalidCli.exitCode, contract.exit);
      assert.deepEqual(cliOutcome(invalidCli.payload), contract.expected);
      const unverified = checkCompletion(root, {
        artifact: 'artifact.txt',
        ticket: 'specs/demo/demo.task.DEM-a.md',
        spec: specFile,
      });
      assert.equal(unverified.rule, 'R-COMPLETE');
      assert.equal(unverified.pass, false);
      assert.match(unverified.detail, /receipt is stale/);

      writeFileSync(memberA.file, legacyMembers[0]?.content ?? '');
      const legacyCli = runCurrentSddCheck(root, root);
      assert.equal(legacyCli.exitCode, 0);
      assert.deepEqual(cliOutcome(legacyCli.payload), []);
    });
  });

  it('V14-2c/E-17: pending survives a budget boundary and blocks group close until resolved', () => {
    withTempRoot('gennady-pending-group-', (root) => {
      const specFile = 'specs/demo/demo.spec.md';
      const memberFile = join(root, 'specs/demo/demo.task.DEM-a.md');
      mkdirSync(join(root, 'specs/demo'), { recursive: true });
      const pending = `${groupTicket('DEM-a', 1, true)}\n${[
        '<!--SECTION:DECISION_LOG-->',
        'DEM-DL-0 2026-09-22 — retry cap 3 (почему: spec silent) [verdict: pending-operator]',
        '<!--/SECTION:DECISION_LOG-->',
      ].join('\n')}`;
      writeFileSync(join(root, specFile), cleanScopeSpec());
      writeFileSync(memberFile, pending);
      writeTracker(root, [{ id: 'DEM-a' }]);

      const audit = runCurrentGennady(root, ['sdd-log', 'DEM-a', 'audit-receipt', 'PASS']);
      assert.equal(audit.exitCode, 0, audit.text);
      const review = runCurrentGennady(root, ['sdd-log', 'DEM-a', 'review-receipt', 'PASS']);
      assert.equal(review.exitCode, 0, review.text);
      const receiptsBeforeVerdict = readFileSync(join(root, specFile), 'utf8');
      assert.match(receiptsBeforeVerdict, /SDD_AUDIT_RECEIPT/);
      assert.match(receiptsBeforeVerdict, /SDD_REVIEW_RECEIPT/);

      const before = runCurrentSddCheck(root, root);
      assert.equal(before.exitCode, 1);
      assert.equal(
        before.payload.findings.filter(
          (finding) => finding.code === 'SDD_DEVIATION_VERDICT_MISSING'
        ).length,
        1
      );

      const verdict = runCurrentGennady(root, [
        'sdd-log',
        'DEM-a',
        'deviation-verdict',
        'DEM-DL-0',
        'accepted',
      ]);
      assert.equal(verdict.exitCode, 0, verdict.text);
      assert.match(readFileSync(memberFile, 'utf8'), /DEM-DL-0[^\n]+\[verdict: accepted\]/);
      const after = runCurrentSddCheck(root, root);
      assert.equal(after.exitCode, 0, JSON.stringify(after.payload.findings, null, 2));
      assert.deepEqual(cliOutcome(after.payload), []);
    });
  });

  it('23A contract remains frozen while current traceability closes E-17 and keeps E-18 deferred', () => {
    assert.deepEqual(adversarialContract.acceptance, ['E-23', 'V14-3']);
    assert.deepEqual(adversarialContract.deferred, ['E-18']);
    assert.deepEqual(
      adversarialContract.cases.map(({ id }) => id),
      [
        'task-id-collision',
        'ambiguous-legacy-reference',
        'malformed-coverage-row',
        'inactive-skip-todo-test',
        'stale-phase-receipt',
        'stale-group-receipt',
      ]
    );
  });
});
