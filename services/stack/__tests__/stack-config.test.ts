// @file: Unit tests for stack config — YAML+rc discovery, deep-merge with provenance, strict validation.
// @consumers: CI
// @tasks: TSK-95

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Gate, StackId, StackPluginConfig } from '../stack.types.ts';

const { loadStackConfig, applyStackConfig, pluginConfigOf, parseDuration, formatDuration } =
  await import('../stack-config.ts');

/** Gate-id vocabulary used by validation in these tests. */
const GATE_IDS: Readonly<Record<StackId, readonly string[]>> = {
  node: ['typecheck', 'gennady', 'lint', 'test', 'format'],
  golang: ['build', 'vet', 'fmt', 'lint', 'test'],
};

/** @purpose Build a minimal executable gate fixture. */
function gate(id: string, extra: Partial<Gate> = {}): Gate {
  return {
    id,
    stack: 'golang',
    label: id,
    argv: ['tool', id],
    cwd: '/repo',
    timeoutMs: 60_000,
    outputMeansFailure: false,
    skipped: null,
    ...extra,
  };
}

/** @purpose Create a temp dir with given config files, run fn, clean up. */
function withConfigs<T>(files: Record<string, string>, fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stack-config-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), content);
    }
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('parseDuration / formatDuration', () => {
  it('parses s/m/h and rejects everything else', () => {
    assert.equal(parseDuration('90s'), 90_000);
    assert.equal(parseDuration('5m'), 300_000);
    assert.equal(parseDuration('1h'), 3_600_000);
    assert.equal(parseDuration('5 m'), null);
    assert.equal(parseDuration('600000'), null);
    assert.equal(parseDuration('5min'), null);
  });

  it('formats back to the shortest exact unit', () => {
    assert.equal(formatDuration(300_000), '5m');
    assert.equal(formatDuration(90_000), '90s');
    assert.equal(formatDuration(3_600_000), '1h');
  });
});

describe('loadStackConfig — discovery and merge', () => {
  it('returns null config without errors when no source exists', () => {
    withConfigs({}, (dir) => {
      const load = loadStackConfig(dir, GATE_IDS);
      assert.equal(load.config, null);
      assert.deepEqual(load.errors, []);
    });
  });

  it('reads the stack section from gennady.yaml', () => {
    withConfigs(
      { 'gennady.yaml': 'stack:\n  use: [golang]\n  golang:\n    skipGates: [lint]\n' },
      (dir) => {
        const load = loadStackConfig(dir, GATE_IDS);
        assert.deepEqual(load.errors, []);
        assert.deepEqual(load.config?.use, ['golang']);
        assert.deepEqual(pluginConfigOf(load.config, 'golang')?.skipGates, ['lint']);
      }
    );
  });

  it('deep-merges: a one-key personal .gennadyrc overlays the project yaml', () => {
    withConfigs(
      {
        'gennady.yaml':
          'stack:\n  golang:\n    skipGates: [lint]\n    overrideGates:\n      test:\n        timeout: 15m\n',
        '.gennadyrc': '{"stack":{"golang":{"overrideGates":{"test":{"env":{"MY_TOKEN":"x"}}}}}}',
      },
      (dir) => {
        const load = loadStackConfig(dir, GATE_IDS);
        assert.deepEqual(load.errors, []);
        const golang = pluginConfigOf(load.config, 'golang')!;
        // Objects merge: both the yaml timeout and the personal env survive.
        assert.equal(golang.overrideGates?.['test']?.timeout, '15m');
        assert.deepEqual(golang.overrideGates?.['test']?.env, { MY_TOKEN: 'x' });
        // Untouched project keys come through.
        assert.deepEqual(golang.skipGates, ['lint']);
      }
    );
  });

  it('replaces scalars and arrays from the higher-priority source, with provenance', () => {
    withConfigs(
      {
        'gennady.yaml': 'stack:\n  golang:\n    skipGates: [lint]\n',
        '.gennadyrc': '{"stack":{"golang":{"skipGates":["lint","test"]}}}',
      },
      (dir) => {
        const load = loadStackConfig(dir, GATE_IDS);
        assert.deepEqual(pluginConfigOf(load.config, 'golang')?.skipGates, ['lint', 'test']);
        assert.equal(load.provenance.get('golang.skipGates'), '.gennadyrc');
      }
    );
  });

  it('an empty personal array re-enables what the project skipped (replace semantics)', () => {
    withConfigs(
      {
        'gennady.yaml': 'stack:\n  golang:\n    skipGates: [lint, test]\n',
        '.gennadyrc': '{"stack":{"golang":{"skipGates":[]}}}',
      },
      (dir) => {
        assert.deepEqual(
          pluginConfigOf(loadStackConfig(dir, GATE_IDS).config, 'golang')?.skipGates,
          []
        );
      }
    );
  });

  it('records per-key provenance for values from each source', () => {
    withConfigs(
      {
        'gennady.yaml':
          'stack:\n  golang:\n    overrideGates:\n      test:\n        timeout: 15m\n',
        '.gennadyrc': '{"stack":{"golang":{"skipGates":["lint"]}}}',
      },
      (dir) => {
        const load = loadStackConfig(dir, GATE_IDS);
        assert.equal(load.provenance.get('golang.overrideGates.test.timeout'), 'gennady.yaml');
        assert.equal(load.provenance.get('golang.skipGates'), '.gennadyrc');
        assert.deepEqual(load.sources, ['.gennadyrc', 'gennady.yaml']);
      }
    );
  });
});

