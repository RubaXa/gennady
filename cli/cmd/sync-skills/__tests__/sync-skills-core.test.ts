// @file: Unit tests for SyncSkillsCore — scanSkills, collectAndCompareSkills
// @consumers: SyncSkillsCore
// @tasks: TSK-57

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { writeFileSync as _writeFileReal, mkdirSync as _mkdirReal } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanSkills, collectAndCompareSkills } from '../sync-skills-core.ts';
import {
  SyncSkillsResult,
  ERR_SKILLS_SOURCE_NOT_FOUND,
  ERR_SKILLS_SKILL_NOT_FOUND,
} from '../sync-skills.types.ts';
import type { SyncSkillsFileEntry, SyncSkillsOptions } from '../sync-skills.types.ts';
import type { SyncCmdDeps } from '../../../../shared/common/sync/sync-deps.type.ts';

// #region HELPERS

let _tmpDir: string;

function createFile(dir: string, relativePath: string, content: string): void {
  const fullPath = join(dir, relativePath);
  mkdirSync(join(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
}

function createMockDeps(
  sourceDir: string,
  targetDir: string,
  overrides?: Partial<SyncCmdDeps>
): SyncCmdDeps {
  return {
    readFile: (p: string) => readFileSync(p),
    writeFile: (p: string, data: Buffer) => {
      mkdirSync(join(p, '..'), { recursive: true });
      writeFileSync(p, data);
    },
    mkdir: (p: string, opts?: { recursive: boolean }) => mkdirSync(p, opts),
    stat: (p: string) => statSync(p),
    readdir: (p: string) => {
      try {
        return readdirSync(p);
      } catch {
        return [];
      }
    },
    unlink: unlinkSync,
    rmdir: (p: string) => rmSync(p, { recursive: true, force: true }),
    ...overrides,
  };
}

// #endregion

// #region scanSkills

describe('scanSkills', () => {
  let _sourceDir: string;

  beforeEach(() => {
    _tmpDir = mkdtempSync(join(tmpdir(), 'sync-skills-test-'));
    _sourceDir = join(_tmpDir, 'ai', 'skills');
    mkdirSync(_sourceDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(_tmpDir)) rmSync(_tmpDir, { recursive: true });
  });

  it('finds .md files in skill directories', () => {
    createFile(join(_sourceDir, 'sdd-audit'), 'SKILL.md', '# Audit Skill');
    createFile(join(_sourceDir, 'sdd-check'), 'SKILL.md', '# Check Skill');

    const result = scanSkills(_sourceDir);

    assert.ok(result instanceof Map);
    assert.equal(result.size, 2);
    assert.ok(result.has('sdd-audit'));
    assert.ok(result.has('sdd-check'));

    const auditFiles = result.get('sdd-audit')!;
    assert.equal(auditFiles.size, 1);
    assert.ok(auditFiles.has('SKILL.md'));
    assert.ok(Buffer.isBuffer(auditFiles.get('SKILL.md')));
  });

  it('recursively collects files in subdirectories', () => {
    createFile(join(_sourceDir, 'sdd-execute'), 'SKILL.md', '# Execute');
    createFile(join(_sourceDir, 'sdd-execute', 'scripts'), 'verify.sh', '#!/bin/bash');

    const result = scanSkills(_sourceDir);

    const executeFiles = result.get('sdd-execute')!;
    assert.equal(executeFiles.size, 2);
    assert.ok(executeFiles.has('SKILL.md'));
    assert.ok(executeFiles.has('scripts/verify.sh'));
  });

  it('excludes hidden files and system artifacts', () => {
    createFile(join(_sourceDir, 'sdd-audit'), 'SKILL.md', '# Audit');
    createFile(join(_sourceDir, 'sdd-audit'), '.DS_Store', 'x');
    createFile(join(_sourceDir, 'sdd-audit'), '.hidden', 'hidden');

    const result = scanSkills(_sourceDir);

    const files = result.get('sdd-audit')!;
    assert.equal(files.size, 1);
    assert.ok(files.has('SKILL.md'));
    assert.ok(!files.has('.DS_Store'));
    assert.ok(!files.has('.hidden'));
  });

  it('returns empty map for empty source directory', () => {
    const result = scanSkills(_sourceDir);

    assert.equal(result.size, 0);
  });

  it('throws on non-existent source directory', () => {
    assert.throws(
      () => scanSkills(join(_tmpDir, 'nonexistent')),
      (err: NodeJS.ErrnoException) => err.code === 'ENOENT'
    );
  });

  it('filters to specified skill names', () => {
    createFile(join(_sourceDir, 'sdd-audit'), 'SKILL.md', '# Audit');
    createFile(join(_sourceDir, 'sdd-check'), 'SKILL.md', '# Check');
    createFile(join(_sourceDir, 'sdd-execute'), 'SKILL.md', '# Execute');

    const result = scanSkills(_sourceDir, ['sdd-execute']);

    assert.equal(result.size, 1);
    assert.ok(result.has('sdd-execute'));
  });

  it('throws when filtered skill name does not exist', () => {
    createFile(join(_sourceDir, 'sdd-audit'), 'SKILL.md', '# Audit');

    assert.throws(
      () => scanSkills(_sourceDir, ['nonexistent']),
      (err: Error & { code?: string }) =>
        err.code === ERR_SKILLS_SKILL_NOT_FOUND && err.message.includes('Available:')
    );
  });

  it('excludes non-directory entries in source root', () => {
    createFile(_sourceDir, 'not-a-skill.md', 'file at root');

    const result = scanSkills(_sourceDir);

    assert.equal(result.size, 0);
  });
});

// #endregion

// #region collectAndCompareSkills — added / updated / unchanged / deleted

describe('collectAndCompareSkills', () => {
  let _sourceDir: string;
  let _targetDir: string;

  beforeEach(() => {
    _tmpDir = mkdtempSync(join(tmpdir(), 'sync-skills-test-'));
    _sourceDir = join(_tmpDir, 'ai', 'skills');
    _targetDir = join(_tmpDir, '.claude', 'skills');
    mkdirSync(_sourceDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(_tmpDir)) rmSync(_tmpDir, { recursive: true });
  });

  function run(
    opts?: Partial<SyncSkillsOptions>,
    depsOverrides?: Partial<SyncCmdDeps>
  ): SyncSkillsResult {
    const deps = createMockDeps(_sourceDir, _targetDir, depsOverrides);
    return collectAndCompareSkills(deps, {
      sourceDir: _sourceDir,
      targetDir: _targetDir,
      ...opts,
    });
  }

  it('marks files as added when not present in target', () => {
    createFile(join(_sourceDir, 'sdd-audit'), 'SKILL.md', '# Audit');

    const result = run();

    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].status, 'added');
    assert.equal(result.entries[0].skillName, 'sdd-audit');
    assert.equal(result.entries[0].relativePath, 'SKILL.md');
    assert.equal(result.added.length, 1);

    const targetFile = join(_targetDir, 'sdd-audit', 'SKILL.md');
    assert.ok(existsSync(targetFile), 'file should be written to target');
  });

  it('marks files as updated when content differs', () => {
    createFile(join(_sourceDir, 'sdd-audit'), 'SKILL.md', '# New Content');
    mkdirSync(join(_targetDir, 'sdd-audit'), { recursive: true });
    createFile(join(_targetDir, 'sdd-audit'), 'SKILL.md', '# Old Content');

    const result = run();

    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].status, 'updated');
    assert.equal(result.updated.length, 1);

    const targetContent = readFileSync(join(_targetDir, 'sdd-audit', 'SKILL.md'), 'utf-8');
    assert.equal(targetContent, '# New Content');
  });

  it('marks files as unchanged when content matches', () => {
    const content = '# Same Content';
    createFile(join(_sourceDir, 'sdd-audit'), 'SKILL.md', content);
    mkdirSync(join(_targetDir, 'sdd-audit'), { recursive: true });
    createFile(join(_targetDir, 'sdd-audit'), 'SKILL.md', content);

    const result = run();

    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].status, 'unchanged');
    assert.equal(result.unchanged.length, 1);
  });

  it('detects orphan skills (deleted from source but present in target)', () => {
    createFile(join(_sourceDir, 'sdd-audit'), 'SKILL.md', '# Audit');
    mkdirSync(join(_targetDir, 'sdd-audit'), { recursive: true });
    createFile(join(_targetDir, 'sdd-audit'), 'SKILL.md', '# Audit');
    mkdirSync(join(_targetDir, 'sdd-old'), { recursive: true });
    createFile(join(_targetDir, 'sdd-old'), 'SKILL.md', '# Old');
    // A previous sync installed both, so both are ours to prune (SO-2: unmanifested skills
    // are never orphan-deleted — see "leaves a project-authored skill alone" below).
    createFile(_targetDir, '.gennady-synced', 'sdd-audit\nsdd-old\n');

    const result = run();

    assert.equal(result.added.length, 0);
    assert.equal(result.unchanged.length, 1);
    assert.equal(result.deleted.length, 1);
    assert.ok(!existsSync(join(_targetDir, 'sdd-old')));
  });

  it('leaves a project-authored skill alone — it is not in the manifest (SO-2)', () => {
    createFile(join(_sourceDir, 'sdd-audit'), 'SKILL.md', '# Audit');
    mkdirSync(join(_targetDir, 'sdd-audit'), { recursive: true });
    createFile(join(_targetDir, 'sdd-audit'), 'SKILL.md', '# Audit');
    mkdirSync(join(_targetDir, 'our-own-skill'), { recursive: true });
    createFile(join(_targetDir, 'our-own-skill'), 'SKILL.md', '# Ours');
    createFile(_targetDir, '.gennady-synced', 'sdd-audit\n');

    const result = run();

    assert.equal(result.deleted.length, 0);
    assert.ok(existsSync(join(_targetDir, 'our-own-skill', 'SKILL.md')));
  });

  it('prunes nothing on the first run and writes a manifest for the next one (SO-2)', () => {
    createFile(join(_sourceDir, 'sdd-audit'), 'SKILL.md', '# Audit');
    mkdirSync(join(_targetDir, 'sdd-old'), { recursive: true });
    createFile(join(_targetDir, 'sdd-old'), 'SKILL.md', '# Old');

    const result = run();

    assert.equal(result.deleted.length, 0, 'no manifest yet — nothing is ours to delete');
    assert.ok(existsSync(join(_targetDir, 'sdd-old')));
    const manifest = readFileSync(join(_targetDir, '.gennady-synced'), 'utf-8');
    assert.match(manifest, /^sdd-audit$/m);
    assert.doesNotMatch(manifest, /^sdd-old$/m);
  });

  it('orphan detection respects filter — only deletes orphans within filter', () => {
    createFile(join(_sourceDir, 'sdd-execute'), 'SKILL.md', '# Execute');
    mkdirSync(join(_targetDir, 'sdd-execute'), { recursive: true });
    createFile(join(_targetDir, 'sdd-execute'), 'SKILL.md', '# Execute');
    mkdirSync(join(_targetDir, 'sdd-audit'), { recursive: true });
    createFile(join(_targetDir, 'sdd-audit'), 'SKILL.md', '# Audit');

    const result = run({ skillNames: ['sdd-execute'] });

    assert.ok(!result.entries.some((e) => e.status === 'deleted'));
    assert.ok(existsSync(join(_targetDir, 'sdd-audit')));
  });

  it('dry-run does not write or delete files', () => {
    createFile(join(_sourceDir, 'sdd-new'), 'SKILL.md', '# New');
    mkdirSync(join(_targetDir, 'sdd-old'), { recursive: true });
    createFile(join(_targetDir, 'sdd-old'), 'SKILL.md', '# Old');
    // `sdd-old` was installed by an earlier sync, so it is ours to prune (SO-2).
    createFile(_targetDir, '.gennady-synced', 'sdd-old\n');

    const result = run({ dryRun: true });

    assert.ok(!existsSync(join(_targetDir, 'sdd-new')));
    assert.ok(existsSync(join(_targetDir, 'sdd-old')));

    assert.ok(result.entries.some((e) => e.skillName === 'sdd-new' && e.status === 'added'));
    assert.ok(result.entries.some((e) => e.skillName === 'sdd-old' && e.status === 'deleted'));
  });

  it('fresh install — targetDir does not exist, all files added', () => {
    createFile(join(_sourceDir, 'sdd-audit'), 'SKILL.md', '# Audit');
    createFile(join(_sourceDir, 'sdd-check'), 'SKILL.md', '# Check');

    const result = run();

    assert.equal(result.added.length, 2);
    assert.equal(result.entries.length, 2);
    assert.ok(existsSync(_targetDir));
    assert.ok(existsSync(join(_targetDir, 'sdd-audit', 'SKILL.md')));
    assert.ok(existsSync(join(_targetDir, 'sdd-check', 'SKILL.md')));
  });

  it('repeat run — all files unchanged', () => {
    const content = '# Same';
    createFile(join(_sourceDir, 'sdd-audit'), 'SKILL.md', content);
    mkdirSync(join(_targetDir, 'sdd-audit'), { recursive: true });
    createFile(join(_targetDir, 'sdd-audit'), 'SKILL.md', content);

    const result1 = run();

    assert.equal(result1.entries.length, 1);
    assert.equal(result1.entries[0].status, 'unchanged');
  });

  it('entries sorted lexicographically by skillName then relativePath', () => {
    createFile(join(_sourceDir, 'sdd-execute'), 'SKILL.md', '');
    createFile(join(_sourceDir, 'sdd-audit'), 'SKILL.md', '');
    createFile(join(_sourceDir, 'sdd-check'), 'SKILL.md', '');
    createFile(join(_sourceDir, 'sdd-execute'), 'README.md', '');

    const result = run();

    const skillNames = [...new Set(result.entries.map((e) => e.skillName))];
    assert.deepStrictEqual(skillNames, ['sdd-audit', 'sdd-check', 'sdd-execute']);

    const executeEntries = result.entries.filter((e) => e.skillName === 'sdd-execute');
    const executePaths = executeEntries.map((e) => e.relativePath);
    assert.deepStrictEqual(executePaths, ['README.md', 'SKILL.md']);
  });

  it('handles skill with multiple files (added + updated mixed)', () => {
    createFile(join(_sourceDir, 'sdd-audit'), 'SKILL.md', '# v2');
    createFile(join(_sourceDir, 'sdd-audit'), 'README.md', '# NEW');
    mkdirSync(join(_targetDir, 'sdd-audit'), { recursive: true });
    createFile(join(_targetDir, 'sdd-audit'), 'SKILL.md', '# v1');

    const result = run();

    assert.equal(result.added.length, 1);
    assert.equal(result.updated.length, 1);
  });
});

