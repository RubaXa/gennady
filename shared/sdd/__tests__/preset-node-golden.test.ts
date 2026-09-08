// @file: V-01 node-parity golden — freezes today's RC sdd-verify shape (30-TRACK-VERIFY.md §3.1.3,
//   §6 V-01) BEFORE any of V-02..V-16 touch it. Pure measurement: no behaviour here is changed by
//   this file, only observed and pinned. Golden-utterances in this file reference the frozen SHA
//   rc-baseline-1 (227c03a8) per D-38 — a later HEAD move on codex/sdd-v2-rc52-followup does not
//   invalidate this golden; only V-04/V-04a/V-12/V-14 (named in the brief) may intentionally update
//   it, via UPDATE_VERIFY_GOLDEN=1.
// @consumers: N/A (regression fixture for the SDD v1→v2 transfer plan, track 30-TRACK-VERIFY)
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolvePhaseVerificationPlan,
  type PhaseVerificationGatePlan,
} from '../phase-verification-plan.ts';
import type { TicketCorpusRef } from '../ticket-resolve.ts';
import { GATES, gatesFor, requiredGatesFor } from '../../../cli/cmd/sdd-verify/sdd-verify.types.ts';
import {
  planTargetRepair,
  describeRepairAction,
} from '../../../cli/cmd/sdd-verify/repair-adapters.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const FIXTURE_ROOT = path.join(
  REPO_ROOT,
  'cli',
  'cmd',
  'sdd-verify',
  '__tests__',
  'fixtures',
  'environment-state-fixture'
);

// The frozen node fixture — exactly shared/sdd/readiness.ts REQUIRED_SCRIPTS, argument-forwarding
// repair leaves. Read once from the committed fixture file (I-3: never the RC root's own
// package.json — REL-4/REL-6/REL-8 mutate that one and would redden this golden for unrelated
// reasons). See 30-TRACK-VERIFY.md:558-561.
const NODE_SCRIPTS: Record<string, string> = JSON.parse(
  readFileSync(path.join(FIXTURE_ROOT, 'package.json'), 'utf-8')
).scripts;

function updateGolden(): boolean {
  return process.env.UPDATE_VERIFY_GOLDEN === '1';
}

/**
 * @purpose Compare `actual` against a committed golden JSON file, or (re)write it when the
 *   UPDATE_VERIFY_GOLDEN=1 convention (see scripts/__tests__/deployed-surface.test.ts for the
 *   established UPDATE_SURFACE_GOLDEN precedent this repeats) is set.
 */
// Compared by parsed VALUE, not raw bytes: the repo's own `format` gate (prettier) reformats a
// committed `.golden.json` file's whitespace (e.g. collapsing short arrays onto one line) on the
// very next `npm run format:fix`, which would otherwise make this golden flap between two passing
// runs of the SAME data for a reason that has nothing to do with sdd-verify's behaviour.
function assertGoldenJson(goldenPath: string, actual: unknown): void {
  if (updateGolden()) {
    writeFileSync(goldenPath, `${JSON.stringify(actual, null, 2)}\n`);
    return;
  }
  assert.ok(
    existsSync(goldenPath),
    `missing ${path.relative(REPO_ROOT, goldenPath)} — regenerate with UPDATE_VERIFY_GOLDEN=1 npm test`
  );
  const expected: unknown = JSON.parse(readFileSync(goldenPath, 'utf-8'));
  assert.deepStrictEqual(
    actual,
    expected,
    `${path.relative(REPO_ROOT, goldenPath)} drifted from the frozen rc-baseline-1 (227c03a8) shape.\n` +
      'If the change is deliberate AND owned by a named task (V-04/V-04a/V-12/V-14 per ' +
      '30-TRACK-VERIFY.md §6), regenerate with: UPDATE_VERIFY_GOLDEN=1 npm test'
  );
}

// ── Fixture ticket builder (mirrors shared/sdd/__tests__/phase-verification-plan.test.ts) ──────────

type Phase = {
  id: string;
  kind: 'config' | 'impl' | 'test';
  targets: string[];
};

