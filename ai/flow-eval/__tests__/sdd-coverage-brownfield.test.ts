// @file: No-model existing-project coverage controls; real files, baseline adapter and owned cleanup.
// @spec: AI-SKILLS
// @consumers: SDD coverage pre-integration qualification

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolveSddCoverage } from '../../../shared/sdd/coverage.ts';
import type { CoverageInput } from '../../../shared/sdd/coverage.types.ts';
import { extractHeader } from '../../../cli/cmd/orient/core/extract-header.ts';
import { resolveOrientFileRelations } from '../../../cli/cmd/orient/core/resolve-file-relations.ts';
import { BUILTIN_RULE_SOURCES } from '../../../shared/rules/builtin-rule-sources.ts';
import { runSddVerifyFacade } from '../../../cli/cmd/sdd-verify/sdd-verify.facade.ts';
import { runCli, cleanTestChildEnv } from '../../../cli/__tests__/tool-behavior/run-cli.ts';
import { readSddCoverage } from '../../../shared/sdd/coverage-repository.ts';
import { PHASE_RECEIPTS_SCHEMA_MARKER } from '../../../shared/sdd/execution-log.ts';

test('real headerless files reproduce the current adapter wall while the core permits only preparation', () => {
  const root = mkdtempSync(join(tmpdir(), 'gennady-coverage-control-'));
  const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
  try {
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'specs/core'), { recursive: true });
    writeFileSync(
      join(root, 'specs/core/core.spec.md'),
      '<!--SECTION:SPEC_ID-->\nCORE\n<!--/SECTION:SPEC_ID-->\n'
    );
    writeFileSync(join(root, 'src/value.ts'), 'export const value = 7;\n');
    writeFileSync(join(root, 'src/unrelated.ts'), 'export const unrelated = true;\n');
    const untouched = digest(join(root, 'src/unrelated.ts'));
    const before = readFileSync(join(root, 'src/value.ts'), 'utf8');
    const baseline = resolveOrientFileRelations(
      root,
      join(root, 'src/value.ts'),
      extractHeader(before)
    );
    assert.ok(
      baseline.findings.some((finding) => finding.code === 'SDD_FILE_SPEC_OWNER_UNRESOLVED')
    );
    const input: CoverageInput = {
      stage: 'preflight',
      selection: { kind: 'phase', task: 'CORE-work', phase: 'P1' },
      specs: [
        { id: 'CORE', path: 'specs/core/core.spec.md', children: [], files: ['src/value.ts'] },
      ],
      targets: [
        {
          task: 'CORE-work',
          phase: 'P1',
          specId: 'CORE',
          path: 'src/value.ts',
          operation: 'write',
        },
      ],
      observations: [{ path: 'src/value.ts', state: 'file', specIds: [] }],
    };
    assert.equal(resolveSddCoverage(input).canProceed, true);
    assert.equal(resolveSddCoverage(input).complete, false);
    assert.equal(resolveSddCoverage({ ...input, stage: 'phase-exit' }).canProceed, false);
    // This is a host reference action, not a claim that a model or installed CLI performed it.
    writeFileSync(join(root, 'src/value.ts'), `// @spec: CORE\n${before}`);
    const header = extractHeader(readFileSync(join(root, 'src/value.ts'), 'utf8'));
    assert.equal(
      resolveSddCoverage({
        ...input,
        stage: 'phase-exit',
        observations: [{ path: 'src/value.ts', state: 'file', specIds: [header.spec as string] }],
      }).complete,
      true
    );
    assert.equal(digest(join(root, 'src/unrelated.ts')), untouched);
    assert.equal(existsSync(join(root, 'node_modules')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  assert.equal(existsSync(root), false);
});

test('real brownfield lifecycle: pending dispatch, actual gates, strict complete/close and post-repair ownership', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gennady-coverage-lifecycle-'));
  const put = (path: string, content: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  const section = (id: string, content: string) =>
    `<!--SECTION:${id}-->\n${content}\n<!--/SECTION:${id}-->`;
  const taskPath = 'specs/core/core.task.CORE-work.md';
  const source = 'src/value.js';
  const correct = '// @spec: CORE\nmodule.exports = 7;\n';
  const ownRoot = resolve(import.meta.dirname, '../../..');
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      ['-C', root, '-c', 'user.name=coverage-test', '-c', 'user.email=coverage@test', ...args],
      { encoding: 'utf8', env: cleanTestChildEnv(process.env) }
    );
  try {
    put('package.json', JSON.stringify({ name: 'coverage-lifecycle', private: true }));
    put(
      'specs/core/core.spec.md',
      section('SPEC_ID', 'CORE') +
        '\n' +
        section(
          'FILE_STRUCTURE',
          '**File Mapping:**\n- `src/value.js`: value\n- `src/future.js`: another ticket output'
        )
    );
    put(source, 'module.exports = 7;\n');
    for (let i = 0; i < 100; i++) put(`unclaimed/old-${i}.js`, 'module.exports = false;\n');
    for (const path of BUILTIN_RULE_SOURCES) put(path, readFileSync(join(ownRoot, path), 'utf8'));
    put(
      'gennady.yaml',
      [
        'verify:',
        '  sdd:',
        '    mapping: { impl: scoped-check }',
        '  presets:',
        '    node:',
        '      phases:',
        '        scoped-check: { include: [proof] }',
        '      steps:',
        '        value-proof:',
        '          tags: [proof]',
        '          needs: []',
        '          executor: local',
        '          effect: observe',
        '          command:',
        '            argv: [node, -e, "if (require(\'./src/value.js\') !== 7) process.exit(1)"]',
        '            cwd: .',
        '          timeout: 10s',
        '          onFailure: stop-phase',
      ].join('\n')
    );
    put(
      taskPath,
      [
        '# Task: CORE-work',
        section(
          'META',
          '- **Task-ID:** CORE-work\n- **Status:** [~] IN_PROGRESS\n- **Scope:** core\n- **Dependencies:** None'
        ),
        section(
          'PHASES_OVERVIEW',
          '| ID | Kind | Deps | Status |\n|---|---|---|---|\n| P1 | impl | — | [ ] |'
        ),
        section(
          'PHASE_P1',
          '- **Objective:** value is seven\n- **Rules:**\n- **Target Files:** `src/value.js`\n- **Inputs:** none\n- **Exit:** real check passes'
        ),
        section('VERIFICATION', '| Command | Required by | Role |\n|---|---|---|'),
        section(
          'EXECUTION_LOG',
          '### Round 1 — 2026-10-27, initial\n#### P1\n- [ ] `<ts>` DONE\n**Handoff →** artifacts: [...]; decisions: [...]; open: [...]; deviations: [...]\n#### Round close\n- [ ] `<ts>` DONE\n' +
            PHASE_RECEIPTS_SCHEMA_MARKER
        ),
      ].join('\n')
    );
    git('init', '-q');
    git('add', '.');
    git('commit', '-qm', 'fixture baseline');
    const dispatch = runCli(['sdd-task', taskPath, '--phase', 'P1'], root);
    assert.equal(dispatch.exitCode, 0, dispatch.stderr + dispatch.stdout);
    const missing = await runSddVerifyFacade(root, taskPath, 'P1', { homeDirectory: root });
    assert.equal(missing.report?.verdict, 'pass', missing.stderr);
    assert.notEqual(missing.exitCode, 0);
    assert.match(missing.stderr, /MISSING_HEADER/);
    assert.match(readFileSync(join(root, taskPath), 'utf8'), /\*\*VIOLATION\*\*/);
    put(source, correct.replace('= 7', '= 8'));
    const broken = await runSddVerifyFacade(root, taskPath, 'P1', { homeDirectory: root });
    assert.equal(broken.report?.verdict, 'fail', broken.stderr);
    assert.notEqual(broken.exitCode, 0);
    put(source, correct);
    const config = readFileSync(join(root, 'gennady.yaml'), 'utf8');
    const stripCommand = JSON.stringify(
      "require('node:fs').writeFileSync('src/value.js', 'module.exports = 7;\\n')"
    );
    put(
      'gennady.yaml',
      config
        .replace('          needs: []', '          needs: [owner-strip]')
        .replace(
          '      steps:\n',
          [
            '      steps:',
            '        owner-strip:',
            '          tags: [proof]',
            '          needs: []',
            '          executor: local',
            '          effect: repair',
            '          command:',
            `            argv: [node, -e, ${stripCommand}]`,
            '            cwd: .',
            '          timeout: 10s',
            '          onFailure: stop-phase',
            '          writes: { root: ., include: [src/value.js], exclude: [".git/**"] }',
            '',
          ].join('\n')
        )
    );
    const repaired = await runSddVerifyFacade(root, taskPath, 'P1', { homeDirectory: root });
    assert.equal(repaired.report?.verdict, 'pass', repaired.stderr);
    assert.ok(
      repaired.report?.results.some(
        (result) =>
          result.stepId.endsWith('owner-strip') &&
          result.exitCode === 0 &&
          result.process !== undefined
      )
    );
    assert.notEqual(repaired.exitCode, 0);
    assert.match(repaired.stderr, /MISSING_HEADER/);
    assert.equal(readFileSync(join(root, source), 'utf8'), 'module.exports = 7;\n');
    put('gennady.yaml', config);
    put(source, correct);
    const pass = await runSddVerifyFacade(root, taskPath, 'P1', { homeDirectory: root });
    assert.equal(pass.exitCode, 0, pass.stderr);
    const completeArgs = [
      'sdd-log',
      taskPath,
      'complete',
      'artifacts: [src/value.js]; decisions: [none]; open: [none]; deviations: []',
      '--phase',
      'P1',
    ];
    put(source, 'module.exports = 7;\n');
    const before = readFileSync(join(root, taskPath), 'utf8');
    const removed = runCli(completeArgs, root);
    assert.notEqual(removed.exitCode, 0, removed.stderr + removed.stdout);
    assert.match(removed.stderr + removed.stdout, /current PASS|MISSING_HEADER|REMOVED_OWNERSHIP/);
    assert.ok(
      readSddCoverage(
        root,
        { kind: 'phase', task: taskPath, phase: 'P1' },
        'phase-exit'
      ).coverage.findings.some((finding) =>
        ['MISSING_HEADER', 'REMOVED_OWNERSHIP'].includes(finding.code)
      )
    );
    assert.equal(readFileSync(join(root, taskPath), 'utf8'), before);
    put(source, correct);
    const complete = runCli(completeArgs, root);
    assert.equal(complete.exitCode, 0, complete.stderr + complete.stdout);
    const close = runCli(['sdd-log', taskPath, 'close'], root);
    assert.equal(close.exitCode, 0, close.stderr + close.stdout);
    const currentSpec = readFileSync(join(root, 'specs/core/core.spec.md'), 'utf8');
    put('specs/core/core.spec.md', currentSpec.replace('- `src/value.js`: value\n', ''));
    const unmapped = runCli(['sdd-log', taskPath, 'audit-receipt', 'PASS'], root);
    assert.notEqual(unmapped.exitCode, 0);
    assert.match(unmapped.stderr + unmapped.stdout, /MAPPING_REQUIRED/);
    put('specs/core/core.spec.md', currentSpec);
    const beforeAudit = readFileSync(join(root, 'specs/core/core.spec.md'), 'utf8');
    const pendingAudit = runCli(['sdd-log', taskPath, 'audit-receipt', 'PASS'], root);
    assert.notEqual(pendingAudit.exitCode, 0);
    assert.match(pendingAudit.stderr + pendingAudit.stdout, /PLANNED_FILE/);
    assert.equal(readFileSync(join(root, 'specs/core/core.spec.md'), 'utf8'), beforeAudit);
    put('src/future.js', '// @spec: CORE\nmodule.exports = 9;\n');
    const completeAudit = runCli(['sdd-log', taskPath, 'audit-receipt', 'PASS'], root);
    assert.equal(completeAudit.exitCode, 0, completeAudit.stderr + completeAudit.stdout);
    assert.equal(
      readFileSync(join(root, 'unclaimed/old-99.js'), 'utf8'),
      'module.exports = false;\n'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  assert.equal(existsSync(root), false);
});
