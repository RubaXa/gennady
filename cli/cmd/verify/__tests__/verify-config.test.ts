// @file: Unit tests for verify config loading — strict validation, defaults, error paths.
// @consumers: CI
// @tasks: SPIKE-yaml-verify

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { loadVerifyConfig, parseDuration, DEFAULT_GATE_TIMEOUT_MS } =
  await import('../verify-config.logic.ts');

let root: string;

/** @purpose Write gennady.yaml in the fixture root. */
function writeConfig(content: string): void {
  fs.writeFileSync(path.join(root, 'gennady.yaml'), content);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-config-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('parseDuration', () => {
  it('parses ms/s/m/h and rejects everything else', () => {
    assert.equal(parseDuration('500ms'), 500);
    assert.equal(parseDuration('90s'), 90_000);
    assert.equal(parseDuration('5m'), 300_000);
    assert.equal(parseDuration('1h'), 3_600_000);
    assert.equal(parseDuration('5 minutes'), null);
    assert.equal(parseDuration('-5m'), null);
  });
});

describe('loadVerifyConfig', () => {
  it('returns gates: null without errors when no gennady.yaml exists', () => {
    const load = loadVerifyConfig(root);

    assert.equal(load.gates, null);
    assert.equal(load.errors.length, 0);
  });

  it('returns gates: null when gennady.yaml has no verify section', () => {
    writeConfig('other:\n  key: value\n');

    const load = loadVerifyConfig(root);

    assert.equal(load.gates, null);
    assert.equal(load.errors.length, 0);
  });

  it('loads gates in declaration order with defaults applied', () => {
    writeConfig(
      'verify:\n  gates:\n    - { id: lint, argv: [npm, run, lint], timeout: 5m }\n    - { id: test, argv: [npm, test] }\n'
    );

    const load = loadVerifyConfig(root);

    assert.deepEqual(
      load.gates?.map((g) => g.id),
      ['lint', 'test']
    );
    assert.equal(load.gates?.[0]?.timeoutMs, 300_000);
    assert.equal(load.gates?.[1]?.timeoutMs, DEFAULT_GATE_TIMEOUT_MS);
    assert.equal(load.gates?.[1]?.outputMeansFailure, false);
    assert.equal(load.gates?.[0]?.cwd, root);
  });

  it('resolves cwd against the root and keeps env', () => {
    writeConfig(
      'verify:\n  gates:\n    - { id: app, argv: [make, check], cwd: app, env: { CI: "1" } }\n'
    );

    const gate = loadVerifyConfig(root).gates?.[0];

    assert.equal(gate?.cwd, path.join(root, 'app'));
    assert.deepEqual(gate?.env, { CI: '1' });
  });

  it('rejects unknown keys, bad durations, empty argv and duplicate ids — all at once', () => {
    writeConfig(
      [
        'verify:',
        '  gates:',
        '    - { id: a, argv: [x], timeot: 5m }',
        '    - { id: b, argv: [] }',
        '    - { id: a, argv: [y] }',
        '    - { id: c, argv: [z], timeout: soon }',
      ].join('\n')
    );

    const load = loadVerifyConfig(root);

    assert.equal(load.gates, null);
    const paths = load.errors.map((e) => e.path).join(' ');
    assert.match(paths, /gates\[0\]\.timeot/);
    assert.match(paths, /gates\[1\]\.argv/);
    assert.match(paths, /gates\[2\]\.id/);
    assert.match(paths, /gates\[3\]\.timeout/);
  });

  it('treats a non-list gates value as a fatal error, not a crash', () => {
    writeConfig('verify:\n  gates:\n    id: lint\n');

    const load = loadVerifyConfig(root);

    assert.equal(load.gates, null);
    assert.equal(load.errors[0]?.path, 'verify.gates');
  });

  it('reports unparseable yaml as a config error', () => {
    writeConfig('verify: [unclosed');

    const load = loadVerifyConfig(root);

    assert.equal(load.gates, null);
    assert.match(load.errors[0]?.message ?? '', /cannot parse/);
  });
});
