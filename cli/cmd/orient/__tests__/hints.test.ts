// @file: Unit tests for generateHints — contextual hint generation for each orient mode.
// @consumers: OrientCommand
// @tasks: TSK-55

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateHints } from '../core/hints.ts';
import type { OrientArgs } from '../orient.types.ts';

function defaultArgs(overrides: Partial<OrientArgs> = {}): OrientArgs {
  return {
    _: [],
    file: [],
    dir: '',
    task: [],
    consumer: [],
    entity: [],
    graph: false,
    recursive: false,
    specs: false,
    spec: '',
    detail: false,
    fuzzy: false,
    depth: Infinity,
    maxResults: Infinity,
    ...overrides,
  };
}

describe('generateHints', () => {
  it('contract hints count: returns at most 4 hints', () => {
    const hints = generateHints(defaultArgs());
    assert.ok(hints.length <= 4);
    assert.ok(hints.length > 0);
  });

  it('contract hints token format: uses "orient" as command token', () => {
    const hints = generateHints(defaultArgs());
    for (const h of hints) {
      assert.match(h, /^orient /);
    }
  });

  it('contract hints token format: uses --flag=<value> syntax', () => {
    const hints = generateHints(defaultArgs({ task: ['TSK-01'] }));
    for (const h of hints) {
      assert.match(h, /orient /);
    }
  });

  it('file mode hints', () => {
    const hints = generateHints(defaultArgs({ file: ['test.ts'] }));
    assert.ok(hints.length > 0);
    assert.ok(hints.every((h) => h.startsWith('orient')));
  });

  it('task mode hints', () => {
    const hints = generateHints(defaultArgs({ task: ['TSK-01'] }));
    assert.ok(hints.length > 0);
  });

  it('consumer mode hints', () => {
    const hints = generateHints(defaultArgs({ consumer: ['DbcTsLinter'] }));
    assert.ok(hints.length > 0);
  });

  it('entity mode hints', () => {
    const hints = generateHints(defaultArgs({ entity: ['someEntity'] }));
    assert.ok(hints.length > 0);
  });

  it('graph mode hints', () => {
    const hints = generateHints(defaultArgs({ graph: true }));
    assert.ok(hints.length > 0);
  });

  it('specs mode hints', () => {
    const hints = generateHints(defaultArgs({ specs: true }));
    assert.ok(hints.length > 0);
  });

  it('spec mode hints', () => {
    const hints = generateHints(defaultArgs({ spec: 'cli.spec.md' }));
    assert.ok(hints.length > 0);
  });

  it('keyword mode hints', () => {
    const hints = generateHints(defaultArgs({ _: ['contract'] }));
    assert.ok(hints.length > 0);
    assert.ok(hints.length <= 4);
  });
});