// #endregion

// #region collectAndCompareSkills — manifest lifecycle (SO-2)

describe('collectAndCompareSkills manifest', () => {
  let _sourceDir: string;
  let _targetDir: string;

  beforeEach(() => {
    _tmpDir = mkdtempSync(join(tmpdir(), 'sync-skills-manifest-'));
    _sourceDir = join(_tmpDir, 'ai', 'skills');
    _targetDir = join(_tmpDir, '.claude', 'skills');
    mkdirSync(_sourceDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(_tmpDir)) rmSync(_tmpDir, { recursive: true });
  });

  function run(
    opts?: Partial<SyncSkillsOptions>,
    depsOverrides?: Partial<SyncCmdDeps>
  ): SyncSkillsResult {
    const deps = createMockDeps(_sourceDir, _targetDir, depsOverrides);
    return collectAndCompareSkills(deps, {
      sourceDir: _sourceDir,
      targetDir: _targetDir,
      ...opts,
    });
  }

  function manifestNames(): string[] {
    return readFileSync(join(_targetDir, '.gennady-synced'), 'utf-8')
      .split('\n')
      .filter((l) => l.length > 0 && !l.startsWith('#'));
  }

  function installed(dir: string, name: string, content = '# Skill'): void {
    createFile(join(dir, name), 'SKILL.md', content);
  }

  function refuse(code: string): () => never {
    return () => {
      const err = new Error(`${code}: refused`) as NodeJS.ErrnoException;
      err.code = code;
      throw err;
    };
  }

  it('full sync — manifest records every package-installed skill', () => {
    installed(_sourceDir, 'sdd-audit');
    installed(_sourceDir, 'sdd-check');

    run();

    assert.deepEqual(manifestNames(), [
      'sdd-audit',
      'sdd-audit/SKILL.md',
      'sdd-check',
      'sdd-check/SKILL.md',
    ]);
  });

  // Regression (review, ported from main): rewriting the manifest from this run's skills alone
  // handed the untouched skills back to the project, so the next package version could never
  // prune them.
  it('filtered sync — merges the previous manifest instead of replacing it', () => {
    installed(_sourceDir, 'sdd-execute', '# v2');
    installed(_sourceDir, 'sdd-audit');
    installed(_sourceDir, 'sdd-check');
    installed(_targetDir, 'sdd-execute', '# v1');
    installed(_targetDir, 'sdd-audit');
    installed(_targetDir, 'sdd-check');
    createFile(_targetDir, '.gennady-synced', 'sdd-execute\nsdd-audit\nsdd-check\n');

    run({ skillNames: ['sdd-execute'] });

    const names = manifestNames();
    assert.ok(names.includes('sdd-audit'));
    assert.ok(names.includes('sdd-check'));
    assert.ok(names.includes('sdd-execute'));
    assert.ok(names.includes('sdd-execute/SKILL.md'));
  });

  it('successful prune — the deleted orphan leaves the manifest', () => {
    installed(_sourceDir, 'sdd-audit');
    installed(_targetDir, 'sdd-audit');
    installed(_targetDir, 'sdd-old');
    createFile(_targetDir, '.gennady-synced', 'sdd-audit\nsdd-old\n');

    const result = run();

    assert.equal(result.deleted.length, 1);
    assert.ok(!manifestNames().includes('sdd-old'));
    assert.ok(manifestNames().includes('sdd-audit'));
  });

  // Regression (review, ported from main): a rewritten manifest without the undeletable orphan
  // meant the next run no longer owned it, so the failure was never retried.
  it('failed prune — the orphan stays in the manifest for the next run', () => {
    installed(_sourceDir, 'sdd-audit');
    installed(_targetDir, 'sdd-audit');
    installed(_targetDir, 'sdd-old');
    createFile(_targetDir, '.gennady-synced', 'sdd-audit\nsdd-old\n');

    const result = run(undefined, { unlink: refuse('EACCES'), rmdir: refuse('EACCES') });

    assert.equal(result.deleteFailed.length, 1);
    assert.ok(existsSync(join(_targetDir, 'sdd-old', 'SKILL.md')));
    assert.ok(manifestNames().includes('sdd-old'));
  });

  // Migration policy: nothing in the target proves who wrote a skill directory, so only the
  // names the package ships now are adopted; an older version's leftovers are left alone.
  it('first run without a manifest — adopts only what the package ships now', () => {
    installed(_sourceDir, 'sdd-audit');
    installed(_targetDir, 'sdd-audit');
    installed(_targetDir, 'sdd-stale');
    installed(_targetDir, 'our-own-skill');

    const result = run();

    assert.equal(result.deleted.length, 0, 'a first run never prunes');
    assert.ok(manifestNames().includes('sdd-audit'));
    assert.ok(!manifestNames().includes('sdd-stale'));
    assert.ok(existsSync(join(_targetDir, 'sdd-stale', 'SKILL.md')));
    assert.ok(existsSync(join(_targetDir, 'our-own-skill', 'SKILL.md')));
  });

  it('first run with a filter — adopts package skills outside the filter too', () => {
    installed(_sourceDir, 'sdd-execute', '# v2');
    installed(_sourceDir, 'sdd-audit');
    installed(_targetDir, 'sdd-execute', '# v1');
    installed(_targetDir, 'sdd-audit');

    run({ skillNames: ['sdd-execute'] });

    const names = manifestNames();
    assert.ok(names.includes('sdd-audit'));
    assert.ok(names.includes('sdd-execute'));
  });

  it('drops a manifest entry whose directory the project removed by hand', () => {
    installed(_sourceDir, 'sdd-audit');
    installed(_targetDir, 'sdd-audit');
    createFile(_targetDir, '.gennady-synced', 'sdd-audit\nsdd-gone\n');

    run();

    assert.ok(!manifestNames().includes('sdd-gone'));
    assert.ok(manifestNames().includes('sdd-audit'));
  });
});

