// @file: CLI-level FO-4 ownership findings and V1/V2 flow-gating regressions.
// @consumers: sdd-check.cmd
// @tasks: N/A

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

type CheckModule = typeof import('../sdd-check.cmd.ts');

let mod: CheckModule;
let originalArgv: string[];
let originalExit: typeof process.exit;

function argv(...rest: string[]): string[] {
  return ['node', 'gennady', 'sdd-check', ...rest];
}

function git(root: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'commit.gpgSign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: root,
    stdio: 'pipe',
  });
}

function spec(id: string): string {
  return `<!--SECTION:SPEC_ID-->\n${id}\n<!--/SECTION:SPEC_ID-->\n`;
}

function activeTicket(taskId: string, specName: string, target = 'src/value.ts'): string {
  return [
    '<!--SECTION:META-->',
    `- **Task-ID:** ${taskId}`,
    '- **Status:** [~] IN_PROGRESS',
    '- **Depends on:** none',
    '- **Spec References:**',
    `  - Contract: [${specName}](./${specName.toLowerCase()}.spec.md)`,
    '<!--/SECTION:META-->',
    '<!--SECTION:PHASES_OVERVIEW-->',
    '| ID | Kind | Deps | Status |',
    '|----|------|------|--------|',
    '| P1 | impl | — | [~] IN_PROGRESS |',
    '<!--/SECTION:PHASES_OVERVIEW-->',
    '<!--SECTION:PHASE_P1-->',
    '- **Target Files:**',
    `  - ${target}`,
    '- **Deleted Files:**',
    '  - none',
    '<!--/SECTION:PHASE_P1-->',
    '<!--SECTION:EXECUTION_LOG-->',
    '- pending',
    '<!--/SECTION:EXECUTION_LOG-->',
  ].join('\n');
}