function ticket(id: string, phases: Phase[], coverageOwner?: string): TicketCorpusRef {
  const content = [
    '<!--SECTION:META-->',
    `- **Task-ID:** ${id}`,
    '- **Status:** [ ] TODO',
    '- **Scope:** app',
    '- **Dependencies:** None',
    '<!--/SECTION:META-->',
    '<!--SECTION:PHASES_OVERVIEW-->',
    '| ID | Kind | Deps | Status |',
    '|---|---|---|---|',
    ...phases.map((phase) => `| ${phase.id} | ${phase.kind} | — | [ ] |`),
    '<!--/SECTION:PHASES_OVERVIEW-->',
    ...phases.flatMap((phase) => [
      `<!--SECTION:PHASE_${phase.id}-->`,
      '- **Rules:**',
      '  - none',
      '- **Target Files:**',
      // No bullet at all (not even "- none") — bulletsUnder() stops at the first non-bullet line,
      // so an empty list here is the only shape that actually yields targetFiles.length === 0.
      ...phase.targets.map((target) => `  - ${target}`),
      '- **Deleted Files:**',
      '  - none',
      `<!--/SECTION:PHASE_${phase.id}-->`,
    ]),
    '<!--SECTION:VERIFICATION-->',
    ...(coverageOwner
      ? ['- **Coverage Policy:** required', `- **Coverage Owner Phase:** ${coverageOwner}`]
      : ['- **Coverage Policy:** not-applicable', '- **Coverage Reason:** fixture']),
    '| Command | Required by | Role |',
    '|---|---|---|',
    '| — | — | extra |',
    '<!--/SECTION:VERIFICATION-->',
  ].join('\n');
  return {
    file: '/repo/specs/app/app.task.GOLDEN.md',
    taskId: id,
    status: '[ ] TODO',
    dependencies: [],
    scope: 'app',
    flowVersion: 'v2',
    content,
  };
}

function planGates(
  kind: Phase['kind'],
  coverageOwner?: string
): readonly PhaseVerificationGatePlan[] {
  const id = 'GOLDEN';
  const ref = ticket(id, [{ id: 'P1', kind, targets: ['src/example.ts'] }], coverageOwner);
  const plan = resolvePhaseVerificationPlan({
    refs: [ref],
    ticketFile: ref.file,
    phaseId: 'P1',
    scripts: NODE_SCRIPTS,
    availableArtifacts: new Set(),
    mode: 'runtime',
  });
  assert.ok(plan, `resolvePhaseVerificationPlan returned null for kind=${kind}`);
  return plan.gates;
}

// ── 1. Golden JSON — resolved gates for 5 canonical profile variants ────────────────────────────
//
// `resolvePreset('node', profile, root, config)` does not exist yet (it is V-04's job, 30-TRACK-
// VERIFY.md §6). This test captures the SAME observable shape through the two functions that exist
// today: `resolvePhaseVerificationPlan` for the three phase profiles (setup/code/test), and
// `gatesFor`/`requiredGatesFor` (sdd-verify.types.ts) for the project-level `full` profile, which
// has no PhaseVerificationGatePlan/`state` concept in the current code — captured honestly without
// inventing one (see R-01-V-01.md "ОТКЛОНЕНИЯ").