describe('loadStackConfig — strict validation (fatal errors)', () => {
  it('ignores a broken foreign `models` section in .gennadyrc (review B5)', () => {
    withConfigs(
      { '.gennadyrc': '{"models":{},"stack":{"golang":{"skipGates":["lint"]}}}' },
      (dir) => {
        const load = loadStackConfig(dir, GATE_IDS);
        assert.deepEqual(load.errors, [], JSON.stringify(load.errors));
        assert.deepEqual(pluginConfigOf(load.config, 'golang')?.skipGates, ['lint']);
      }
    );
  });

  it('reports a non-array extraGates as a config error instead of crashing (review B7)', () => {
    withConfigs(
      { 'gennady.yaml': 'stack:\n  golang:\n    extraGates:\n      drift:\n        argv: [x]\n' },
      (dir) => {
        const load = loadStackConfig(dir, GATE_IDS);
        assert.equal(load.errors[0]?.path, 'stack.golang.extraGates');
        assert.match(load.errors[0]?.message ?? '', /array/);
      }
    );
  });

  it('reports a broken YAML file as an error', () => {
    withConfigs({ 'gennady.yaml': 'stack: [unclosed' }, (dir) => {
      const load = loadStackConfig(dir, GATE_IDS);
      assert.ok(load.errors.length > 0);
    });
  });

  it('rejects an unknown plugin section with a did-you-mean hint', () => {
    withConfigs({ 'gennady.yaml': 'stack:\n  golnag:\n    skipGates: [lint]\n' }, (dir) => {
      const load = loadStackConfig(dir, GATE_IDS);
      assert.match(load.errors[0]?.message ?? '', /did you mean "golang"/);
    });
  });

  it('rejects an unknown key inside a plugin section (typo in skipGates)', () => {
    withConfigs({ 'gennady.yaml': 'stack:\n  golang:\n    skipGate: [lint]\n' }, (dir) => {
      const load = loadStackConfig(dir, GATE_IDS);
      assert.equal(load.errors[0]?.path, 'stack.golang.skipGate');
      assert.match(load.errors[0]?.message ?? '', /did you mean "skipGates"/);
    });
  });

  it('rejects an unknown id in use', () => {
    withConfigs({ 'gennady.yaml': 'stack:\n  use: [rust]\n' }, (dir) => {
      const load = loadStackConfig(dir, GATE_IDS);
      assert.equal(load.errors[0]?.path, 'stack.use.rust');
    });
  });

  it('rejects an override of a gate the plugin does not have', () => {
    withConfigs(
      {
        'gennady.yaml': 'stack:\n  golang:\n    overrideGates:\n      tidy:\n        timeout: 5m\n',
      },
      (dir) => {
        const load = loadStackConfig(dir, GATE_IDS);
        assert.equal(load.errors[0]?.path, 'stack.golang.overrideGates.tidy');
      }
    );
  });

  it('rejects a bad duration string with the grammar in the message', () => {
    withConfigs(
      {
        'gennady.yaml':
          'stack:\n  golang:\n    overrideGates:\n      test:\n        timeout: 15 minutes\n',
      },
      (dir) => {
        const load = loadStackConfig(dir, GATE_IDS);
        assert.match(load.errors[0]?.message ?? '', /duration/);
      }
    );
  });

  it('requires id and argv on extraGates entries', () => {
    withConfigs(
      { 'gennady.yaml': 'stack:\n  golang:\n    extraGates:\n      - timeout: 5m\n' },
      (dir) => {
        const load = loadStackConfig(dir, GATE_IDS);
        const paths = load.errors.map((error) => error.path);
        assert.ok(paths.some((p) => p.endsWith('.id')));
        assert.ok(paths.some((p) => p.endsWith('.argv')));
      }
    );
  });

  it('accepts the reserved fixers key with valid specs', () => {
    withConfigs(
      {
        'gennady.yaml':
          'stack:\n  golang:\n    fixers:\n      - id: fmt-write\n        argv: [gofmt, -w, .]\n',
      },
      (dir) => {
        assert.deepEqual(loadStackConfig(dir, GATE_IDS).errors, []);
      }
    );
  });

  it('collects ALL errors instead of stopping at the first', () => {
    withConfigs(
      {
        'gennady.yaml':
          'stack:\n  use: [rust]\n  golang:\n    skipGate: [lint]\n    extraGates:\n      - timeout: bad\n',
      },
      (dir) => {
        const load = loadStackConfig(dir, GATE_IDS);
        assert.ok(
          load.errors.length >= 3,
          `expected ≥3 errors, got: ${JSON.stringify(load.errors)}`
        );
      }
    );
  });
});

