// @file: Technical replan preservation, exact delta, dependency and competing-writer controls.
// @spec: SHARED
// @consumers: CI

import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { prepareTechnicalReplan, technicalReplanBase } from '../technical-replan.ts';
import { extractSection } from '../section.ts';
import { parsePhaseDetail, parsePhasesOverview } from '../ticket.ts';
import { ticketRef } from '../check.ts';
import { withSddReplanMutation, withSddTicketMutation } from '../verify/sdd-attempt-journal.ts';
import { cleanTestChildEnv, runCli } from '../../../cli/__tests__/tool-behavior/run-cli.ts';

const root = mkdtempSync(join(tmpdir(), 'gennady-replan-test-'));
after(() => rmSync(root, { recursive: true, force: true }));
mkdirSync(join(root, 'src'), { recursive: true });
writeFileSync(join(root, 'src/core.ts'), 'export const value = 1;');
symlinkSync(join(root, 'src'), join(root, 'alias'));
const file = join(root, 'specs/core/core.task.COR-work.md');

/** @purpose Small declaration-complete input; the transition must preserve every untouched byte. */
function replanTicket(): string {
  return [
    '<!--SECTION:META-->',
    '- **Task-ID:** COR-work',
    '- **Dependencies:** none',
    '- **Purpose:** Preserve negative behavior',
    '<!--/SECTION:META-->',
    '<!--SECTION:PHASES_OVERVIEW-->',
    '| ID | Kind | Deps | Status |',
    '|---|---|---|---|',
    '| P1 | code | — | [ ] |',
    '| P2 | test | P1 | [ ] |',
    '<!--/SECTION:PHASES_OVERVIEW-->',
    ...['P1', 'P2'].flatMap((id) => [
      `<!--SECTION:PHASE_${id}-->`,
      '- **Objective:** Preserve the declared behavior',
      '- **Rules:**',
      '- **Target Files:**',
      `  - \`src/${id === 'P1' ? 'core.ts' : 'core.test.ts'}\``,
      '- **Inputs:** none',
      '- **Exit:** All original checks pass',
      `<!--/SECTION:PHASE_${id}-->`,
    ]),
    '<!--SECTION:BDD-->',
    'Reject invalid input without changing the original value.',
    '<!--/SECTION:BDD-->',
    '<!--SECTION:VERIFICATION-->',
    '| Command | Required by | Role |',
    '|---|---|---|',
    '| npm test | REQ-1 | tests |',
    '<!--/SECTION:VERIFICATION-->',
    '<!--SECTION:TEST_COVERAGE-->',
    '- Scenario invalid → `src/core.test.ts` :: `invalid input`',
    '<!--/SECTION:TEST_COVERAGE-->',
    '<!--SECTION:EXECUTION_LOG-->',
    '### Round 1 — 2026-10-26, initial',
    '#### P1',
    '- [ ] `<ts>` DONE',
    '#### P2',
    '- [ ] `<ts>` DONE',
    '#### Round close',
    '- [ ] `<ts>` DONE',
    '<!--/SECTION:EXECUTION_LOG-->',
    '<!--SECTION:DECISION_LOG-->',
    '<!--/SECTION:DECISION_LOG-->',
  ].join('\n');
}

const payload = (content: string) => ({
  id: 'RP-helper',
  base: technicalReplanBase(content),
  reason: 'Extract a shared normalizer without changing behavior',
  evidence: 'The existing caller and invalid-input test require the same normalization',
  addTargets: ['src/normalize.ts'],
  dependencies: [],
});
const prepare = (content = replanTicket(), raw: unknown = payload(content), extra: string[] = []) =>
  prepareTechnicalReplan({
    root,
    ticketFile: file,
    content,
    phaseId: 'P1',
    payload: raw,
    corpus: [
      { ...ticketRef(file, content), content },
      ...extra.map((text, i) => ({
        ...ticketRef(join(root, `specs/other${i}.task.COR-other.md`), text),
        content: text,
      })),
    ],
    timestamp: '2026-10-26T12:00:00Z',
  });