describe('V-01 golden: resolved node gates per profile (30-TRACK-VERIFY.md §3.1.3 п.1)', () => {
  const cases: { name: string; kind: Phase['kind']; coverageOwner?: string }[] = [
    { name: 'setup', kind: 'config' },
    { name: 'code', kind: 'impl' },
    { name: 'test-owner', kind: 'test', coverageOwner: 'P1' },
    { name: 'test-non-owner', kind: 'test' },
  ];

  for (const { name, kind, coverageOwner } of cases) {
    it(`profile=${name}`, () => {
      const gates = planGates(kind, coverageOwner);
      assertGoldenJson(path.join(HERE, `preset-node-golden.${name}.golden.json`), gates);
    });
  }

  it('profile=full (project-level, read-only — no PhaseVerificationGatePlan/state today)', () => {
    const gates = gatesFor('full').map((gate) => ({
      name: gate.name,
      mutates: gate.mutates,
      haltsOnFailure: gate.haltsOnFailure,
      via: gate.via ?? 'npm',
      required: requiredGatesFor('full').includes(gate.name),
      // `full`'s exact command resolves at run time (readProjectScripts()/gennadyGateCommand(),
      // both cwd-bound, sdd-verify.cmd.ts — untouched by this brief). The exact argv sequence for a
      // real `full` run is golden-pinned instead in parity-node.test.ts (byte-for-byte stdout +
      // call-sequence golden), which is the dyra-2(a) proof this static shape cannot give.
      command:
        gate.via === 'gennady'
          ? null
          : NODE_SCRIPTS[gate.name] !== undefined
            ? `npm run ${gate.name}`
            : null,
    }));
    assertGoldenJson(path.join(HERE, 'preset-node-golden.full.golden.json'), gates);
  });

  // Дыра #8 (30-TRACK-VERIFY.md:176): matrix items not covered by the single fixture above.
  it('targets.length === 0 → fix command is null (commandForGate, phase-verification-plan.ts:258)', () => {
    const ref = ticket('EMPTY-TARGETS', [{ id: 'P1', kind: 'impl', targets: [] }]);
    const plan = resolvePhaseVerificationPlan({
      refs: [ref],
      ticketFile: ref.file,
      phaseId: 'P1',
      scripts: NODE_SCRIPTS,
      availableArtifacts: new Set(),
      mode: 'runtime',
    });
    assert.ok(plan);
    const fix = plan.gates.find((g) => g.name === 'fix');
    assert.deepStrictEqual(
      { state: fix?.state, command: fix?.command },
      { state: 'COMMAND_MISSING', command: null }
    );
  });

  it('missing lint:fix → fix is COMMAND_MISSING, not silently dropped', () => {
    const { 'lint:fix': _omit, ...scripts } = NODE_SCRIPTS;
    void _omit;
    const ref = ticket('NO-LINTFIX', [{ id: 'P1', kind: 'impl', targets: ['src/example.ts'] }]);
    const plan = resolvePhaseVerificationPlan({
      refs: [ref],
      ticketFile: ref.file,
      phaseId: 'P1',
      scripts,
      availableArtifacts: new Set(),
      mode: 'runtime',
    });
    assert.ok(plan);
    assert.strictEqual(plan.gates.find((g) => g.name === 'fix')?.state, 'COMMAND_MISSING');
  });

  it('vacuous format:fix (no-op) → fix is COMMAND_MISSING (isVacuousScript, readiness.ts:405)', () => {
    const scripts = { ...NODE_SCRIPTS, 'format:fix': 'true' };
    const ref = ticket('VACUOUS', [{ id: 'P1', kind: 'impl', targets: ['src/example.ts'] }]);
    const plan = resolvePhaseVerificationPlan({
      refs: [ref],
      ticketFile: ref.file,
      phaseId: 'P1',
      scripts,
      availableArtifacts: new Set(),
      mode: 'runtime',
    });
    assert.ok(plan);
    assert.strictEqual(plan.gates.find((g) => g.name === 'fix')?.state, 'COMMAND_MISSING');
  });

  it('non-forwarding repair brick (broad root) → fix is COMMAND_MISSING (isDeclaredArgumentForwardingRepairBrick, readiness.ts:302)', () => {
    const scripts = { ...NODE_SCRIPTS, 'lint:fix': 'eslint --fix src/' };
    const ref = ticket('BROAD-ROOT', [{ id: 'P1', kind: 'impl', targets: ['src/example.ts'] }]);
    const plan = resolvePhaseVerificationPlan({
      refs: [ref],
      ticketFile: ref.file,
      phaseId: 'P1',
      scripts,
      availableArtifacts: new Set(),
      mode: 'runtime',
    });
    assert.ok(plan);
    assert.strictEqual(plan.gates.find((g) => g.name === 'fix')?.state, 'COMMAND_MISSING');
  });

  it('type-check alias "typecheck" resolves to the canonical gate (readiness.ts:30-32)', () => {
    const { 'type-check': tc, ...rest } = NODE_SCRIPTS;
    const scripts = { ...rest, typecheck: tc };
    const ref = ticket('ALIAS', [{ id: 'P1', kind: 'impl', targets: ['src/example.ts'] }]);
    const plan = resolvePhaseVerificationPlan({
      refs: [ref],
      ticketFile: ref.file,
      phaseId: 'P1',
      scripts,
      availableArtifacts: new Set(),
      mode: 'runtime',
    });
    assert.ok(plan);
    assert.deepStrictEqual(
      {
        state: plan.gates.find((g) => g.name === 'type-check')?.state,
        command: plan.gates.find((g) => g.name === 'type-check')?.command,
      },
      { state: 'CONFIGURED', command: 'npm run typecheck' }
    );
  });
});