// #endregion

// #region collectAndCompareSkills — internal-mirror gate (SO-2b)

describe('collectAndCompareSkills internal mirror', () => {
  let _sourceDir: string;
  let _targetDir: string;

  beforeEach(() => {
    _tmpDir = mkdtempSync(join(tmpdir(), 'sync-skills-mirror-'));
    _sourceDir = join(_tmpDir, 'ai', 'skills');
    _targetDir = join(_tmpDir, '.claude', 'skills');
    mkdirSync(_sourceDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(_tmpDir)) rmSync(_tmpDir, { recursive: true });
  });

  function run(
    opts?: Partial<SyncSkillsOptions>,
    depsOverrides?: Partial<SyncCmdDeps>
  ): SyncSkillsResult {
    const deps = createMockDeps(_sourceDir, _targetDir, depsOverrides);
    return collectAndCompareSkills(deps, {
      sourceDir: _sourceDir,
      targetDir: _targetDir,
      ...opts,
    });
  }

  // Regression: sync-skills used to treat a supported skill's directory as a full mirror,
  // deleting any file the package no longer shipped — including one a project author placed
  // there by hand, since nothing distinguished the two.
  it('a project file inside a supported skill is never deleted', () => {
    createFile(join(_sourceDir, 'sdd-execute'), 'SKILL.md', '# Execute');
    mkdirSync(join(_targetDir, 'sdd-execute'), { recursive: true });
    createFile(join(_targetDir, 'sdd-execute'), 'SKILL.md', '# Execute');
    createFile(join(_targetDir, 'sdd-execute'), 'local-helper.sh', '#!/bin/bash\necho ours\n');
    // A previous sync placed SKILL.md, but never local-helper.sh — that one is the project's.
    createFile(_targetDir, '.gennady-synced', 'sdd-execute\nsdd-execute/SKILL.md\n');

    const result = run();

    assert.ok(!result.entries.some((e) => e.relativePath === 'local-helper.sh'));
    assert.ok(existsSync(join(_targetDir, 'sdd-execute', 'local-helper.sh')));
  });

  it('a project file inside a supported skill is never deleted on a first sync either', () => {
    createFile(join(_sourceDir, 'sdd-execute'), 'SKILL.md', '# Execute');
    mkdirSync(join(_targetDir, 'sdd-execute'), { recursive: true });
    createFile(join(_targetDir, 'sdd-execute'), 'SKILL.md', '# Execute');
    createFile(join(_targetDir, 'sdd-execute'), 'local-helper.sh', '#!/bin/bash\necho ours\n');
    // No manifest at all yet — nothing is provably ours to prune inside the skill.

    const result = run();

    assert.ok(!result.entries.some((e) => e.relativePath === 'local-helper.sh'));
    assert.ok(existsSync(join(_targetDir, 'sdd-execute', 'local-helper.sh')));
  });

  it('deleting a file inside a supported skill only removes previously-manifested names', () => {
    createFile(join(_sourceDir, 'sdd-execute'), 'SKILL.md', '# Execute v2');
    mkdirSync(join(_targetDir, 'sdd-execute'), { recursive: true });
    createFile(join(_targetDir, 'sdd-execute'), 'SKILL.md', '# Execute v1');
    createFile(join(_targetDir, 'sdd-execute'), 'stale-script.sh', '#!/bin/bash\n');
    createFile(join(_targetDir, 'sdd-execute'), 'local-helper.sh', '#!/bin/bash\necho ours\n');
    // The previous sync placed SKILL.md and stale-script.sh (since dropped from the package);
    // local-helper.sh was never manifested, so it is the project's.
    createFile(
      _targetDir,
      '.gennady-synced',
      'sdd-execute\nsdd-execute/SKILL.md\nsdd-execute/stale-script.sh\n'
    );

    const result = run();

    assert.ok(
      result.entries.some((e) => e.relativePath === 'stale-script.sh' && e.status === 'deleted')
    );
    assert.ok(!existsSync(join(_targetDir, 'sdd-execute', 'stale-script.sh')));
    assert.ok(!result.entries.some((e) => e.relativePath === 'local-helper.sh'));
    assert.ok(existsSync(join(_targetDir, 'sdd-execute', 'local-helper.sh')));
  });

  it('a dropped package file becomes prunable only from the run after it was last manifested', () => {
    // Run 1: package ships SKILL.md + extra.md inside sdd-execute.
    createFile(join(_sourceDir, 'sdd-execute'), 'SKILL.md', '# Execute');
    createFile(join(_sourceDir, 'sdd-execute'), 'extra.md', '# Extra');
    run();
    assert.ok(existsSync(join(_targetDir, 'sdd-execute', 'extra.md')));

    // Run 2: package drops extra.md. It was manifested by run 1, so run 2 may now prune it.
    rmSync(join(_sourceDir, 'sdd-execute', 'extra.md'));
    const result = run();

    assert.ok(result.entries.some((e) => e.relativePath === 'extra.md' && e.status === 'deleted'));
    assert.ok(!existsSync(join(_targetDir, 'sdd-execute', 'extra.md')));
  });
});