test('adds an exact helper, records the reason/delta, preserves product, coverage, rules and earlier history', () => {
  const content = replanTicket();
  const result = prepare();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  for (const name of ['META', 'BDD', 'VERIFICATION', 'TEST_COVERAGE', 'DECISION_LOG', 'PHASE_P2'])
    assert.deepEqual(extractSection(result.content, name), extractSection(content, name));
  const body = extractSection(result.content, 'PHASE_P1');
  assert.equal(body.status, 'ok');
  if (body.status === 'ok')
    assert.deepEqual(parsePhaseDetail(body.content).targetFiles, [
      'src/core.ts',
      'src/normalize.ts',
    ]);
  assert.match(result.content, /technical-replan RP-helper/);
  assert.match(result.content, /reason=Extract a shared normalizer/);
  assert.equal(prepare(result.content, payload(content)).ok, true, 'lost-ack replay');
  const replay = prepare(result.content, payload(content));
  assert.ok(replay.ok && !replay.created && replay.content === result.content);
});

test('rejects stale, forged, malformed and weakening deltas before producing candidate bytes', () => {
  const content = replanTicket();
  for (const raw of [
    { ...payload(content), base: `sha256:${'0'.repeat(64)}` },
    { ...payload(content), kind: 'doc' },
    { ...payload(content), removeTargets: ['src/core.ts'] },
    { ...payload(content), verification: [] },
    { ...payload(content), addTargets: ['../escape.ts'] },
    { ...payload(content), addTargets: ['src/../escape.ts'] },
    { ...payload(content), addTargets: ['src/.secret'] },
    { ...payload(content), addTargets: ['specs/core.spec.md'] },
    { ...payload(content), addTargets: ['alias/normalize.ts'] },
    { ...payload(content), addTargets: ['other/normalize.ts'] },
    { ...payload(content), addTargets: ['src/core.ts'] },
    { ...payload(content), addTargets: ['src/x.ts', 'src/x.ts'] },
    { ...payload(content), dependencies: ['P1'] },
    { ...payload(content), dependencies: ['P2'] },
    { ...payload(content), dependencies: ['P99'] },
    { ...payload(content), reason: 'reason\n### forged' },
    { ...payload(content), evidence: '<!--SECTION:META-->' },
  ]) {
    const result = prepare(content, raw);
    assert.equal(result.ok, false, JSON.stringify(raw));
    assert.equal('content' in result, false);
  }
});

test('does not rewrite completed phases, acknowledge a changed replay or replay an obsolete resulting plan', () => {
  const completed = replanTicket().replace('| P1 | code | — | [ ] |', '| P1 | code | — | [x] |');
  assert.equal(prepare(completed, payload(completed)).ok, false);
  const original = replanTicket();
  const result = prepare(original);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(
    prepare(result.content, { ...payload(original), reason: 'Changed reason' }).ok,
    false
  );
  assert.equal(
    prepare(result.content.replace('All original checks pass', 'Skip checks'), payload(original))
      .ok,
    false
  );
  const replay = prepare(
    result.content.replace('#### P1', '#### P1\n- [x] later fact'),
    payload(original)
  );
  assert.ok(replay.ok && !replay.created, 'unrelated new execution facts preserve retry');
});

test('allows ordered shared writers but rejects an unordered foreign claim', () => {
  const foreign = replanTicket()
    .replace('COR-work', 'COR-other')
    .replace('src/core.ts', 'src/normalize.ts');
  const result = prepare(replanTicket(), payload(replanTicket()), [foreign]);
  assert.ok(!result.ok && /unordered writer/.test(result.detail));
  const ordered = foreign.replace('**Dependencies:** none', '**Dependencies:** COR-work');
  assert.equal(prepare(replanTicket(), payload(replanTicket()), [ordered]).ok, true);
});