// ── 2. planTargetRepair-golden (30-TRACK-VERIFY.md:495; дыры #6, #7, #8) ────────────────────────
//
// Matrix over lint:fix body (drives PROJECT_LINTER_ADAPTERS first-match), target extension, and
// specPath presence — dyra #6 (fix-evidence not seen by golden п.1) and #7 (adapter order).

describe('V-01 golden: planTargetRepair matrix (30-TRACK-VERIFY.md §3.1.3 п.6-п.8, п.495)', () => {
  const gennadyCommand = { command: 'npx', args: ['--no-install', 'gennady', 'lint'] };

  const adapterBodies: Record<'gennady' | 'eslint' | 'stylelint', string> = {
    gennady: 'gennady lint --autofix',
    eslint: 'eslint --fix',
    stylelint: 'stylelint --fix',
  };

  const cases: {
    name: string;
    adapter: keyof typeof adapterBodies;
    targets: string[];
    specPath?: string;
  }[] = [
    { name: 'gennady-adapter-ts-target', adapter: 'gennady', targets: ['src/a.ts'] },
    {
      name: 'eslint-adapter-ts-target-with-spec',
      adapter: 'eslint',
      targets: ['src/a.ts'],
      specPath: 'specs/app/app.spec.md',
    },
    { name: 'eslint-adapter-js-target-no-contract', adapter: 'eslint', targets: ['src/a.js'] },
    { name: 'catch-all-adapter-css-target', adapter: 'stylelint', targets: ['src/a.css'] },
    { name: 'mixed-targets-ts-and-css', adapter: 'stylelint', targets: ['src/a.ts', 'src/a.css'] },
    { name: 'empty-targets', adapter: 'eslint', targets: [] },
  ];

  for (const { name, adapter, targets, specPath } of cases) {
    it(name, () => {
      const actions = planTargetRepair({
        scripts: { ...NODE_SCRIPTS, 'lint:fix': adapterBodies[adapter] },
        targets,
        specPath,
        gennadyCommand,
      });
      const serialized = actions.map((action) => ({
        ...action,
        evidence: describeRepairAction(action),
      }));
      assertGoldenJson(path.join(HERE, `plan-target-repair.${name}.golden.json`), serialized);
    });
  }

  it('PROJECT_LINTER_ADAPTERS order: gennady-contract first-match wins over eslint even when both apply', () => {
    const actions = planTargetRepair({
      scripts: { ...NODE_SCRIPTS, 'lint:fix': 'gennady lint --autofix' },
      targets: ['src/a.ts'],
      gennadyCommand,
    });
    const names = actions.map((a) => a.name);
    assert.deepStrictEqual(names, ['formatter', 'gennady-contract']);
  });

  it('PROJECT_LINTER_ADAPTERS order: catch-all project-linter stays last for an unrecognized linter', () => {
    const actions = planTargetRepair({
      scripts: { ...NODE_SCRIPTS, 'lint:fix': 'stylelint --fix' },
      targets: ['src/a.ts'],
      gennadyCommand,
    });
    const names = actions.map((a) => a.name);
    // project-linter (catch-all) handles the .ts target since it `accepts: () => true`; the
    // independent gennady-contract tail still runs because stylelint is not contract-capable.
    assert.deepStrictEqual(names, ['formatter', 'project-linter', 'gennady-contract']);
  });
});

// GATES/requiredGatesFor sanity — proves the canonical registry itself has not silently reordered
// (dyra #1 raw material for the golden above; failing here means the golden fixtures are stale by
// construction, not merely by content).
describe('V-01 golden: canonical GATES registry order is unchanged', () => {
  it('registry order', () => {
    assertGoldenJson(
      path.join(HERE, 'gates-registry.golden.json'),
      GATES.map((g) => ({
        name: g.name,
        mutates: g.mutates,
        haltsOnFailure: g.haltsOnFailure,
        via: g.via ?? 'npm',
      }))
    );
  });
});