// #endregion

// #region collectAndCompareSkills — error paths

describe('collectAndCompareSkills error paths', () => {
  beforeEach(() => {
    _tmpDir = mkdtempSync(join(tmpdir(), 'sync-skills-test-'));
  });

  afterEach(() => {
    if (existsSync(_tmpDir)) rmSync(_tmpDir, { recursive: true });
  });

  function runDeps(
    sourceDir: string,
    targetDir: string,
    overrides?: Partial<SyncCmdDeps>
  ): SyncSkillsResult {
    const deps = createMockDeps(sourceDir, targetDir, overrides);
    return collectAndCompareSkills(deps, { sourceDir, targetDir });
  }

  it('throws when sourceDir does not exist', () => {
    assert.throws(
      () => runDeps(join(_tmpDir, 'nonexistent'), join(_tmpDir, '.claude', 'skills')),
      (err: Error & { code?: string }) =>
        err.code === ERR_SKILLS_SOURCE_NOT_FOUND &&
        err.message.includes('[collectAndCompareSkills]')
    );
  });

  it('throws when sourceDir is a file, not a directory', () => {
    const sourceFile = join(_tmpDir, 'source.txt');
    writeFileSync(sourceFile, 'not a dir', 'utf-8');

    assert.throws(
      () => runDeps(sourceFile, join(_tmpDir, '.claude', 'skills')),
      (err: Error) =>
        err.message.includes('[collectAndCompareSkills]') && err.message.includes('not a directory')
    );
  });

  it('throws when .claude exists as a file', () => {
    const sourceDir = join(_tmpDir, 'ai', 'skills');
    mkdirSync(sourceDir, { recursive: true });
    const claudeFile = join(_tmpDir, '.claude');
    writeFileSync(claudeFile, 'not a dir', 'utf-8');

    assert.throws(
      () => runDeps(sourceDir, join(_tmpDir, '.claude', 'skills')),
      (err: Error) => err.message.includes('exists but is not a directory')
    );
  });

  it('throws when target cannot be written (EACCES on mkdir)', () => {
    const sourceDir = join(_tmpDir, 'ai', 'skills');
    mkdirSync(sourceDir, { recursive: true });

    assert.throws(
      () =>
        runDeps(sourceDir, join(_tmpDir, '.claude', 'skills'), {
          mkdir: () => {
            const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
            err.code = 'EACCES';
            throw err;
          },
        }),
      (err: Error) => err.message.includes('cannot write to') && err.message.includes('EACCES')
    );
  });

  it('throws when .claude exists as a file in path (ENOTDIR on mkdir)', () => {
    const sourceDir = join(_tmpDir, 'ai', 'skills');
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(_tmpDir, '.claude'), 'not a dir', 'utf-8');

    assert.throws(
      () => runDeps(sourceDir, join(_tmpDir, '.claude', 'skills')),
      (err: Error) => err.message.includes('exists but is not a directory')
    );
  });

  it('throws on writeFile failure (fatal)', () => {
    const sourceDir = join(_tmpDir, 'ai', 'skills');
    mkdirSync(sourceDir, { recursive: true });
    createFile(join(sourceDir, 'sdd-audit'), 'SKILL.md', '# Audit');

    assert.throws(
      () =>
        runDeps(sourceDir, join(_tmpDir, '.claude', 'skills'), {
          writeFile: () => {
            throw new Error('Write failed');
          },
        }),
      (err: Error) => err.message.includes('Write failed')
    );
  });
});

