// @file: Public lint guidance resolves canonical owners and active relations without legacy task-header authority.
// @spec: CLI-LINT
// @consumers: lint command, corrective SDD runtime regression suite

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '../../../..');
const temporary: string[] = [];

function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function fixture(canonical: boolean): string {
  const root = mkdtempSync(join(tmpdir(), 'lint-owner-guidance-'));
  temporary.push(root);
  write(
    root,
    'tasks/old/old.md',
    '- **Task-ID:** TSK-1\n- **Spec References:** [old](old.spec.md)\n'
  );
  write(root, 'specs/old/old.spec.md', '# old\n');
  write(
    root,
    'src/value.ts',
    `// @file: Example value.\n${canonical ? '// @spec: APP\n' : ''}// @consumers: App\n// @tasks: TSK-1\n\n/** @purpose плохой */\nexport const value = 1;\n`
  );
  if (canonical) {
    write(root, 'specs/app/app.spec.md', '<!--SECTION:SPEC_ID-->\nAPP\n<!--/SECTION:SPEC_ID-->\n');
    write(root, 'specs/app/app.3-tasks.md', '# migrated tracker\n');
    write(
      root,
      'specs/app/app.task.APP-work.md',
      [
        '<!--SECTION:META-->',
        '- **Task-ID:** APP-work',
        '- **Status:** [~] IN_PROGRESS',
        '- **Depends on:** none',
        '- **Spec References:**',
        '  - Contract: [APP](./app.spec.md)',
        '<!--/SECTION:META-->',
        '<!--SECTION:PHASES_OVERVIEW-->',
        '| ID | Kind | Deps | Status |',
        '|----|------|------|--------|',
        '| P1 | impl | — | [~] IN_PROGRESS |',
        '<!--/SECTION:PHASES_OVERVIEW-->',
        '<!--SECTION:PHASE_P1-->',
        '- **Target Files:**',
        '  - src/value.ts',
        '<!--/SECTION:PHASE_P1-->',
        '<!--SECTION:EXECUTION_LOG-->',
        '- pending',
        '<!--/SECTION:EXECUTION_LOG-->',
      ].join('\n')
    );
  }
  return root;
}

function lint(root: string): string {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      join(ROOT, 'node_modules/tsx/dist/loader.mjs'),
      join(ROOT, 'cli/gennady.ts'),
      'lint',
      'src/value.ts',
    ],
    { cwd: root, encoding: 'utf8' }
  );
  assert.equal(result.status, 1, result.stderr);
  return result.stdout;
}

afterEach(() => {
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('lint canonical ownership guidance', () => {
  it('does not assign spec/task ownership from legacy @tasks or the old tasks tree', () => {
    const output = lint(fixture(false));
    assert.doesNotMatch(
      output,
      /Relevant specs & tasks|tasks\/old\/old.md|specs\/old\/old.spec.md/
    );
  });
  it('reports the resolved V2 semantic owner and active ticket despite stale legacy header evidence', () => {
    const output = lint(fixture(true));
    assert.match(output, /specs\/app\/app.spec.md/);
    assert.match(output, /specs\/app\/app.task.APP-work.md/);
    assert.doesNotMatch(output, /tasks\/old\/old.md|specs\/old\/old.spec.md/);
  });
});
