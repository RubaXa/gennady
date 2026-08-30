// @file: Structural phase-context resolution for sdd-verify.
// @consumers: N/A
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolvePhaseContext } from '../phase-context.ts';

function fixture(
  kind: string,
  targets: string[],
  withVerification = true
): { root: string; ticket: string } {
  const root = mkdtempSync(join(tmpdir(), 'sdd-verify-context-'));
  mkdirSync(join(root, 'specs', 'app'), { recursive: true });
  mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true });
  writeFileSync(join(root, 'node_modules', '.bin', 'gennady'), '', 'utf-8');
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'phase-context-fixture',
      scripts: {
        'type-check': 'node --check index.js',
        test: 'node --test',
        'test:coverage': 'c8 node --test',
        format: 'prettier --check .',
        'format:fix': 'prettier --write',
        lint: 'gennady lint',
        'lint:fix': 'gennady lint --autofix',
        fix: 'npm run format:fix -- . && npm run lint:fix -- .',
      },
    }),
    'utf-8'
  );
  for (const target of targets.filter(
    (path) => !/[*?[\]{}]/.test(path) && !path.startsWith('..')
  )) {
    const path = join(root, target);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, 'x', 'utf-8');
  }
  writeFileSync(join(root, 'specs/app/app.spec.md'), '# spec', 'utf-8');
  const ticket = 'specs/app/app.task.TSK-1.md';
  writeFileSync(
    join(root, ticket),
    [
      '<!--SECTION:PHASES_OVERVIEW-->',
      '| ID | Kind | Deps | Status |',
      '|---|---|---|---|',
      `| P1 | ${kind} | — | [ ] |`,
      '<!--/SECTION:PHASES_OVERVIEW-->',
      '<!--SECTION:PHASE_P1-->',
      '- **Target Files:**',
      ...targets.map((target) => `  - ${target}`),
      '<!--/SECTION:PHASE_P1-->',
      ...(withVerification
        ? [
            '<!--SECTION:VERIFICATION-->',
            '| Command | Required by | Role |',
            '|---|---|---|',
            '<!--/SECTION:VERIFICATION-->',
          ]
        : []),
    ].join('\n'),
    'utf-8'
  );
  return { root, ticket };
}

