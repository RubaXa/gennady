// @file: shared/verify/presets/__tests__/golang.test.ts
// @spec: SHARED
// @consumers: N/A
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  golangPluginGates,
  golangVerificationEnvironmentState,
  resolveGolangPreset,
} from '../golang.ts';

function withGoProject(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'golang-preset-'));
  try {
    mkdirSync(join(root, 'pkg'));
    writeFileSync(join(root, 'go.mod'), 'module example.com/preset\n\ngo 1.22\n');
    writeFileSync(join(root, 'go.sum'), '');
    writeFileSync(join(root, 'pkg', 'owned.go'), 'package pkg\n');
    writeFileSync(join(root, 'pkg', 'other.go'), 'package pkg\n');
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('golang preset V-09', () => {
  it('maps phases to the shared ladder and reserves plugin gates for full', () => {
    withGoProject((root) => {
      const preset = resolveGolangPreset(root);
      assert.deepEqual(preset.gateNames('code', false), ['fix', 'type-check', 'test']);
      assert.deepEqual(preset.gateNames('full', false), [
        'generate',
        'build',
        'vet',
        'fmt',
        'lint',
        'test',
      ]);
      assert.ok(preset.fullGates?.().every((gate) => gate.stack === 'golang'));
    });
  });

  it('renders fix as gofmt -w over exact Go Target Files only', () => {
    withGoProject((root) => {
      const preset = resolveGolangPreset(root);
      const command = preset.commandForGate('fix', {}, ['pkg/owned.go', 'README.md']);
      assert.match(command ?? '', /gofmt -w .*pkg\/owned\.go$/);
      assert.doesNotMatch(command ?? '', /other\.go|go\.mod|go\.sum|tidy/);
      assert.equal(
        readFileSync(join(root, 'go.mod'), 'utf-8'),
        'module example.com/preset\n\ngo 1.22\n'
      );
      assert.equal(readFileSync(join(root, 'pkg', 'other.go'), 'utf-8'), 'package pkg\n');
    });
  });

  it('keeps generate drift metadata only in the full literal plugin plan', () => {
    withGoProject((root) => {
      writeFileSync(join(root, 'pkg', 'owned.go'), '//go:generate sh -c "true"\npackage pkg\n');
      const gates = golangPluginGates(root, null);
      assert.equal(gates.find((gate) => gate.id === 'generate')?.driftMeansFailure, true);
      assert.ok(!resolveGolangPreset(root).gateNames('code', false).includes('generate'));
    });
  });

  it('fingerprints manifests and named Make recipes, ignoring unrelated recipes', () => {
    withGoProject((root) => {
      writeFileSync(join(root, 'Makefile'), 'build:\n\tgo build ./...\n\nrelease:\n\techo one\n');
      const before = golangVerificationEnvironmentState(root);
      writeFileSync(join(root, 'Makefile'), 'build:\n\tgo build ./...\n\nrelease:\n\techo two\n');
      const unrelated = golangVerificationEnvironmentState(root);
      assert.deepEqual(unrelated, before);
      writeFileSync(join(root, 'Makefile'), 'build:\n\tgo build -race ./...\n');
      const changed = golangVerificationEnvironmentState(root);
      assert.notDeepEqual(changed, before);
    });
  });
});
