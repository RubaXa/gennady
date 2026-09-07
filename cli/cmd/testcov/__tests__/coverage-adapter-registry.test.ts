// @file: Unit tests for fail-closed coverage adapter selection and Istanbul parity.
// @consumers: node:test runner

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  existsSync,
  lstatSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CoverageAdapter } from '../coverage-adapter.types.ts';
import { selectCoverageAdapter } from '../coverage-adapter-registry.ts';
import { istanbulCoverageAdapter } from '../istanbul-coverage-adapter.ts';
import { createCoverageArtifactBoundary } from '../coverage-artifact.ts';
import { aggregateLineCoverage, describeCoverageGate } from '../coverage-threshold.ts';

const roots: string[] = [];

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'testcov-adapter-'));
  roots.push(root);
  return root;
}

function matchingAdapter(id: string, evidence: string): CoverageAdapter {
  return {
    ...istanbulCoverageAdapter,
    id,
    detect: () => ({ matched: true, evidence: [evidence] }),
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('selectCoverageAdapter', () => {
  it('selects Istanbul from concrete JavaScript project evidence', () => {
    const root = fixture();
    writeFileSync(join(root, 'package.json'), '{"name":"fixture"}');

    const selection = selectCoverageAdapter(root);

    assert.strictEqual(selection.kind, 'selected');
    if (selection.kind === 'selected') assert.strictEqual(selection.adapter.id, 'istanbul-js');
  });

  it('rejects an unknown platform instead of silently assuming Istanbul', () => {
    const selection = selectCoverageAdapter(fixture());

    assert.deepStrictEqual(selection, { kind: 'unsupported', available: ['istanbul-js'] });
  });

  it('rejects ambiguous platform evidence instead of picking by registry order', () => {
    const selection = selectCoverageAdapter(fixture(), [
      matchingAdapter('first', 'first.report'),
      matchingAdapter('second', 'second.report'),
    ]);

    assert.deepStrictEqual(selection, {
      kind: 'ambiguous',
      matches: [
        { id: 'first', evidence: ['first.report'] },
        { id: 'second', evidence: ['second.report'] },
      ],
    });
  });

  it('composes threshold, file detail, results, artifacts, and producer from one custom registry entry', () => {
    const root = fixture();
    mkdirSync(join(root, 'reports'), { recursive: true });
    const source = join(root, 'Sources', 'Feature.future');
    mkdirSync(join(root, 'Sources'), { recursive: true });
    writeFileSync(source, 'feature\n');
    const adapter: CoverageAdapter = {
      ...matchingAdapter('future-platform', 'future.manifest'),
      artifacts: () => ({
        report: 'reports/future.coverage',
        testResults: 'reports/future.tests',
        writableDirectories: ['reports'],
      }),
      producerCapability: () => ({
        kind: 'available',
        producers: [
          {
            name: 'future-runner',
            invocation: (out) => ({ command: 'future-test', args: ['--results', out] }),
          },
        ],
      }),
      parseReport: (content) => {
        const parsed = JSON.parse(content) as { covered: number; total: number };
        return {
          entries: { [source]: { native: 'future-detail' } },
          metrics: {
            [source]: {
              sT: parsed.total,
              sH: parsed.covered,
              bT: 0,
              bH: 0,
              fT: 0,
              fH: 0,
            },
          },
        };
      },
      fileDetail: (path, content, nativeEntry) => ({
        kind: 'supported',
        value: {
          path,
          lines: [
            {
              num: 1,
              text: content.trim(),
              note: (nativeEntry as { native: string }).native,
              sT: 1,
              sH: 1,
              bT: 0,
              bH: 0,
              fT: 0,
              fH: 0,
            },
          ],
          sT: 1,
          sH: 1,
          bT: 0,
          bH: 0,
          fT: 0,
          fH: 0,
        },
      }),
      parseTestResults: (content) => ({
        kind: 'supported',
        value: { [source]: Number(content) },
      }),
    };

    const selection = selectCoverageAdapter(root, [adapter]);
    assert.strictEqual(selection.kind, 'selected');
    if (selection.kind !== 'selected') return;
    const boundary = createCoverageArtifactBoundary(root, selection.adapter);
    assert.strictEqual(boundary.ok, true);
    if (!boundary.ok) return;
    assert.strictEqual(boundary.boundary.reportRelative, 'reports/future.coverage');
    writeFileSync(boundary.boundary.reportAbsolute, 'old report');
    writeFileSync(boundary.boundary.testResultsAbsolute, 'old results');
    assert.deepStrictEqual(boundary.boundary.clearProducerArtifacts(), { ok: true });
    assert.strictEqual(existsSync(boundary.boundary.reportAbsolute), false);
    assert.strictEqual(existsSync(boundary.boundary.testResultsAbsolute), false);
    const capability = selection.adapter.producerCapability(root);
    assert.strictEqual(capability.kind, 'available');
    if (capability.kind === 'available') {
      assert.deepStrictEqual(capability.producers[0]?.invocation('/repo/reports/future.tests'), {
        command: 'future-test',
        args: ['--results', '/repo/reports/future.tests'],
      });
    }
    const report = selection.adapter.parseReport('{"covered":3,"total":4}');
    assert.deepStrictEqual(
      describeCoverageGate(aggregateLineCoverage(Object.values(report.metrics)), 75),
      {
        ok: true,
        message: 'testcov: line coverage 75.0% (3/4 statements) — required ≥75% ✅',
      }
    );
    assert.deepStrictEqual(
      selection.adapter.fileDetail(source, readFileSync(source, 'utf8'), report.entries[source]),
      {
        kind: 'supported',
        value: {
          path: source,
          lines: [
            {
              num: 1,
              text: 'feature',
              note: 'future-detail',
              sT: 1,
              sH: 1,
              bT: 0,
              bH: 0,
              fT: 0,
              fH: 0,
            },
          ],
          sT: 1,
          sH: 1,
          bT: 0,
          bH: 0,
          fT: 0,
          fH: 0,
        },
      }
    );
    assert.deepStrictEqual(selection.adapter.parseTestResults('7'), {
      kind: 'supported',
      value: { [source]: 7 },
    });
  });

  it('reports optional presentation capabilities explicitly instead of applying Istanbul guesses', () => {
    const adapter: CoverageAdapter = {
      ...matchingAdapter('threshold-only', 'threshold.report'),
      fileDetail: () => ({
        kind: 'unsupported',
        code: 'ERR_THRESHOLD_ONLY_DETAIL_UNSUPPORTED',
        message: 'threshold-only reports contain no source locations',
      }),
      parseTestResults: () => ({
        kind: 'unsupported',
        code: 'ERR_THRESHOLD_ONLY_RESULTS_UNSUPPORTED',
        message: 'threshold-only runners expose no per-file test counts',
      }),
    };

    assert.deepStrictEqual(adapter.fileDetail('feature.go', 'package feature', {}), {
      kind: 'unsupported',
      code: 'ERR_THRESHOLD_ONLY_DETAIL_UNSUPPORTED',
      message: 'threshold-only reports contain no source locations',
    });
    assert.deepStrictEqual(adapter.parseTestResults('{}'), {
      kind: 'unsupported',
      code: 'ERR_THRESHOLD_ONLY_RESULTS_UNSUPPORTED',
      message: 'threshold-only runners expose no per-file test counts',
    });
  });
});

describe('istanbulCoverageAdapter', () => {
  it('owns producer capability and argv-safe invocation in the registry entry', () => {
    const root = fixture();
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ devDependencies: { c8: '^10.0.0' }, scripts: { test: 'node --test' } })
    );
    const capability = istanbulCoverageAdapter.producerCapability(root);
    assert.strictEqual(capability.kind, 'available');
    if (capability.kind === 'available') {
      assert.strictEqual(capability.producers[0]?.name, 'node:test');
      assert.deepStrictEqual(capability.producers[0]?.invocation('/tmp/results.json'), {
        command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
        args: ['--no-install', 'c8', '--reporter=json', 'npm', 'run', 'test'],
      });
    }
  });

  it('rejects adapter artifacts through symlink components and preserves the external report', () => {
    const root = fixture();
    const outside = fixture();
    const victim = join(outside, 'coverage-final.json');
    writeFileSync(victim, 'victim');
    symlinkSync(outside, join(root, 'coverage'), 'dir');

    const boundary = createCoverageArtifactBoundary(root, istanbulCoverageAdapter);

    assert.strictEqual(boundary.ok, false);
    if (!boundary.ok) assert.match(boundary.detail, /symlink component/);
    assert.strictEqual(readFileSync(victim, 'utf8'), 'victim');
  });

  it('preserves JS-family source policy while excluding tests', () => {
    const supported = [
      'a.ts',
      'a.tsx',
      'a.mts',
      'a.cts',
      'a.js',
      'a.jsx',
      'a.mjs',
      'a.cjs',
      'a.vue',
      'a.svelte',
    ];
    assert.ok(supported.every((path) => istanbulCoverageAdapter.isProductionSource(path)));
    assert.strictEqual(istanbulCoverageAdapter.isProductionSource('a.test.ts'), false);
    assert.strictEqual(istanbulCoverageAdapter.isTestSource('a.spec.mts'), true);
    assert.strictEqual(istanbulCoverageAdapter.isProductionSource('main.go'), false);
  });

  it('parses and aggregates Istanbul metrics for multiple exact paths', () => {
    const root = fixture();
    const first = join(root, 'src', 'first.ts');
    const second = join(root, 'src', 'second.ts');
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(root, 'coverage'), { recursive: true });
    writeFileSync(first, 'export const first = true;\n');
    writeFileSync(second, 'export const second = false;\n');
    const reportPath = join(root, istanbulCoverageAdapter.artifacts(root).report);
    writeFileSync(
      reportPath,
      JSON.stringify({
        [first]: { s: { 0: 1 }, b: { 0: [1, 0] }, f: { 0: 1 } },
        [second]: { s: { 0: 0 }, b: {}, f: { 0: 0 } },
      })
    );

    const report = istanbulCoverageAdapter.parseReport(readFileSync(reportPath, 'utf8'));
    const resolutions = [first, second].map((path) =>
      istanbulCoverageAdapter.resolveSource(root, report, path)
    );

    assert.deepStrictEqual(resolutions, [
      { kind: 'found', key: first },
      { kind: 'found', key: second },
    ]);
    assert.deepStrictEqual(report.metrics[first], {
      sT: 1,
      sH: 1,
      bT: 2,
      bH: 1,
      fT: 1,
      fH: 1,
    });
    assert.deepStrictEqual(report.metrics[second], {
      sT: 1,
      sH: 0,
      bT: 0,
      bH: 0,
      fT: 1,
      fH: 0,
    });
  });

  it('owns Istanbul-native line detail and runner-result parsing behind adapter operations', () => {
    const source = '/repo/src/feature.ts';
    const detail = istanbulCoverageAdapter.fileDetail(source, 'export function feature() {}\n', {
      statementMap: { '0': { start: { line: 1 }, end: { line: 1 } } },
      s: { '0': 0 },
      branchMap: {},
      b: {},
      fnMap: {
        '0': { name: 'feature', line: 1, loc: { start: { line: 1 }, end: { line: 1 } } },
      },
      f: { '0': 0 },
    });

    assert.strictEqual(detail.kind, 'supported');
    if (detail.kind === 'supported') {
      assert.deepStrictEqual(detail.value.lines[0], {
        num: 1,
        text: 'export function feature() {}',
        note: '← feature() never called',
        sT: 1,
        sH: 0,
        bT: 0,
        bH: 0,
        fT: 1,
        fH: 0,
      });
    }
    assert.deepStrictEqual(
      istanbulCoverageAdapter.parseTestResults(
        JSON.stringify({
          testResults: [
            {
              testFilePath: '/repo/src/feature.test.ts',
              assertionResults: [{ status: 'passed' }, { status: 'failed' }],
            },
          ],
        })
      ),
      { kind: 'supported', value: { '/repo/src/feature.test.ts': 1 } }
    );
  });

  it('checks freshness against every selected source using its own report identity', () => {
    const root = fixture();
    const first = join(root, 'first.ts');
    const second = join(root, 'second.ts');
    mkdirSync(join(root, 'coverage'), { recursive: true });
    writeFileSync(first, 'first');
    writeFileSync(second, 'second');
    const report = join(root, istanbulCoverageAdapter.artifacts(root).report);
    writeFileSync(report, '{}');
    utimesSync(first, 10, 10);
    utimesSync(report, 20, 20);
    utimesSync(second, 30, 30);

    assert.deepStrictEqual(
      istanbulCoverageAdapter.staleSources(lstatSync(report).mtimeMs, [first, second]),
      [second]
    );
  });

  it('keeps full repo-relative path identity and reports relocated ambiguity', () => {
    const root = fixture();
    const source = join(root, 'src', 'feature.ts');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(source, 'export const feature = true;\n');
    const report = {
      entries: {},
      metrics: {
        '/old/a/src/feature.ts': { sT: 1, sH: 1, bT: 0, bH: 0, fT: 0, fH: 0 },
        '/old/b/src/feature.ts': { sT: 1, sH: 0, bT: 0, bH: 0, fT: 0, fH: 0 },
      },
    };

    assert.deepStrictEqual(istanbulCoverageAdapter.resolveSource(root, report, source), {
      kind: 'ambiguous',
      keys: ['/old/a/src/feature.ts', '/old/b/src/feature.ts'],
    });
  });
});