describe('applyStackConfig', () => {
  const provenance = new Map([
    ['golang.skipGates', 'gennady.yaml'],
    ['golang.overrideGates.test.argv', '.gennadyrc'],
    ['golang.extraGates', 'gennady.yaml'],
  ]);

  it('passes gates through untouched without a config', () => {
    const gates = [gate('build'), gate('test')];
    assert.deepEqual(applyStackConfig(gates, null, 'golang', '/repo', provenance), gates);
  });

  it('applies overrides, then skips (visible, with source), then extraGates — in that order', () => {
    const config: StackPluginConfig = {
      skipGates: ['vet'],
      overrideGates: { test: { argv: ['make', 'test'], timeout: '90s' } },
      extraGates: [{ id: 'drift', argv: ['make', 'check'], outputMeansFailure: true }],
    };

    const effective = applyStackConfig(
      [gate('build'), gate('vet'), gate('test')],
      config,
      'golang',
      '/repo',
      provenance
    );

    assert.deepEqual(
      effective.map((g) => g.id),
      ['build', 'vet', 'test', 'drift']
    );
    // The skipped gate stays visible, carrying its source file.
    assert.equal(effective[1]?.skipped, 'skipGates (gennady.yaml)');
    assert.deepEqual(effective[2]?.argv, ['make', 'test']);
    assert.equal(effective[2]?.timeoutMs, 90_000);
    assert.match(effective[2]?.label ?? '', /overridden by \.gennadyrc/);
    assert.equal(effective[3]?.outputMeansFailure, true);
    assert.match(effective[3]?.label ?? '', /from gennady\.yaml/);
  });

  it('inherits unset override fields from the original gate', () => {
    const original = gate('fmt', { outputMeansFailure: true, timeoutMs: 60_000 });
    const effective = applyStackConfig(
      [original],
      { overrideGates: { fmt: { argv: ['myfmt', '-l'] } } },
      'golang',
      '/repo',
      provenance
    );

    assert.equal(effective[0]?.outputMeansFailure, true);
    assert.equal(effective[0]?.timeoutMs, 60_000);
  });

  it('an argv override supersedes a planner skip', () => {
    const skipped = gate('lint', { argv: [], skipped: 'tool not found' });
    const effective = applyStackConfig(
      [skipped],
      { overrideGates: { lint: { argv: ['mylint'] } } },
      'golang',
      '/repo',
      provenance
    );

    assert.equal(effective[0]?.skipped, null);
    assert.deepEqual(effective[0]?.argv, ['mylint']);
  });

  it('resolves extraGate cwd against the repo root and applies defaults', () => {
    const effective = applyStackConfig(
      [],
      { extraGates: [{ id: 'x', argv: ['t'], cwd: 'sub' }] },
      'golang',
      '/repo',
      provenance
    );

    assert.equal(effective[0]?.cwd, path.resolve('/repo', 'sub'));
    assert.equal(effective[0]?.outputMeansFailure, false);
    assert.equal(effective[0]?.timeoutMs, 600_000);
  });
});

describe('applyStackConfig — skipped extraGates keep their declared shape (review N3)', () => {
  it('serializes cwd/env/timeout/contract from the spec even when skipped', () => {
    const effective = applyStackConfig(
      [],
      {
        skipGates: ['drift'],
        extraGates: [
          {
            id: 'drift',
            argv: ['make', 'check'],
            cwd: 'sub',
            env: { A: '1' },
            timeout: '90s',
            outputMeansFailure: true,
          },
        ],
      },
      'golang',
      '/repo',
      new Map([['golang.skipGates', '.gennadyrc']])
    );

    const drift = effective[0]!;
    assert.match(drift.skipped ?? '', /skipGates/);
    assert.deepEqual(drift.argv, []);
    assert.equal(drift.cwd, path.resolve('/repo', 'sub'));
    assert.deepEqual(drift.env, { A: '1' });
    assert.equal(drift.timeoutMs, 90_000);
    assert.equal(drift.outputMeansFailure, true);
  });
});
