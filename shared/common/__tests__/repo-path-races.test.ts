// @file: Deterministic parent/leaf replacement controls for repository path checks and rule reads.
// @spec: SHARED
// @consumers: repository path and rule-source qualification

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

const project = resolve(import.meta.dirname, '../../..');

for (const consumer of ['inspect', 'rules', 'package'] as const) {
  test(`rejects a deterministic component replacement before ${consumer} accepts outside evidence`, () => {
    const top = realpathSync(mkdtempSync(join(tmpdir(), 'repo-path-race-')));
    const root = join(top, 'repo');
    const parent = join(root, 'src');
    const outside = join(top, 'outside');
    mkdirSync(parent, { recursive: true });
    mkdirSync(outside);
    const file =
      consumer === 'package'
        ? 'package.json'
        : consumer === 'rules'
          ? '0-source.xml'
          : 'source.xml';
    const localFile = join(consumer === 'inspect' ? parent : root, file);
    const swappedPath = consumer === 'inspect' ? parent : localFile;
    const replacement = consumer === 'inspect' ? outside : join(outside, file);
    writeFileSync(localFile, consumer === 'package' ? '{}' : 'local source');
    writeFileSync(join(outside, file), 'OUTSIDE_SENTINEL');
    const modulePath =
      consumer === 'inspect'
        ? 'shared/common/repo-path.ts'
        : consumer === 'rules'
          ? 'shared/rules/builtin-rule-sources.ts'
          : 'shared/rules/project-rule-facts.ts';
    const script = `
import assert from 'node:assert/strict';
import * as native from 'node:fs';
import { mock } from 'node:test';
let swapped = false;
let leaked = false;
const parent = ${JSON.stringify(parent)};
const outside = ${JSON.stringify(outside)};
const root = ${JSON.stringify(root)};
const swappedPath = ${JSON.stringify(swappedPath)};
const replacement = ${JSON.stringify(replacement)};
const wrapped = {
  ...native,
  lstatSync: (...args) => {
    const result = native.lstatSync(...args);
    if (!swapped && args[0] === swappedPath) {
      swapped = true;
      native.renameSync(swappedPath, swappedPath + '.previous');
      native.symlinkSync(replacement, swappedPath, ${JSON.stringify(consumer === 'inspect' ? 'dir' : 'file')});
    }
    return result;
  },
  readFileSync: (...args) => {
    const result = native.readFileSync(...args);
    if (String(result).includes('OUTSIDE_SENTINEL')) leaked = true;
    return result;
  },
};
mock.module('node:fs', { namedExports: wrapped, defaultExport: wrapped });
const api = await import(${JSON.stringify(pathToFileURL(join(project, modulePath)).href)});
if (${JSON.stringify(consumer)} === 'inspect') {
  const result = api.inspectRepoPath(root, 'src/source.xml', 'file');
  assert.equal(result.ok, false, 'a swapped parent is not a proven repository path');
} else if (${JSON.stringify(consumer)} === 'rules') {
  assert.throws(() => api.loadRuleRegistry(root, ['0-source.xml']));
} else {
  assert.throws(() => api.detectProjectRuleFacts(root, []));
}

assert.equal(swapped, true, 'the race hook actually ran');
assert.equal(leaked, false, 'outside bytes must not become rule/config evidence');
`;
    try {
      const result = spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          '--experimental-test-module-mocks',
          '--input-type=module',
          '--eval',
          script,
        ],
        { cwd: project, encoding: 'utf8', timeout: 10_000 }
      );
      assert.equal(result.status, 0, result.stderr);
    } finally {
      rmSync(top, { recursive: true, force: true });
    }
  });
}

test('a proven rule-source read stays pinned when its pathname is replaced after open', () => {
  const top = realpathSync(mkdtempSync(join(tmpdir(), 'repo-descriptor-race-')));
  const root = join(top, 'repo');
  mkdirSync(root);
  const source = join(root, 'source.xml');
  const outside = join(top, 'outside.xml');
  writeFileSync(source, 'original descriptor bytes');
  writeFileSync(outside, 'OUTSIDE_SENTINEL');
  const script = `
import assert from 'node:assert/strict';
import * as native from 'node:fs';
import { mock } from 'node:test';
let swapped = false;
const source = ${JSON.stringify(source)};
const wrapped = { ...native, openSync: (...args) => {
  const fd = native.openSync(...args);
  if (!swapped && args[0] === source) {
    swapped = true;
    native.renameSync(source, source + '.previous');
    native.symlinkSync(${JSON.stringify(outside)}, source, 'file');
  }
  return fd;
} };
mock.module('node:fs', { namedExports: wrapped, defaultExport: wrapped });
const { proveRepoFile, readProvenRepoFile } = await import(${JSON.stringify(pathToFileURL(join(project, 'shared/common/repo-file-identity.ts')).href)});
const proof = proveRepoFile(${JSON.stringify(root)}, 'source.xml');
assert.equal(proof.ok, true);
const result = readProvenRepoFile(proof.identity);
assert.equal(swapped, true);
assert.deepEqual(result, { ok: true, content: 'original descriptor bytes' });
`;
  try {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--experimental-test-module-mocks',
        '--input-type=module',
        '--eval',
        script,
      ],
      { cwd: project, encoding: 'utf8', timeout: 10_000 }
    );
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(top, { recursive: true, force: true });
  }
});
