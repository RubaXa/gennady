// @file: Contract tests for the immutable unified verify model.
// @consumers: CI
// @spec: CLI-VERIFY

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type {
  PlannedVerifyStep,
  VerificationContext,
  VerifyPreset,
  VerifyRunReport,
  VerifyStep,
} from '../plugin-api.ts';

const ruleSnapshot = {
  digest: 'sha256:rules',
  required: [{ id: 'typescript', reason: 'selected files are TypeScript', provenance: 'builtin' }],
  suggested: [],
  skipped: [],
} as const;

const context: VerificationContext = {
  request: {
    root: '/repo',
    phase: 'code',
    scope: { mode: 'files', files: ['src/index.ts'] },
  },
  plugins: ['acme-rust'],
  frameworks: [],
  headSha: '0123456789abcdef',
  rules: ruleSnapshot,
};

const step: VerifyStep = {
  id: 'type-check',
  plugin: 'acme-rust',
  tags: ['code'],
  needs: [],
  executor: 'local',
  effect: 'observe',
  command: {
    argv: ['cargo', 'check'],
    cwd: '/repo',
    timeoutMs: 60_000,
  },
  requires: [],
  timeoutMs: 60_000,
  onFailure: 'stop-phase',
};

const plannedStep: PlannedVerifyStep = {
  ...step,
  id: 'acme-rust:type-check',
  needs: [],
};

describe('unified verify model', () => {
  it('represents a non-built-in plugin preset as immutable data', () => {
    const preset: VerifyPreset = {
      plugin: 'acme-rust',
      steps: [step],
      phases: { code: { include: ['code'] } },
      sddKinds: { impl: 'code' },
      requirements: [],
      rules: ['rust'],
    };

    assert.deepStrictEqual(
      {
        plugin: preset.plugin,
        step: preset.steps[0]?.id,
        phaseTags: preset.phases.code?.include,
        rules: preset.rules,
      },
      {
        plugin: 'acme-rust',
        step: 'type-check',
        phaseTags: ['code'],
        rules: ['rust'],
      }
    );

    if (false) {
      // @ts-expect-error Contract proof: step identity is immutable after preset composition.
      step.id = 'changed';
      // @ts-expect-error Contract proof: the preset exposes an immutable step collection.
      preset.steps.push(step);
    }
  });

  it('carries readiness, rules, mutations, and evidence in one terminal report', () => {
    const report: VerifyRunReport = {
      context,
      readiness: { status: 'READY', entries: [] },
      plan: { phase: 'code', steps: [plannedStep] },
      results: [
        {
          stepId: 'acme-rust:type-check',
          plugin: 'acme-rust',
          status: 'pass',
          exitCode: 0,
          durationMs: 12,
          output: '',
        },
      ],
      mutations: [],
      evidence: [
        { kind: 'command', identity: 'acme-rust:type-check#1', summary: 'cargo check exited 0' },
      ],
      rules: ruleSnapshot,
      verdict: 'pass',
    };

    assert.deepStrictEqual(
      {
        verdict: report.verdict,
        readiness: report.readiness.status,
        ruleDigest: report.rules.digest,
        stepStatus: report.results[0]?.status,
        evidenceKind: report.evidence[0]?.kind,
      },
      {
        verdict: 'pass',
        readiness: 'READY',
        ruleDigest: 'sha256:rules',
        stepStatus: 'pass',
        evidenceKind: 'command',
      }
    );
  });
});
