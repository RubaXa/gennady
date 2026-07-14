// @file: Unit tests for inbox-eval EvalReport — status derivation (PASS only when every gate
//   passed and every stage completed) plus JSON/Markdown serialization round-trip.
// @consumers: node:test runner
// @tasks: TSK-118

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeEvalReport,
  serializeEvalReportJson,
  serializeEvalReportMarkdown,
  type EvalReport,
  type StageResult,
} from '../eval-report.ts';
import type { GateResult } from '../gates.ts';

const MR = 'https://gitlab.example.com/group/project/-/merge_requests/1';

function allGreenGates(): GateResult[] {
  const ids: GateResult['gate'][] = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10'];
  return ids.map((gate) => ({ gate, pass: true, evidence: 'ok' }));
}

function allDoneStages(): StageResult[] {
  const ids: StageResult['stage'][] = [
    'S0',
    'S1',
    'S2',
    'S3',
    'S4',
    'S5',
    'S6',
    'S7',
    'S8',
    'S9',
    'S10',
    'S11',
  ];
  return ids.map((stage) => ({ stage, done: true }));
}

describe('composeEvalReport — status derivation', () => {
  it('GIVEN все гейты pass=true и все стадии done=true WHEN composeEvalReport THEN status=PASS', () => {
    const report = composeEvalReport({
      mr: MR,
      startedAt: '2026-07-14T12:00:00Z',
      finishedAt: '2026-07-14T12:05:00Z',
      stages: allDoneStages(),
      gates: allGreenGates(),
    });
    assert.strictEqual(report.status, 'PASS');
  });

  it('GIVEN один гейт pass=false WHEN composeEvalReport THEN status=FAIL', () => {
    const gates = allGreenGates();
    gates[7] = { gate: 'G8', pass: false, evidence: 'src/foo.ts:20 (ranges: 5,2)' };
    const report = composeEvalReport({
      mr: MR,
      startedAt: '2026-07-14T12:00:00Z',
      finishedAt: '2026-07-14T12:05:00Z',
      stages: allDoneStages(),
      gates,
    });
    assert.strictEqual(report.status, 'FAIL');
  });

  it('GIVEN все гейты pass=true но одна стадия done=false WHEN composeEvalReport THEN status=FAIL', () => {
    const stages = allDoneStages();
    stages[3] = { stage: 'S3', done: false, detail: 'обрыв' };
    const report = composeEvalReport({
      mr: MR,
      startedAt: '2026-07-14T12:00:00Z',
      finishedAt: '2026-07-14T12:05:00Z',
      stages,
      gates: allGreenGates(),
    });
    assert.strictEqual(report.status, 'FAIL');
  });
});

describe('serializeEvalReportJson / serializeEvalReportMarkdown — round-trip', () => {
  it('GIVEN EvalReport WHEN serializeEvalReportJson THEN JSON.parse восстанавливает эквивалентную структуру', () => {
    const report: EvalReport = composeEvalReport({
      mr: MR,
      startedAt: '2026-07-14T12:00:00Z',
      finishedAt: '2026-07-14T12:05:00Z',
      stages: allDoneStages(),
      gates: allGreenGates(),
    });

    const json = serializeEvalReportJson(report);
    const parsed = JSON.parse(json) as EvalReport;
    assert.deepStrictEqual(parsed, report);
  });

  it('GIVEN EvalReport WHEN serializeEvalReportMarkdown THEN документ содержит status, каждую стадию и каждый гейт', () => {
    const report: EvalReport = composeEvalReport({
      mr: MR,
      startedAt: '2026-07-14T12:00:00Z',
      finishedAt: '2026-07-14T12:05:00Z',
      stages: allDoneStages(),
      gates: allGreenGates(),
    });

    const md = serializeEvalReportMarkdown(report);
    assert.match(md, /\*\*Status:\*\* PASS/);
    for (const stage of report.stages) {
      assert.match(md, new RegExp(`\\| ${stage.stage} \\|`));
    }
    for (const gate of report.gates) {
      assert.match(md, new RegExp(`\\| ${gate.gate} \\|`));
    }
  });
});
