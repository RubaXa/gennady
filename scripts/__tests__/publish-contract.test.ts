// @file: Runtime-backed checks for npm publish and release configuration contracts.
// @spec: INFRA-NPM-PUBLISH
// @consumers: migration-authored BDD evidence

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
  files: string[];
  devDependencies: Record<string, string>;
};
const releaseConfig = JSON.parse(readFileSync(join(root, '.release-it.json'), 'utf8')) as {
  hooks: Record<string, string[]>;
};
const publishScript = readFileSync(join(root, 'scripts/prepare-publish-artifacts.ts'), 'utf8');
const denialCommand = 'node --import tsx scripts/release-boundary.ts --deny-publication';

describe('publish contract', () => {
  it('publish artifact preparation copies the complete ai tree', () => {
    assert.match(publishScript, /source: path\.join\(projectRoot, 'ai'\)/);
    assert.match(publishScript, /target: path\.join\(projectRoot, 'dist\/ai'\)/);
  });

  it('missing ai copy pair is rejected by the publish contract', () => {
    const candidate = publishScript.replace("source: path.join(projectRoot, 'ai'),", '');
    assert.doesNotMatch(candidate, /source: path\.join\(projectRoot, 'ai'\)/);
  });

  it('package publication includes ai artifacts', () => {
    assert.ok(packageJson.files.includes('ai/**/*'));
  });

  it('every supported package publication path invokes the shared denial first', () => {
    assert.equal(packageJson.scripts.release, `${denialCommand} && release-it`);
    assert.match(packageJson.scripts.prepublishOnly, new RegExp(`^${denialCommand}`));
    assert.equal(packageJson.scripts['publish-next'], 'node --import tsx scripts/publish-next.ts');
    assert.equal(
      packageJson.scripts['publish-draft'],
      'node --import tsx scripts/publish-draft.ts'
    );
  });

  it('missing release script is rejected by the package contract', () => {
    const candidate = { ...packageJson.scripts };
    delete candidate.release;
    assert.throws(() => assert.equal(candidate.release, `${denialCommand} && release-it`));
  });

  it('direct release-it denies before historical lint/test hooks', () => {
    assert.deepEqual(releaseConfig.hooks['before:init'], [
      denialCommand,
      'npm run lint',
      'npm test',
    ]);
  });

  it('invalid release config without before-init checks is rejected', () => {
    const candidate = { hooks: {} as Record<string, string[]> };
    assert.throws(() =>
      assert.deepEqual(candidate.hooks['before:init'], [denialCommand, 'npm run lint', 'npm test'])
    );
  });

  it('pack-draft remains a local pack/install tool rather than a registry publication path', () => {
    assert.equal(packageJson.scripts['pack-draft'], 'node --import tsx scripts/pack-draft.ts');
  });

  it('release-it is pinned as a development dependency', () => {
    assert.equal(packageJson.devDependencies['release-it'], '20.0.1');
  });

  it('missing release-it dependency is rejected by the package contract', () => {
    const candidate = { ...packageJson.devDependencies };
    delete candidate['release-it'];
    assert.throws(() => assert.equal(candidate['release-it'], '20.0.1'));
  });
});