function fixture(options: {
  sourceHeader: string;
  tickets?: Array<{ id: string; spec: string }>;
  otherSpec?: boolean;
  legacy?: boolean;
  migratedMixed?: boolean;
  baselineSource?: string;
}): { root: string; source: string } {
  const root = mkdtempSync(join(tmpdir(), 'sdd-check-ownership-'));
  mkdirSync(join(root, 'specs', 'app'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  if (options.legacy) mkdirSync(join(root, 'tasks', 'app'), { recursive: true });
  if (options.migratedMixed) {
    mkdirSync(join(root, 'tasks', 'legacy'), { recursive: true });
    writeFileSync(join(root, 'specs', 'app', 'app.3-tasks.md'), '# migrated tracker\n');
  }
  writeFileSync(join(root, 'package.json'), '{}\n');
  writeFileSync(join(root, 'specs', 'app', 'app.spec.md'), spec('APP'));
  if (options.otherSpec) {
    writeFileSync(join(root, 'specs', 'app', 'other.spec.md'), spec('OTHER'));
  }
  for (const ticket of options.tickets ?? [{ id: 'APP-work', spec: 'APP' }]) {
    writeFileSync(
      join(root, 'specs', 'app', `app.task.${ticket.id}.md`),
      activeTicket(ticket.id, ticket.spec)
    );
  }
  const source = join(root, 'src', 'value.ts');
  if (options.baselineSource !== undefined) writeFileSync(source, options.baselineSource);
  git(root, 'init', '-q');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'fixture baseline');
  writeFileSync(source, `${options.sourceHeader}\nexport const value = 1;\n`);
  return { root, source };
}

describe('sdd-check file ownership', () => {
  before(async () => {
    originalArgv = process.argv;
    originalExit = process.exit;
    process.argv = ['node', 'gennady', 'sdd-check'];
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    mod = await import('../sdd-check.cmd.ts');
  });

  after(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
  });

  it('accepts one resolved owner and one active writer through the real --changed path', async () => {
    const { root } = fixture({
      sourceHeader: '// @file: value\n// @spec: APP',
    });
    try {
      const result = await mod.run(argv('--changed', root));
      assert.strictEqual(result.exitCode, 0, result.text);
      assert.match(result.text, /✅ clean/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed for an orphan @spec and for forbidden V2 @tasks', async () => {
    for (const testCase of [
      {
        header: '// @file: value\n// @spec: MISSING',
        code: 'SDD_FILE_SPEC_OWNER_UNRESOLVED',
      },
      {
        header: '// @file: value\n// @spec: APP\n// @tasks: APP-old',
        code: 'SDD_FILE_V2_TASKS_FORBIDDEN',
      },
    ]) {
      const { root } = fixture({ sourceHeader: testCase.header });
      try {
        const result = await mod.run(argv('--changed', root));
        assert.strictEqual(result.exitCode, 1, result.text);
        assert.match(result.text, new RegExp(testCase.code));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it('runs the same orphan-owner resolution during a real --all corpus scan', async () => {
    const { root } = fixture({
      sourceHeader: '// @file: value\n// @spec: MISSING',
    });
    try {
      const result = await mod.run(argv('--all', root));
      assert.strictEqual(result.exitCode, 1, result.text);
      assert.match(result.text, /src\/value\.ts: error: SDD_FILE_SPEC_OWNER_UNRESOLVED/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed when one explicit @spec ID resolves to multiple canonical specs', async () => {
    const { root } = fixture({
      sourceHeader: '// @file: value\n// @spec: APP',
    });
    try {
      mkdirSync(join(root, 'specs', 'duplicate'), { recursive: true });
      writeFileSync(join(root, 'specs', 'duplicate', 'duplicate.spec.md'), spec('APP'));
      const result = await mod.run(argv('--changed', root));
      assert.strictEqual(result.exitCode, 1, result.text);
      assert.match(result.text, /SDD_FILE_SPEC_OWNER_AMBIGUOUS/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed for multiple active writers and active spec mismatch', async () => {
    const collision = fixture({
      sourceHeader: '// @file: value\n// @spec: APP',
      tickets: [
        { id: 'APP-one', spec: 'APP' },
        { id: 'APP-two', spec: 'APP' },
      ],
    });
    try {
      const result = await mod.run(argv('--changed', collision.root));
      assert.strictEqual(result.exitCode, 1, result.text);
      assert.match(result.text, /SDD_FILE_ACTIVE_WRITERS_COLLISION/);
    } finally {
      rmSync(collision.root, { recursive: true, force: true });
    }

    const mismatch = fixture({
      sourceHeader: '// @file: value\n// @spec: APP',
      tickets: [{ id: 'OTHER-work', spec: 'OTHER' }],
      otherSpec: true,
    });
    try {
      const result = await mod.run(argv('--changed', mismatch.root));
      assert.strictEqual(result.exitCode, 1, result.text);
      assert.match(result.text, /SDD_FILE_ACTIVE_SPEC_MISMATCH/);
    } finally {
      rmSync(mismatch.root, { recursive: true, force: true });
    }
  });

  it('does not apply V2 ownership diagnostics to an untouched mixed-repo V1 source', async () => {
    const legacyHeader = '// @file: value\n// @tasks: TSK-01';
    const { root } = fixture({
      sourceHeader: legacyHeader,
      baselineSource: `${legacyHeader}\nexport const value = 0;\n`,
      legacy: true,
    });
    try {
      const result = await mod.run(argv('--changed', root));
      assert.strictEqual(result.exitCode, 0, result.text);
      assert.doesNotMatch(result.text, /SDD_FILE_/);
      assert.doesNotMatch(result.text, /SDD_TASKS_APPEND_ONLY_REGRESSION/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps --all file accounting and diagnostics unchanged when untouched V1 sources are added', async () => {
    const legacyHeader = '// @file: value\n// @tasks: TSK-01';
    const { root } = fixture({
      sourceHeader: legacyHeader,
      legacy: true,
    });
    try {
      const before = await mod.run(argv('--all', root));
      writeFileSync(join(root, 'src', 'legacy.go'), `${legacyHeader}\npackage demo\n`);
      mkdirSync(join(root, 'scripts'), { recursive: true });
      writeFileSync(join(root, 'scripts', 'legacy.py'), `${legacyHeader}\nvalue = 1\n`);
      const after = await mod.run(argv('--all', root));

      assert.deepEqual(after, before);
      assert.doesNotMatch(after.text, /SDD_FILE_/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('treats an exact target of a co-located V2 ticket as strict inside a mixed repository', async () => {
    const { root } = fixture({
      sourceHeader: '// @file: value',
      migratedMixed: true,
    });
    try {
      const result = await mod.run(argv('--changed', root));
      assert.strictEqual(result.exitCode, 1, result.text);
      assert.match(result.text, /SDD_FILE_SPEC_OWNER_UNRESOLVED/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps a changed file strict when its HEAD header had @spec but the current header drops it', async () => {
    const { root } = fixture({
      sourceHeader: '// @file: value',
      baselineSource: '// @file: value\n// @spec: APP\nexport const value = 0;\n',
      legacy: true,
    });
    try {
      const result = await mod.run(argv('--changed', root));
      assert.strictEqual(result.exitCode, 1, result.text);
      assert.match(result.text, /SDD_FILE_SPEC_OWNER_UNRESOLVED/);
      assert.doesNotMatch(result.text, /SDD_TASKS_APPEND_ONLY_REGRESSION/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('gates legacy @tasks append-only to V1 and permits V2 replacement by @spec', async () => {
    const v2 = fixture({
      sourceHeader: '// @file: value\n// @spec: APP',
      baselineSource:
        '// @file: value\n// @spec: APP\n// @tasks: TSK-01\nexport const value = 0;\n',
    });
    try {
      const result = await mod.run(argv('--changed', v2.root));
      assert.doesNotMatch(result.text, /SDD_TASKS_APPEND_ONLY_REGRESSION/);
    } finally {
      rmSync(v2.root, { recursive: true, force: true });
    }

    const v1 = fixture({
      sourceHeader: '// @file: value',
      baselineSource: '// @file: value\n// @tasks: TSK-01\nexport const value = 0;\n',
      legacy: true,
    });
    try {
      const result = await mod.run(argv('--changed', v1.root));
      assert.strictEqual(result.exitCode, 1, result.text);
      assert.match(result.text, /SDD_TASKS_APPEND_ONLY_REGRESSION/);
      assert.doesNotMatch(result.text, /SDD_FILE_/);
    } finally {
      rmSync(v1.root, { recursive: true, force: true });
    }
  });
});