describe('resolvePhaseContext', () => {
  it('rejects an in-project ticket symlink before an atomic receipt can replace the alias', () => {
    const f = fixture('impl', ['src/thing.ts']);
    const lexical = join(f.root, f.ticket);
    const destination = join(f.root, 'specs/app/app.task.actual.md');
    const content = readFileSync(lexical, 'utf-8');
    rmSync(lexical);
    writeFileSync(destination, content, 'utf-8');
    symlinkSync('app.task.actual.md', lexical);
    try {
      const result = resolvePhaseContext(f.ticket, 'P1', f.root);
      assert.strictEqual(result.ok, false);
      if (!result.ok) assert.match(result.message, /regular non-symlink path/);
      assert.strictEqual(lstatSync(lexical).isSymbolicLink(), true);
      assert.strictEqual(readFileSync(destination, 'utf-8'), content);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('derives kind profile, exact targets, and owning spec', () => {
    for (const [kind, profile] of [
      ['bootstrap', 'setup'],
      ['config', 'setup'],
      ['doc', 'setup'],
      ['impl', 'code'],
      ['refactor', 'code'],
      ['fix', 'code'],
      ['test', 'test'],
    ] as const) {
      const f = fixture(kind, ['src/thing.ts', 'src/thing.test.ts']);
      try {
        assert.deepStrictEqual(resolvePhaseContext(f.ticket, 'P1', f.root), {
          ok: true,
          context: {
            profile,
            profileBasis: 'phase-kind',
            targets: ['src/thing.ts', 'src/thing.test.ts'],
            deletedFiles: [],
            specPath: 'specs/app/app.spec.md',
            taskPath: f.ticket,
            phaseId: 'P1',
            verification: [],
            producesCoverage: kind === 'test',
          },
        });
      } finally {
        rmSync(f.root, { recursive: true, force: true });
      }
    }
  });

  it('explicit coverage policy keeps the test profile and separates producer applicability', () => {
    for (const [policy, producesCoverage] of [
      ['not-applicable', false],
      ['required', true],
    ] as const) {
      const f = fixture('test', ['src/thing.test.ts'], false);
      const path = join(f.root, f.ticket);
      const rows =
        policy === 'required'
          ? ['- **Coverage Owner Phase:** P1', '| custom coverage reader | RULE | coverage |']
          : ['- **Coverage Reason:** test verifies schema only; line coverage is meaningless'];
      writeFileSync(
        path,
        [
          readFileSync(path, 'utf-8'),
          '<!--SECTION:VERIFICATION-->',
          '<!--COVERAGE_POLICY:v1-->',
          `- **Coverage Policy:** ${policy}`,
          '| Command | Required by | Role |',
          '|---|---|---|',
          ...rows,
          '<!--/SECTION:VERIFICATION-->',
        ].join('\n'),
        'utf-8'
      );
      if (policy === 'required') {
        const withRule = readFileSync(path, 'utf-8').replace(
          '- **Target Files:**',
          '- **Rules:**\n  - [Coverage](RULE)\n- **Target Files:**'
        );
        writeFileSync(path, withRule, 'utf-8');
      }
      try {
        const result = resolvePhaseContext(f.ticket, 'P1', f.root);
        assert.strictEqual(result.ok, true);
        if (result.ok) {
          assert.strictEqual(result.context.profile, 'test');
          assert.strictEqual(result.context.producesCoverage, producesCoverage);
          if (policy === 'required') assert.strictEqual(result.context.coverageOwner, 'P1');
        }
      } finally {
        rmSync(f.root, { recursive: true, force: true });
      }
    }
  });

  it('runs coverage producer and reader only in the declared owner among two test phases', () => {
    const f = fixture('test', ['src/one.test.ts'], false);
    const path = join(f.root, f.ticket);
    const ticket = readFileSync(path, 'utf-8')
      .replace('| P1 | test | — | [ ] |', '| P1 | test | — | [ ] |\n| P2 | test | P1 | [ ] |')
      .replace(
        '<!--/SECTION:PHASE_P1-->',
        '<!--/SECTION:PHASE_P1-->\n<!--SECTION:PHASE_P2-->\n- **Rules:**\n  - [Coverage](COV)\n- **Target Files:**\n  - src/two.test.ts\n<!--/SECTION:PHASE_P2-->'
      );
    mkdirSync(join(f.root, 'src'), { recursive: true });
    writeFileSync(join(f.root, 'src/two.test.ts'), 'x', 'utf-8');
    writeFileSync(
      path,
      [
        ticket,
        '<!--SECTION:VERIFICATION-->',
        '<!--COVERAGE_POLICY:v1-->',
        '- **Coverage Policy:** required',
        '- **Coverage Owner Phase:** P2',
        '| Command | Required by | Role |',
        '|---|---|---|',
        '| custom coverage reader | COV | coverage |',
        '<!--/SECTION:VERIFICATION-->',
      ].join('\n'),
      'utf-8'
    );
    try {
      const ordinary = resolvePhaseContext(f.ticket, 'P1', f.root);
      const owner = resolvePhaseContext(f.ticket, 'P2', f.root);
      assert.strictEqual(ordinary.ok, true);
      assert.strictEqual(owner.ok, true);
      if (ordinary.ok) {
        assert.strictEqual(ordinary.context.profile, 'test');
        assert.strictEqual(ordinary.context.producesCoverage, false);
        assert.deepStrictEqual(ordinary.context.verification, []);
        assert.strictEqual(ordinary.context.coverageOwner, 'P2');
      }
      if (owner.ok) {
        assert.strictEqual(owner.context.profile, 'test');
        assert.strictEqual(owner.context.producesCoverage, true);
        assert.deepStrictEqual(owner.context.verification, [
          { command: 'custom coverage reader', role: 'coverage' },
        ]);
      }
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('fails before tools when a schema-aware ticket has no coverage decision', () => {
    const f = fixture('test', ['src/thing.test.ts'], false);
    const path = join(f.root, f.ticket);
    writeFileSync(
      path,
      `${readFileSync(path, 'utf-8')}\n<!--SECTION:VERIFICATION-->\n<!--COVERAGE_POLICY:v1-->\n| Command | Required by | Role |\n|---|---|---|\n<!--/SECTION:VERIFICATION-->`,
      'utf-8'
    );
    try {
      const result = resolvePhaseContext(f.ticket, 'P1', f.root);
      assert.strictEqual(result.ok, false);
      if (!result.ok) assert.match(result.message, /coverage policy is invalid/);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('fails before tools when the Verification section is absent', () => {
    const f = fixture('impl', ['src/thing.ts'], false);
    try {
      const result = resolvePhaseContext(f.ticket, 'P1', f.root);
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.match(result.message, /Verification table is invalid/);
        assert.match(result.message, /missing canonical header/);
      }
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('selects only §Verification rows required by the phase rules, preserving exact order', () => {
    const f = fixture('impl', ['src/thing.ts'], false);
    const path = join(f.root, f.ticket);
    const original = readFileSync(path, 'utf-8');
    writeFileSync(
      path,
      [
        original.replace(
          '- **Target Files:**',
          '- **Rules:**\n  - [TypeScript](ai/directives/typescript-rules.xml)\n- **Target Files:**'
        ),
        '<!--SECTION:VERIFICATION-->',
        '| Command | Required by | Role |',
        '|---|---|---|',
        '| npm run first | typescript-rules | extra |',
        '| npm run unrelated | other-rule | extra |',
        '| npm run second | ai/directives/typescript-rules.xml | extra |',
        '<!--/SECTION:VERIFICATION-->',
      ].join('\n'),
      'utf-8'
    );
    try {
      const result = resolvePhaseContext(f.ticket, 'P1', f.root);
      assert.strictEqual(result.ok, true);
      if (result.ok)
        assert.deepStrictEqual(result.context.verification, [
          { command: 'npm run first', role: 'extra' },
          { command: 'npm run second', role: 'extra' },
        ]);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('rejects a malformed Verification row instead of silently omitting it', () => {
    const f = fixture('impl', ['src/thing.ts'], false);
    const path = join(f.root, f.ticket);
    writeFileSync(
      path,
      [
        readFileSync(path, 'utf-8'),
        '<!--SECTION:VERIFICATION-->',
        '| Command | Required by | Role |',
        '|---|---|---|',
        '| npm run first | RULE | extra | unexpected |',
        '<!--/SECTION:VERIFICATION-->',
      ].join('\n'),
      'utf-8'
    );
    try {
      const result = resolvePhaseContext(f.ticket, 'P1', f.root);
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.match(result.message, /Verification table is invalid/);
        assert.match(result.message, /expected exactly 3 cells/);
      }
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('fails teachingly for a missing phase, glob, missing target, directory, or escape', () => {
    const cases: Array<[string[], string, RegExp]> = [
      [['src/a.ts'], 'P9', /phase 'P9' is absent/],
      [['src/*.ts'], 'P1', /not a glob/],
      [['src/missing.ts'], 'P1', /Target File path is missing/],
      [['src'], 'P1', /not a regular file/],
      [['../escape.ts'], 'P1', /path segments are forbidden/],
    ];
    for (const [targets, phase, expected] of cases) {
      const f = fixture('impl', targets);
      if (targets[0] === 'src/missing.ts') rmSync(join(f.root, 'src/missing.ts'));
      if (targets[0] === 'src') {
        rmSync(join(f.root, 'src'));
        mkdirSync(join(f.root, 'src'), { recursive: true });
      }
      try {
        const result = resolvePhaseContext(f.ticket, phase, f.root);
        assert.strictEqual(result.ok, false);
        if (!result.ok) assert.match(result.message, expected);
      } finally {
        rmSync(f.root, { recursive: true, force: true });
      }
    }
  });

  it('code/test require an existing owning spec, while setup may bootstrap without one', () => {
    for (const [kind, allowed] of [
      ['impl', false],
      ['test', false],
      ['bootstrap', true],
    ] as const) {
      const f = fixture(kind, ['src/a.ts']);
      rmSync(join(f.root, 'specs/app/app.spec.md'));
      try {
        const result = resolvePhaseContext(f.ticket, 'P1', f.root);
        assert.strictEqual(result.ok, allowed);
        if (!result.ok)
          assert.match(result.message, /owning spec is missing.*refuses to omit --spec/);
      } finally {
        rmSync(f.root, { recursive: true, force: true });
      }
    }
  });

  it('rejects a Target File symlink that canonically escapes the project', () => {
    const f = fixture('impl', ['src/link.ts']);
    const outside = mkdtempSync(join(tmpdir(), 'sdd-verify-outside-'));
    writeFileSync(join(outside, 'outside.ts'), 'x', 'utf-8');
    rmSync(join(f.root, 'src/link.ts'));
    symlinkSync(join(outside, 'outside.ts'), join(f.root, 'src/link.ts'));
    try {
      const result = resolvePhaseContext(f.ticket, 'P1', f.root);
      assert.strictEqual(result.ok, false);
      if (!result.ok) assert.match(result.message, /symlink component/);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('rejects an exact Target File symlink even when its destination stays inside the project', () => {
    const f = fixture('impl', ['src/link.ts']);
    writeFileSync(join(f.root, 'src/real.ts'), 'x', 'utf-8');
    rmSync(join(f.root, 'src/link.ts'));
    symlinkSync(join(f.root, 'src/real.ts'), join(f.root, 'src/link.ts'));
    try {
      const result = resolvePhaseContext(f.ticket, 'P1', f.root);
      assert.strictEqual(result.ok, false);
      if (!result.ok) assert.match(result.message, /symlink component: src\/link\.ts/);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('rejects a Target File below an in-project symlink directory', () => {
    const f = fixture('impl', ['src/alias/thing.ts']);
    rmSync(join(f.root, 'src/alias'), { recursive: true });
    mkdirSync(join(f.root, 'src/real'), { recursive: true });
    writeFileSync(join(f.root, 'src/real/thing.ts'), 'x', 'utf-8');
    symlinkSync(join(f.root, 'src/real'), join(f.root, 'src/alias'));
    try {
      const result = resolvePhaseContext(f.ticket, 'P1', f.root);
      assert.strictEqual(result.ok, false);
      if (!result.ok) assert.match(result.message, /symlink component: src\/alias/);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('rejects a ticket symlink whose canonical destination escapes the project', () => {
    const f = fixture('impl', ['src/a.ts']);
    const outside = mkdtempSync(join(tmpdir(), 'sdd-verify-ticket-outside-'));
    writeFileSync(join(outside, 'outside.task.md'), 'not trusted', 'utf-8');
    rmSync(join(f.root, f.ticket));
    symlinkSync(join(outside, 'outside.task.md'), join(f.root, f.ticket));
    try {
      const result = resolvePhaseContext(f.ticket, 'P1', f.root);
      assert.strictEqual(result.ok, false);
      if (!result.ok) assert.match(result.message, /ticket symlink resolves outside/);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('treats a dangling symlink as a present Deleted File entry', () => {
    const f = fixture('impl', ['src/a.ts']);
    const ticketPath = join(f.root, f.ticket);
    writeFileSync(
      ticketPath,
      readFileSync(ticketPath, 'utf-8').replace(
        '<!--/SECTION:PHASE_P1-->',
        '- **Deleted Files:**\n  - src/obsolete.ts\n<!--/SECTION:PHASE_P1-->'
      )
    );
    symlinkSync('missing-destination.ts', join(f.root, 'src/obsolete.ts'));
    try {
      const result = resolvePhaseContext(f.ticket, 'P1', f.root);
      assert.strictEqual(result.ok, false);
      if (!result.ok)
        assert.match(result.message, /Deleted File path contains a symlink component/);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });
});
