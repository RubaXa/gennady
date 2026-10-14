// @file: Orient adapter and renderer tests for canonical Spec ID ownership queries.
// @spec: CLI-ORIENT
// @consumers: OrientCommand

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { resolveOrientFileRelations } from '../core/resolve-file-relations.ts';
import { fileRelationsDocument, renderFileRelations } from '../render/render-file-relations.ts';

const ORIENT_CMD = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'orient.cmd.ts');
const TSX_IMPORT = import.meta.resolve('tsx');

function fixture(run: (root: string, source: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'orient-relations-'));
  try {
    const specDir = join(root, 'specs', 'cli', 'orient');
    const source = join(root, 'src', 'query.ts');
    mkdirSync(specDir, { recursive: true });
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(source, '// @file: query\n// @spec: CLI-ORIENT\n// @consumers: N/A\n');
    writeFileSync(
      join(specDir, 'orient.spec.md'),
      '<!--SECTION:SPEC_ID-->\nCLI-ORIENT\n<!--/SECTION:SPEC_ID-->'
    );
    writeFileSync(
      join(specDir, 'orient.task.ORIENT-nav.md'),
      [
        '<!--SECTION:META-->',
        '- **Task-ID:** ORIENT-nav',
        '- **Status:** [~] IN_PROGRESS',
        '- **Spec References:**',
        '  - Contract: [orient](./orient.spec.md)',
        '<!--/SECTION:META-->',
        '<!--SECTION:PHASES_OVERVIEW-->',
        '| ID | Kind | Deps | Status |',
        '|----|------|------|--------|',
        '| P1 | impl | — | [~] IN_PROGRESS |',
        '<!--/SECTION:PHASES_OVERVIEW-->',
        '<!--SECTION:PHASE_P1-->',
        '- **Target Files:**',
        '  - src/query.ts',
        '- **Deleted Files:**',
        '  - none',
        '<!--/SECTION:PHASE_P1-->',
      ].join('\n')
    );
    run(root, source);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('orient file relations', () => {
  it('resolves explicit Spec ID and invokes the shared relation classifier', () => {
    fixture((root, source) => {
      const result = resolveOrientFileRelations(root, source, {
        file: 'query',
        spec: 'CLI-ORIENT',
        tasks: [],
        consumers: [],
      });
      assert.deepStrictEqual(result.semanticOwner.spec, {
        status: 'resolved',
        id: 'CLI-ORIENT',
        path: 'specs/cli/orient/orient.spec.md',
      });
      assert.deepStrictEqual(
        result.active.map((relation) => relation.taskId),
        ['ORIENT-nav']
      );
      assert.deepStrictEqual(result.findings, []);
    });
  });

  it('fails closed when the explicit ID maps to more than one V2 spec', () => {
    fixture((root, source) => {
      mkdirSync(join(root, 'specs', 'duplicate'), { recursive: true });
      writeFileSync(
        join(root, 'specs', 'duplicate', 'duplicate.spec.md'),
        '<!--SECTION:SPEC_ID-->\nCLI-ORIENT\n<!--/SECTION:SPEC_ID-->'
      );
      const result = resolveOrientFileRelations(root, source, {
        file: 'query',
        spec: 'CLI-ORIENT',
        tasks: [],
        consumers: [],
      });
      assert.strictEqual(result.semanticOwner.spec.status, 'ambiguous');
      assert.deepStrictEqual(
        result.findings.map((finding) => finding.code),
        ['SDD_FILE_SPEC_OWNER_AMBIGUOUS']
      );
    });
  });

  it('--history changes only bounded rendering detail and JSON stays versioned', () => {
    fixture((root, source) => {
      const result = resolveOrientFileRelations(root, source, {
        file: 'query',
        spec: 'CLI-ORIENT',
        tasks: [],
        consumers: [],
      });
      const before = structuredClone(result);
      assert.match(renderFileRelations(result, false).join('\n'), /use --history to expand/);
      assert.doesNotMatch(renderFileRelations(result, true).join('\n'), /use --history to expand/);
      assert.deepStrictEqual(result, before);
      assert.deepStrictEqual(fileRelationsDocument(result), {
        schema: 'gennady.orient.file-relations',
        version: 1,
        result,
      });
      assert.ok(renderFileRelations(result, true, Number.POSITIVE_INFINITY).length < 30);
    });
  });

  it('exposes the versioned result and history through the actual CLI adapter', () => {
    fixture((root, source) => {
      const json = spawnSync(
        process.execPath,
        ['--import', TSX_IMPORT, ORIENT_CMD, '--file', source, '--json'],
        {
          cwd: root,
          encoding: 'utf8',
        }
      );
      assert.strictEqual(json.status, 0, json.stderr);
      const document = JSON.parse(json.stdout) as { schema?: string; version?: number };
      assert.deepStrictEqual(
        { schema: document.schema, version: document.version },
        { schema: 'gennady.orient.file-relations', version: 1 }
      );

      const history = spawnSync(
        process.execPath,
        ['--import', TSX_IMPORT, ORIENT_CMD, '--file', source, '--history'],
        { cwd: root, encoding: 'utf8' }
      );
      assert.strictEqual(history.status, 0, history.stderr);
      assert.match(history.stdout, /SPEC: CLI-ORIENT -> specs\/cli\/orient\/orient\.spec\.md/);
      assert.doesNotMatch(history.stdout, /use --history to expand/);
    });
  });

  it('keeps a legacy @tasks-only file V1-lenient', () => {
    fixture((root, source) => {
      mkdirSync(join(root, 'tasks', 'cli'), { recursive: true });
      const result = resolveOrientFileRelations(root, source, {
        file: 'query',
        tasks: ['DP-fields'],
        consumers: [],
      });
      assert.strictEqual(result.flow, 'v1');
      assert.deepStrictEqual(result.findings, []);
    });
  });

  it('fails closed for a missing @spec in a fully V2 repository', () => {
    fixture((root, source) => {
      const result = resolveOrientFileRelations(root, source, {
        file: 'query',
        tasks: [],
        consumers: [],
      });
      assert.strictEqual(result.flow, 'v2');
      assert.deepStrictEqual(
        result.findings.map((finding) => finding.code),
        ['SDD_FILE_SPEC_OWNER_UNRESOLVED']
      );
    });
  });

  it('keeps malformed and duplicate @spec declarations strict and unresolved', () => {
    fixture((root, source) => {
      for (const header of [
        { file: 'query', spec: '', specCount: 1, tasks: [], consumers: [] },
        { file: 'query', spec: '', specCount: 2, tasks: [], consumers: [] },
      ]) {
        const result = resolveOrientFileRelations(root, source, header);
        assert.strictEqual(result.flow, 'v2');
        assert.deepStrictEqual(
          result.findings.map((finding) => finding.code),
          ['SDD_FILE_SPEC_OWNER_UNRESOLVED']
        );
      }
    });
  });

  it('keeps legacy tickets grandfathered inside a mixed corpus', () => {
    fixture((root, source) => {
      mkdirSync(join(root, 'tasks', 'cli'), { recursive: true });
      const ticket = join(root, 'specs', 'cli', 'orient', 'orient.task.ORIENT-nav.md');
      writeFileSync(ticket, readFileSync(ticket, 'utf8').replace(/  - Contract:.*\n/, ''));
      const result = resolveOrientFileRelations(root, source, {
        file: 'query',
        spec: 'CLI-ORIENT',
        tasks: [],
        consumers: [],
      });
      assert.deepStrictEqual(result.findings, []);
      assert.deepStrictEqual(
        result.active.map((relation) => relation.taskId),
        ['ORIENT-nav']
      );
    });
  });
});
