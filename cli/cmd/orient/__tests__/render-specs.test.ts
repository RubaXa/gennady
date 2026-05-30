// @file: Unit tests for renderSpecsOverview and renderSpecSearch — S8/S9 spec rendering.
// @consumers: OrientCommand
// @tasks: TSK-55

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderSpecsOverview, renderSpecSearch } from '../render/render-specs.ts';
import type { SpecOverview } from '../orient.types.ts';

describe('renderSpecsOverview', () => {
  it('specs overview render: shows spec path with task IDs', () => {
    const overview: SpecOverview = {
      specPath: 'specs/cli/cli.spec.md',
      taskIds: ['TSK-01', 'TSK-02'],
      isLibraryLevel: false,
      subSpecs: [],
    };
    const lines = renderSpecsOverview([overview]);
    const output = lines.join('\n');
    assert.match(output, /cli\.spec\.md/);
    assert.match(output, /TSK-01, TSK-02/);
  });

  it('specs overview render: shows library-level spec with sub-spec count', () => {
    const overview: SpecOverview = {
      specPath: 'specs/dbc/dbc.spec.md',
      taskIds: [],
      isLibraryLevel: true,
      subSpecs: ['specs/dbc/parser.spec.md', 'specs/dbc/linter.spec.md'],
    };
    const lines = renderSpecsOverview([overview]);
    const output = lines.join('\n');
    assert.match(output, /library-level spec/);
    assert.match(output, /2 sub-specs below/);
  });

  it('specs overview render: uses singular for 1 sub-spec', () => {
    const overview: SpecOverview = {
      specPath: 'specs/dbc/dbc.spec.md',
      taskIds: [],
      isLibraryLevel: true,
      subSpecs: ['specs/dbc/parser.spec.md'],
    };
    const lines = renderSpecsOverview([overview]);
    const output = lines.join('\n');
    assert.match(output, /1 sub-spec below/);
  });

  it('returns "No specs found" for empty list', () => {
    const lines = renderSpecsOverview([]);
    assert.deepStrictEqual(lines, ['No specs found']);
  });
});

describe('renderSpecSearch', () => {
  it('spec search render: shows spec path and task IDs', () => {
    const overview: SpecOverview = {
      specPath: 'specs/cli/cli.spec.md',
      taskIds: ['TSK-01', 'TSK-02'],
      isLibraryLevel: false,
      subSpecs: [],
    };
    const lines = renderSpecSearch(overview);
    const output = lines.join('\n');
    assert.match(output, /cli\.spec\.md/);
    assert.match(output, /TSK-01/);
    assert.match(output, /TSK-02/);
  });
});