test('lost-ack replay rechecks the current corpus, ignores fenced/comment examples and proves delta postconditions', () => {
  const original = replanTicket();
  const result = prepare(original);
  assert.ok(result.ok);
  if (!result.ok) return;
  const fact = result.content
    .split('\n')
    .find((line) => line.startsWith('- [x] technical-replan'))!;
  const foreign = original
    .replace('COR-work', 'COR-other')
    .replace('src/core.ts', 'src/normalize.ts');
  const conflict = prepare(result.content, payload(original), [foreign]);
  assert.ok(!conflict.ok && /unordered writer/.test(conflict.detail));
  for (const hidden of [`\`\`\`md\n${fact}\n\`\`\``, `<!-- example\n${fact}\n-->`]) {
    const replay = prepare(result.content.replace(fact, hidden), payload(original));
    assert.equal(replay.ok, false, 'an example is not a persisted transition');
  }
  const withoutHelper = result.content.replace('  - `src/normalize.ts`\n', '');
  const strippedPlan = withoutHelper.replace(
    /(<!--SECTION:EXECUTION_LOG-->)[\s\S]*?(<!--\/SECTION:EXECUTION_LOG-->)/,
    '$1\n$2'
  );
  const cells = fact.split(' ');
  cells[5] = technicalReplanBase(strippedPlan);
  const forged = withoutHelper.replace(fact, cells.join(' '));
  const absent = prepare(forged, payload(original));
  assert.ok(!absent.ok && /postconditions/.test(absent.detail));
  const reordered = Object.fromEntries(Object.entries(payload(original)).reverse());
  assert.equal(
    prepare(result.content, reordered).ok,
    true,
    'JSON key order is not payload meaning'
  );
  const openFence = original.replace(
    '<!--/SECTION:EXECUTION_LOG-->',
    '```md\n<!--/SECTION:EXECUTION_LOG-->'
  );
  assert.equal(prepare(openFence, payload(openFence)).ok, false);
  for (const value of [original, result.content]) {
    const hidden = value.replace(
      '<!--/SECTION:EXECUTION_LOG-->',
      'note <!-- unclosed inline comment\n<!--/SECTION:EXECUTION_LOG-->'
    );
    assert.equal(
      prepare(hidden, value === original ? payload(hidden) : payload(original)).ok,
      false,
      'fresh and replay must refuse a hidden append point'
    );
  }
});

test('supports a dependency correction without deleting phases or detaching explicit inputs', () => {
  const content = replanTicket();
  const raw = { ...payload(content), addTargets: [], dependencies: [] };
  const input = {
    root,
    ticketFile: file,
    content,
    phaseId: 'P2',
    payload: raw,
    corpus: [{ ...ticketRef(file, content), content }],
    timestamp: '2026-10-26T12:00:00Z',
  };
  const result = prepareTechnicalReplan(input);
  assert.ok(result.ok);
  if (!result.ok) return;
  const overview = extractSection(result.content, 'PHASES_OVERVIEW');
  assert.ok(
    overview.status === 'ok' && parsePhasesOverview(overview.content)[1]?.deps.length === 0
  );
  const explicit = content.replaceAll('**Inputs:** none', '**Inputs:** P1 handoff');
  assert.equal(
    prepareTechnicalReplan({
      ...input,
      content: explicit,
      payload: { ...raw, base: technicalReplanBase(explicit) },
    }).ok,
    false
  );
});

test('preserves CRLF and canonical dependencies with reordered columns', () => {
  const content = replanTicket()
    .replace('| ID | Kind | Deps | Status |', '| Kind | Status | ID | Deps |')
    .replace('| P1 | code | — | [ ] |', '| code | [ ] | P1 | — |')
    .replace('| P2 | test | P1 | [ ] |', '| test | [ ] | P2 | P1 |')
    .replaceAll('\n', '\r\n');
  const result = prepare(content, payload(content));
  assert.ok(result.ok);
  if (result.ok)
    assert.equal(
      result.content.includes('\n') && !result.content.replaceAll('\r\n', '').includes('\n'),
      true
    );
});

/** @purpose Pending test work with two independent mapped files; no requirement is rewritten. */
function reallocationTicket(): string {
  return replanTicket()
    .replace('  - `src/core.test.ts`', '  - `src/core.test.ts`\n  - `src/recovery.test.ts`')
    .replace(
      '<!--/SECTION:TEST_COVERAGE-->',
      '- Scenario recovery → `src/recovery.test.ts` :: `recovery path`\n<!--/SECTION:TEST_COVERAGE-->'
    );
}

function splitPayload(content: string) {
  return {
    ...payload(content),
    addTargets: [],
    dependencies: ['P3'],
    insertPhase: {
      id: 'P3',
      objective: 'Isolate the existing invalid-input test implementation',
      targets: ['src/core.test.ts'],
      dependencies: ['P1'],
    },
    moveTests: ['src/core.test.ts'],
  };
}

