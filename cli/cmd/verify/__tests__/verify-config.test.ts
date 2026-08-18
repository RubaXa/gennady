// @file: Unit tests for verify config loading — strict validation, tokenization, defaults.
// @consumers: CI
// @tasks: SPIKE-yaml-verify

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { loadVerifyConfig, parseDuration, tokenizeCommand, DEFAULT_GATE_TIMEOUT_MS } =
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

describe('tokenizeCommand', () => {
  it('splits on whitespace and honours quotes', () => {
    assert.deepEqual(tokenizeCommand('npm run lint'), ['npm', 'run', 'lint']);
    assert.deepEqual(tokenizeCommand('swiftlint --config "My App/.swiftlint.yml"'), [
      'swiftlint',
      '--config',
      'My App/.swiftlint.yml',
    ]);
    assert.deepEqual(tokenizeCommand("sh -c 'gofmt -l . | head'"), [
      'sh',
      '-c',
      'gofmt -l . | head',
    ]);
  });

  it('returns null on an unbalanced quote', () => {
    assert.equal(tokenizeCommand('echo "unclosed'), null);
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

  it('loads named gates in declaration order; a bare string is cmd shorthand', () => {
    writeConfig(
      [
        'verify:',
        '  gates:',
        '    lint: npm run lint',
        '    test:',
        '      cmd: npm test',
        '      timeout: 5m',
      ].join('\n')
    );

    const load = loadVerifyConfig(root);

    assert.deepEqual(
      load.gates?.map((g) => g.id),
      ['lint', 'test']
    );
    assert.deepEqual(load.gates?.[0]?.argv, ['npm', 'run', 'lint']);
    assert.equal(load.gates?.[0]?.timeoutMs, DEFAULT_GATE_TIMEOUT_MS);
    assert.equal(load.gates?.[1]?.timeoutMs, 300_000);
    assert.equal(load.gates?.[0]?.cwd, root);
  });

  it('tokenizes quoted arguments in cmd without a shell', () => {
    writeConfig(
      'verify:\n  gates:\n    lint:\n      cmd: swiftlint --config "My App/.swiftlint.yml"\n'
    );

    assert.deepEqual(loadVerifyConfig(root).gates?.[0]?.argv, [
      'swiftlint',
      '--config',
      'My App/.swiftlint.yml',
    ]);
  });

  it('resolves cwd against the root and keeps env', () => {
    writeConfig(
      'verify:\n  gates:\n    app:\n      cmd: make check\n      cwd: app\n      env: { CI: "1" }\n'
    );

    const gate = loadVerifyConfig(root).gates?.[0];

    assert.equal(gate?.cwd, path.join(root, 'app'));
    assert.deepEqual(gate?.env, { CI: '1' });
  });

  it('rejects unknown keys, bad durations, missing cmd and bad names — all at once', () => {
    writeConfig(
      [
        'verify:',
        '  gates:',
        '    a:',
        '      cmd: x',
        '      timeot: 5m',
        '    b: {}',
        '    2fast: y',
        '    c:',
        '      cmd: z',
        '      timeout: soon',
      ].join('\n')
    );

    const load = loadVerifyConfig(root);

    assert.equal(load.gates, null);
    const paths = load.errors.map((e) => e.path).join(' ');
    assert.match(paths, /gates\.a\.timeot/);
    assert.match(paths, /gates\.b\.cmd/);
    assert.match(paths, /gates\.2fast/);
    assert.match(paths, /gates\.c\.timeout/);
  });

  it('rejects an unbalanced quote in cmd', () => {
    writeConfig('verify:\n  gates:\n    bad: echo "unclosed\n');

    const load = loadVerifyConfig(root);

    assert.equal(load.gates, null);
    assert.match(load.errors[0]?.message ?? '', /unbalanced quote/);
  });

  it('accepts envFailPatterns and rejects invalid regexes with exact paths', () => {
    writeConfig(
      [
        'verify:',
        '  gates:',
        '    ok:',
        '      cmd: x',
        '      envFailPatterns: ["Token for Tuist", "^panic: "]',
        '    bad:',
        '      cmd: y',
        '      envFailPatterns: ["[unclosed"]',
        '    wrong:',
        '      cmd: z',
        '      envFailPatterns: []',
      ].join('\n')
    );

    const load = loadVerifyConfig(root);

    assert.equal(load.gates, null);
    const paths = load.errors.map((e) => e.path).join(' ');
    assert.match(paths, /gates\.bad\.envFailPatterns\[0\]/);
    assert.match(paths, /gates\.wrong\.envFailPatterns/);
  });

  it('keeps envFailPatterns on the loaded gate', () => {
    writeConfig(
      'verify:\n  gates:\n    build:\n      cmd: tuist build\n      envFailPatterns: ["tuist auth login"]\n'
    );

    assert.deepEqual(loadVerifyConfig(root).gates?.[0]?.envFailPatterns, ['tuist auth login']);
  });

  it('treats a list-shaped gates value as a fatal error, not a crash', () => {
    writeConfig('verify:\n  gates:\n    - { id: lint, argv: [x] }\n');

    const load = loadVerifyConfig(root);

    assert.equal(load.gates, null);
    assert.equal(load.errors[0]?.path, 'verify.gates');
  });

  it('reports duplicate gate names as unparseable yaml (strict map keys)', () => {
    writeConfig('verify:\n  gates:\n    lint: a\n    lint: b\n');

    const load = loadVerifyConfig(root);

    assert.equal(load.gates, null);
    assert.match(load.errors[0]?.message ?? '', /cannot parse/);
  });

  it('reports unparseable yaml as a config error', () => {
    writeConfig('verify: [unclosed');

    const load = loadVerifyConfig(root);

    assert.equal(load.gates, null);
    assert.match(load.errors[0]?.message ?? '', /cannot parse/);
  });
});