// #endregion

// #region collectAndCompareSkills — deleteFailed

describe('collectAndCompareSkills deleteFailed', () => {
  beforeEach(() => {
    _tmpDir = mkdtempSync(join(tmpdir(), 'sync-skills-test-'));
  });

  afterEach(() => {
    if (existsSync(_tmpDir)) rmSync(_tmpDir, { recursive: true });
  });

  function runDeps(
    sourceDir: string,
    targetDir: string,
    overrides?: Partial<SyncCmdDeps>
  ): SyncSkillsResult {
    const deps = createMockDeps(sourceDir, targetDir, overrides);
    return collectAndCompareSkills(deps, { sourceDir, targetDir });
  }

  it('marks file as deleteFailed when unlink throws EACCES', () => {
    const sourceDir = join(_tmpDir, 'ai', 'skills');
    mkdirSync(sourceDir, { recursive: true });
    const targetDir = join(_tmpDir, '.claude', 'skills');
    mkdirSync(join(targetDir, 'sdd-old'), { recursive: true });
    createFile(join(targetDir, 'sdd-old'), 'SKILL.md', '# Old');
    // `sdd-old` was installed by an earlier sync, so it is ours to prune (SO-2).
    createFile(targetDir, '.gennady-synced', 'sdd-old\n');

    const result = runDeps(sourceDir, targetDir, {
      unlink: () => {
        const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
        err.code = 'EACCES';
        throw err;
      },
    });

    assert.equal(result.deleteFailed.length, 1);
    assert.equal(result.deleteFailed[0].skillName, 'sdd-old');
    assert.equal(result.deleteFailed[0].errorCode, 'EACCES');
    assert.equal(result.deleted.length, 0);
  });

  it('marks dir as deleteFailed when rmdir throws EBUSY', () => {
    const sourceDir = join(_tmpDir, 'ai', 'skills');
    mkdirSync(sourceDir, { recursive: true });
    const targetDir = join(_tmpDir, '.claude', 'skills');
    mkdirSync(join(targetDir, 'sdd-old'), { recursive: true });
    // `sdd-old` was installed by an earlier sync, so it is ours to prune (SO-2).
    createFile(targetDir, '.gennady-synced', 'sdd-old\n');

    const result = runDeps(sourceDir, targetDir, {
      rmdir: () => {
        const err = new Error('EBUSY: resource busy') as NodeJS.ErrnoException;
        err.code = 'EBUSY';
        throw err;
      },
    });

    assert.equal(result.deleteFailed.length, 1);
    assert.equal(result.deleteFailed[0].skillName, 'sdd-old');
    assert.equal(result.deleteFailed[0].errorCode, 'EBUSY');
  });

  it('continues sync after deleteFailed on one orphan', () => {
    const sourceDir = join(_tmpDir, 'ai', 'skills');
    mkdirSync(sourceDir, { recursive: true });
    createFile(join(sourceDir, 'sdd-audit'), 'SKILL.md', '# Audit');

    const targetDir = join(_tmpDir, '.claude', 'skills');
    mkdirSync(join(targetDir, 'sdd-old'), { recursive: true });
    createFile(join(targetDir, 'sdd-old'), 'SKILL.md', '# Old');
    // `sdd-old` was installed by an earlier sync, so it is ours to prune (SO-2).
    createFile(targetDir, '.gennady-synced', 'sdd-audit\nsdd-old\n');

    const result = runDeps(sourceDir, targetDir, {
      unlink: () => {
        const err = new Error('EACCES') as NodeJS.ErrnoException;
        err.code = 'EACCES';
        throw err;
      },
    });

    assert.equal(result.added.length, 1);
    assert.equal(result.deleteFailed.length, 1);
  });
});