function splitPrepare(content = reallocationTicket(), value: unknown = splitPayload(content)) {
  return prepareTechnicalReplan({
    root,
    ticketFile: file,
    content,
    phaseId: 'P2',
    payload: value,
    corpus: [{ ...ticketRef(file, content), content }],
    timestamp: '2026-10-26T12:00:00Z',
  });
}

test('inserts a dependency-ordered phase, transfers exact test ownership and preserves scenario/check bytes and old log facts', () => {
  const original = reallocationTicket();
  const result = splitPrepare(original);
  assert.ok(result.ok, JSON.stringify(result));
  if (!result.ok) return;
  for (const name of ['META', 'BDD', 'VERIFICATION', 'TEST_COVERAGE', 'PHASE_P1', 'DECISION_LOG'])
    assert.deepEqual(extractSection(result.content, name), extractSection(original, name));
  const overview = extractSection(result.content, 'PHASES_OVERVIEW');
  assert.ok(overview.status === 'ok');
  if (overview.status === 'ok')
    assert.deepEqual(
      parsePhasesOverview(overview.content).map((p) => [p.id, p.kind, p.deps]),
      [
        ['P1', 'code', []],
        ['P3', 'test', ['P1']],
        ['P2', 'test', ['P3']],
      ]
    );
  const inserted = extractSection(result.content, 'PHASE_P3');
  const source = extractSection(result.content, 'PHASE_P2');
  assert.ok(inserted.status === 'ok' && source.status === 'ok');
  if (inserted.status !== 'ok' || source.status !== 'ok') return;
  assert.deepEqual(parsePhaseDetail(inserted.content).targetFiles, ['src/core.test.ts']);
  assert.deepEqual(parsePhaseDetail(source.content).targetFiles, ['src/recovery.test.ts']);
  assert.equal(parsePhaseDetail(inserted.content).exit, parsePhaseDetail(source.content).exit);
  const log = extractSection(result.content, 'EXECUTION_LOG');
  assert.ok(log.status === 'ok' && log.content.indexOf('#### P3') < log.content.indexOf('#### P2'));
  assert.doesNotMatch(result.content, /\[x\].*DONE/);
  const replay = splitPrepare(result.content, splitPayload(original));
  assert.ok(
    replay.ok && !replay.created && replay.content === result.content,
    JSON.stringify(replay)
  );
  const provider = /#### P3\n[\s\S]*?(?=#### P2)/.exec(result.content)?.[0];
  assert.ok(provider);
  for (const tampered of [
    result.content.replace(provider, ''),
    result.content.replace(provider, '').replace('#### P2\n', `#### P2\n${provider}`),
    result.content.replace(provider, `${provider}${provider}`),
    result.content.replace(provider, `<!--\n${provider}-->\n`),
  ])
    assert.equal(
      splitPrepare(tampered, splitPayload(original)).ok,
      false,
      'log structure is a replay postcondition too'
    );
});

test('refuses disappearing scenarios, weaker/new kinds, duplicate or completed phase IDs, cycles and detached prerequisites', () => {
  const original = reallocationTicket();
  const good = splitPayload(original);
  for (const value of [
    { ...good, dependencies: ['P1'] },
    { ...good, insertPhase: { ...good.insertPhase, id: 'P1' } },
    { ...good, insertPhase: { ...good.insertPhase, kind: 'doc' } },
    { ...good, insertPhase: { ...good.insertPhase, dependencies: ['P2'] } },
    { ...good, insertPhase: { ...good.insertPhase, dependencies: [] } },
    { ...good, insertPhase: { ...good.insertPhase, targets: ['../escape.ts'] } },
    { ...good, insertPhase: { ...good.insertPhase, targets: [] } },
    {
      ...good,
      insertPhase: { ...good.insertPhase, targets: ['src/core.ts'] },
      moveTests: ['src/core.ts'],
    },
    { ...good, moveTests: ['src/recovery.test.ts'] },
    {
      ...good,
      moveTests: ['src/core.test.ts', 'src/recovery.test.ts'],
      insertPhase: { ...good.insertPhase, targets: ['src/core.test.ts', 'src/recovery.test.ts'] },
    },
    { ...good, moveTests: ['src/core.test.ts', 'src/core.test.ts'] },
    { ...good, verification: [] },
  ]) {
    const result = splitPrepare(original, value);
    assert.equal(result.ok, false, JSON.stringify(value));
    assert.equal('content' in result, false);
  }
  for (const content of [
    original.replace('| P2 | test | P1 | [ ] |', '| P2 | test | P1 | [x] |'),
    original.replace(
      '<!--/SECTION:TEST_COVERAGE-->',
      '- Scenario broken → no executable mapping\n<!--/SECTION:TEST_COVERAGE-->'
    ),
    original.replace('#### P2', '#### P3\n#### P2'),
    original.replace('#### P2', '<!--\n#### P2\n-->'),
    original + '\n<!--SECTION:PHASE_P3-->\n<!--/SECTION:PHASE_P3-->',
  ])
    assert.equal(splitPrepare(content, splitPayload(content)).ok, false, content);
});

