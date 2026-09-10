// @file: Unit tests for the config loader — durations, section discovery, merge, provenance.
// @consumers: CI
// @tasks: TSK-95

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { parseDuration, formatDuration, loadConfigSection } = await import('../config-loader.ts');

/** @purpose Create a temp dir holding the given config files, run fn, clean up. */
function withConfigs<T>(files: Record<string, string>, fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-loader-'));
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

describe('loadConfigSection', () => {
  it('returns null without errors when no source carries the section', () => {
    withConfigs({}, (dir) => {
      const loaded = loadConfigSection(dir, 'stack');
      assert.equal(loaded.section, null);
      assert.deepEqual(loaded.errors, []);
    });
  });

  it('is section-parameterized, so a future consumer reuses the same machinery', () => {
    withConfigs({ 'gennady.yaml': 'stack:\n  golang: {}\nmodels:\n  - name: gpt\n' }, (dir) => {
      assert.notEqual(loadConfigSection(dir, 'stack').section, null);
      // A non-mapping section is reported, not crashed on — its owner decides what is valid.
      assert.ok(loadConfigSection(dir, 'models').errors.length > 0);
    });
  });

  it('deep-merges objects and replaces arrays, recording per-key provenance', () => {
    withConfigs(
      {
        'gennady.yaml': 'stack:\n  golang:\n    skipGates: [lint]\n    extraGates: []\n',
        '.gennadyrc': '{"stack":{"golang":{"skipGates":["lint","test"]}}}',
      },
      (dir) => {
        const loaded = loadConfigSection(dir, 'stack');
        const golang = (loaded.section as { golang: Record<string, unknown> }).golang;
        assert.deepEqual(golang['skipGates'], ['lint', 'test'], 'arrays replace whole');
        assert.deepEqual(golang['extraGates'], [], 'untouched keys survive the merge');
        assert.equal(loaded.provenance.get('golang.skipGates'), '.gennadyrc');
        assert.equal(loaded.provenance.get('golang.extraGates'), 'gennady.yaml');
        assert.deepEqual(loaded.sources, ['.gennadyrc', 'gennady.yaml']);
      }
    );
  });

  it('reports a parse error instead of throwing', () => {
    withConfigs({ 'gennady.yaml': 'stack: [unclosed' }, (dir) => {
      assert.ok(loadConfigSection(dir, 'stack').errors.length > 0);
    });
  });

  it('ignores a foreign section entirely — its problems belong to its own consumer', () => {
    withConfigs({ '.gennadyrc': '{"models":{"broken":true},"stack":{"golang":{}}}' }, (dir) => {
      assert.deepEqual(loadConfigSection(dir, 'stack').errors, []);
    });
  });
});

describe('loadConfigSection — prototype-polluting keys (review #2)', () => {
  it('reports __proto__ as an error instead of letting it vanish into the prototype', () => {
    withConfigs({ '.gennadyrc': '{"stack":{"__proto__":{"use":["golang"]}}}' }, (dir) => {
      const load = loadConfigSection(dir, 'stack');
      assert.ok(
        load.errors.some(
          (error) => /__proto__/.test(error.path) || /__proto__/.test(error.message)
        ),
        'a __proto__ key must be reported, not silently applied to the prototype chain'
      );
      assert.strictEqual(
        (load.section as Record<string, unknown> | null)?.['use'],
        undefined,
        'nothing may leak in through the prototype chain'
      );
    });
  });

  it('reports constructor and prototype keys too', () => {
    withConfigs({ '.gennadyrc': '{"stack":{"constructor":1,"prototype":2}}' }, (dir) => {
      const load = loadConfigSection(dir, 'stack');
      const paths = load.errors.map((error) => error.path).join(' ');
      assert.match(paths, /constructor/);
      assert.match(paths, /prototype/);
    });
  });
});

describe('parseDuration — a mandatory timeout cannot be zeroed (review #9)', () => {
  it('rejects zero durations', () => {
    for (const value of ['0s', '0m', '0h', '00s']) {
      assert.strictEqual(parseDuration(value), null, `${value} must not parse`);
    }
  });

  it('still accepts positive durations', () => {
    assert.strictEqual(parseDuration('1s'), 1_000);
    assert.strictEqual(parseDuration('10m'), 600_000);
  });
});