// #endregion

// #region SyncSkillsResult

describe('SyncSkillsResult', () => {
  it('summary returns correct counts', () => {
    const entries: SyncSkillsFileEntry[] = [
      { skillName: 'a', relativePath: 'f1.md', status: 'added', sourceSize: 10 },
      { skillName: 'a', relativePath: 'f2.md', status: 'added', sourceSize: 20 },
      { skillName: 'b', relativePath: 'f3.md', status: 'updated', sourceSize: 30, targetSize: 25 },
      {
        skillName: 'c',
        relativePath: 'f4.md',
        status: 'unchanged',
        sourceSize: 40,
        targetSize: 40,
      },
      {
        skillName: 'c',
        relativePath: 'f5.md',
        status: 'unchanged',
        sourceSize: 50,
        targetSize: 50,
      },
      {
        skillName: 'c',
        relativePath: 'f6.md',
        status: 'unchanged',
        sourceSize: 60,
        targetSize: 60,
      },
      { skillName: 'd', relativePath: '', status: 'deleted' },
    ];

    const result = new SyncSkillsResult(entries);

    assert.equal(result.added.length, 2);
    assert.equal(result.updated.length, 1);
    assert.equal(result.unchanged.length, 3);
    assert.equal(result.deleted.length, 1);

    assert.match(result.summary, /Synced: 2 added, 1 updated, 3 skipped, 1 deleted/);
  });

  it('summary includes deleteFailed count when present', () => {
    const entries: SyncSkillsFileEntry[] = [
      { skillName: 'a', relativePath: 'f1.md', status: 'added', sourceSize: 10 },
      { skillName: 'd', relativePath: '', status: 'deleteFailed', errorCode: 'EACCES' },
      { skillName: 'd', relativePath: '', status: 'deleteFailed', errorCode: 'EBUSY' },
    ];

    const result = new SyncSkillsResult(entries);

    assert.match(
      result.summary,
      /Synced: 1 added, 0 updated, 0 skipped, 0 deleted, 2 delete failed/
    );
  });

  it('dryRunSummary returns the dry-run message', () => {
    const result = new SyncSkillsResult([]);

    assert.equal(result.dryRunSummary, 'Dry-run: no files written.');
  });
});

// #endregion