test('resolves existing basename coverage by the shared ownership matcher and refuses ambiguous collisions', () => {
  const original = reallocationTicket()
    .replace('- Scenario invalid → `src/core.test.ts`', '- Scenario invalid → `core.test.ts`')
    .replace(
      '- Scenario recovery → `src/recovery.test.ts`',
      '- Scenario recovery → `recovery.test.ts`'
    );
  assert.ok(splitPrepare(original, splitPayload(original)).ok);
  const collision = original.replace(
    '  - `src/recovery.test.ts`',
    '  - `src/recovery.test.ts`\n  - `src/other/core.test.ts`'
  );
  const result = splitPrepare(collision, splitPayload(collision));
  assert.ok(
    !result.ok && /ambiguous scenario ownership/.test(result.detail),
    JSON.stringify(result)
  );
});

test('actual CLI persists before redispatch, consumes only success, survives restart, and rejects stale or unsafe requests byte-exactly', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gennady-replan-cli-'));
  try {
    execFileSync('git', ['init', '-q', dir], { env: cleanTestChildEnv(process.env) });
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'specs/core'), { recursive: true });
    mkdirSync(join(dir, '.claude/tmp'), { recursive: true });
    const path = 'specs/core/core.task.COR-work.md';
    const scratch = '.claude/tmp/replan.json';
    const content = replanTicket();
    writeFileSync(join(dir, path), content);
    writeFileSync(join(dir, 'src/core.ts'), 'export const value = 1;');
    const invoke = (value: unknown) => {
      writeFileSync(join(dir, scratch), JSON.stringify(value));
      return runCli(['sdd-log', path, 'replan', '--phase', 'P1', '--payload-file', scratch], dir);
    };
    const initial = invoke(payload(content));
    assert.equal(initial.exitCode, 0, initial.stdout + initial.stderr);
    assert.match(initial.stdout, /redispatch sdd-task/);
    assert.equal(existsSync(join(dir, scratch)), false);
    const persisted = readFileSync(join(dir, path), 'utf8');
    assert.equal(persisted.match(/technical-replan RP-helper/g)?.length, 1);
    const retry = invoke(payload(content));
    assert.equal(retry.exitCode, 0, retry.stdout + retry.stderr);
    assert.match(retry.stdout, /already recorded/);
    assert.equal(readFileSync(join(dir, path), 'utf8'), persisted);
    const stale = invoke({ ...payload(content), id: 'RP-stale' });
    assert.notEqual(stale.exitCode, 0);
    assert.equal(readFileSync(join(dir, path), 'utf8'), persisted);
    assert.equal(existsSync(join(dir, scratch)), true);
    const unsafe = invoke({ ...payload(persisted), addTargets: ['../escape.ts'] });
    assert.notEqual(unsafe.exitCode, 0);
    assert.equal(readFileSync(join(dir, path), 'utf8'), persisted);
    // Verify and this transition share exactly the same selected-ticket lease.
    await withSddTicketMutation(dir, join(dir, path), async () => {
      const locked = invoke(payload(persisted));
      assert.notEqual(locked.exitCode, 0);
      assert.match(locked.stdout + locked.stderr, /still owns this ticket/);
    });
    const other = join(dir, 'specs/core/core.task.COR-other.md');
    writeFileSync(other, content.replace('COR-work', 'COR-other'));
    await withSddReplanMutation(dir, join(dir, path), async () => {
      await assert.rejects(
        withSddReplanMutation(dir, other, () => null),
        /still owns this ticket/
      );
    });
    assert.equal(readFileSync(join(dir, path), 'utf8'), persisted);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
