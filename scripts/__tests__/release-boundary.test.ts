// @file: Causal UV-27B cutover identity, external ACK and npm-denial contract tests.
// @spec: INFRA-BASE
// @consumers: package audit:release-boundary; UV-27B review evidence

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  authorizeCutoverCandidate,
  denyNpmPublication,
  inspectCutoverCandidate,
  type ReleaseBoundaryPolicy,
  type ReleaseBoundaryPorts,
} from '../release-boundary.ts';

const projectRoot = resolve(import.meta.dirname, '../..');
const temporaryRoots: string[] = [];
const digest = 'a'.repeat(64);
const denialCode = 'UV27B_NPM_PUBLICATION_DENIED';

function temporaryRoot(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `gennady-${name}-`));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  while (temporaryRoots.length > 0) rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
});

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function write(root: string, path: string, value: string): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value, 'utf8');
}

function commit(root: string, message: string): string {
  git(root, 'add', '-A');
  git(root, 'commit', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

type Fixture = {
  root: string;
  remote: string;
  mainSha: string;
  sourceCommit: string;
  candidateHead: string;
  policy: ReleaseBoundaryPolicy;
  ports: ReleaseBoundaryPorts;
};

function createFixture(): Fixture {
  const holder = temporaryRoot('uv27b');
  const root = join(holder, 'repo');
  const remote = join(holder, 'remote.git');
  mkdirSync(root);
  git(holder, 'init', '--bare', remote);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'UV27B Test');
  git(root, 'config', 'user.email', 'uv27b@example.invalid');
  write(root, 'package.json', '{"name":"fixture","version":"1.0.0"}\n');
  write(root, 'checker.ts', '// immutable UV-25 checker\n');
  write(root, 'obsolete.txt', 'removed by product source\n');
  const mainSha = commit(root, 'main base');
  git(root, 'remote', 'add', 'origin', remote);
  git(root, 'push', '-u', 'origin', 'main');
  git(root, 'checkout', '-b', 'codex/sdd-v2-rc52-followup');
  rmSync(join(root, 'obsolete.txt'));
  write(root, 'src/product.ts', 'export const product = 1;\n');
  const sourceCommit = commit(root, 'product source');
  write(
    root,
    'evidence/manifest.json',
    `${JSON.stringify(
      {
        schema: 'gennady.rc-evidence-pack.v2',
        sourceCommit,
        commands: [{ logFile: 'logs/result.log' }],
      },
      null,
      2
    )}\n`
  );
  write(root, 'evidence/README.md', '# evidence\n');
  write(root, 'evidence/logs/result.log', 'PASS\n');
  write(
    root,
    'evidence/e18.json',
    `${JSON.stringify({
      schema: 'gennady.e18-exact-evidence.v1',
      sourceCommit,
      status: 'PASS',
      environment: 'cloud-ios',
    })}\n`
  );
  const candidateHead = commit(root, 'evidence only');
  git(root, 'push', '-u', 'origin', 'codex/sdd-v2-rc52-followup');
  const policy: ReleaseBoundaryPolicy = {
    schemaVersion: 'gennady.release-boundary-policy.v1',
    releaseBranch: 'codex/sdd-v2-rc52-followup',
    releaseUpstream: 'origin/codex/sdd-v2-rc52-followup',
    mainRef: 'origin/main',
    uv25Manifest: 'evidence/manifest.json',
    uv25Checker: 'checker.ts',
    uv26Evidence: 'evidence/e18.json',
    relevantFiles: ['package.json'],
    authorityScanPaths: ['.github/workflows', '.gitlab-ci.yml', '.npmrc', '.yarnrc.yml'],
    forbiddenAuthEnvironment: ['NODE_AUTH_TOKEN', 'NPM_CONFIG__AUTH', 'NPM_TOKEN'],
  };
  const ports: ReleaseBoundaryPorts = {
    environment: {},
    runUv27a: () => ({
      status: 0,
      stdout: JSON.stringify({
        schemaVersion: 'gennady.v1-eradication-report.v1',
        ok: true,
        policyDigest: digest,
        inventoryDigest: digest,
      }),
      stderr: '',
    }),
    runUv25Checker: () => ({ status: 0, stdout: 'PASS\n', stderr: '' }),
  };
  return { root, remote, mainSha, sourceCommit, candidateHead, policy, ports };
}

function codes(report: ReturnType<typeof inspectCutoverCandidate>): string[] {
  return report.blockers.map(({ code }) => code);
}

function repointRelease(fixture: Fixture): void {
  git(fixture.root, 'push', '--force', 'origin', 'HEAD:codex/sdd-v2-rc52-followup');
}

function fakePublishEnvironment(name: string): { env: NodeJS.ProcessEnv; sentinel: string } {
  const root = temporaryRoot(name);
  const bin = join(root, 'bin');
  const sentinel = join(root, 'spawned');
  mkdirSync(bin);
  for (const command of ['git', 'npm', 'release-it']) {
    const path = join(bin, command);
    writeFileSync(path, `#!/bin/sh\nprintf invoked > "${sentinel}"\n`, { mode: 0o755 });
  }
  return { env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` }, sentinel };
}

describe('UV-27B cutover candidate', () => {
  it('accepts one exact evidence-only descendant and binds both full SHAs', () => {
    const fixture = createFixture();
    const first = inspectCutoverCandidate(fixture.root, fixture.ports, fixture.policy);
    const second = inspectCutoverCandidate(fixture.root, fixture.ports, fixture.policy);
    assert.equal(first.eligible, true, JSON.stringify(first.blockers));
    assert.equal(first.identity.evidenceSourceCommit, fixture.sourceCommit);
    assert.equal(first.identity.headSha, fixture.candidateHead);
    assert.equal(first.candidateDigest, second.candidateDigest);
    assert.deepEqual(
      first.diff.evidenceSourceToCandidate.entries.map(({ path }) => path),
      [
        'evidence/README.md',
        'evidence/e18.json',
        'evidence/logs/result.log',
        'evidence/manifest.json',
      ]
    );
    const deletion = first.diff.mainToCandidate.entries.find(({ path }) => path === 'obsolete.txt');
    assert.equal(deletion?.status, 'D');
    assert.match(deletion?.oldObject ?? '', /^[0-9a-f]{40}$/u);
    assert.equal(deletion?.newObject, '0'.repeat(40));
    assert.equal(
      authorizeCutoverCandidate(fixture.root, first.challenge, fixture.ports, fixture.policy)
        .candidateDigest,
      first.candidateDigest
    );
  });

  it('rejects an arbitrary ancestor whose delta includes product bytes', () => {
    const fixture = createFixture();
    const manifestPath = join(fixture.root, 'evidence/manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    manifest.sourceCommit = fixture.mainSha;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    commit(fixture.root, 'point at arbitrary ancestor');
    repointRelease(fixture);
    assert.ok(
      codes(inspectCutoverCandidate(fixture.root, fixture.ports, fixture.policy)).includes(
        'CUTOVER_PRODUCT_DRIFT_AFTER_EVIDENCE_SOURCE'
      )
    );
  });

  it('rejects one product byte committed after evidence source', () => {
    const fixture = createFixture();
    write(fixture.root, 'src/product.ts', 'export const product = 2;\n');
    commit(fixture.root, 'product drift');
    repointRelease(fixture);
    const report = inspectCutoverCandidate(fixture.root, fixture.ports, fixture.policy);
    assert.ok(codes(report).includes('CUTOVER_PRODUCT_DRIFT_AFTER_EVIDENCE_SOURCE'));
    assert.match(
      report.blockers.find(({ code }) => code === 'CUTOVER_PRODUCT_DRIFT_AFTER_EVIDENCE_SOURCE')!
        .detail,
      /src\/product\.ts/u
    );
  });

  it('rejects an extra file in the evidence root', () => {
    const fixture = createFixture();
    write(fixture.root, 'evidence/undeclared.txt', 'not in manifest\n');
    commit(fixture.root, 'extra evidence');
    repointRelease(fixture);
    const report = inspectCutoverCandidate(fixture.root, fixture.ports, fixture.policy);
    assert.ok(codes(report).includes('CUTOVER_PRODUCT_DRIFT_AFTER_EVIDENCE_SOURCE'));
  });

  it('rejects a source commit that is not an ancestor', () => {
    const fixture = createFixture();
    git(fixture.root, 'checkout', '--orphan', 'unrelated');
    git(fixture.root, 'rm', '-rf', '.');
    write(fixture.root, 'unrelated.txt', 'unrelated\n');
    const unrelated = commit(fixture.root, 'unrelated');
    git(fixture.root, 'checkout', 'codex/sdd-v2-rc52-followup');
    const manifestPath = join(fixture.root, 'evidence/manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    manifest.sourceCommit = unrelated;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    commit(fixture.root, 'non-ancestor source');
    repointRelease(fixture);
    assert.ok(
      codes(inspectCutoverCandidate(fixture.root, fixture.ports, fixture.policy)).includes(
        'CUTOVER_EVIDENCE_SOURCE_NOT_ANCESTOR'
      )
    );
  });

  it('fails closed for branch/upstream divergence, dirty tree and stale main ancestry', () => {
    const fixture = createFixture();
    git(fixture.root, 'checkout', '-b', 'wrong-branch');
    write(fixture.root, 'dirty.txt', 'dirty\n');
    const report = inspectCutoverCandidate(fixture.root, fixture.ports, fixture.policy);
    assert.ok(codes(report).includes('CUTOVER_WRONG_BRANCH'));
    assert.ok(codes(report).includes('CUTOVER_WRONG_UPSTREAM'));
    assert.ok(codes(report).includes('CUTOVER_DIRTY_WORKTREE'));
  });

  it('rejects local HEAD that is not the exact upstream HEAD', () => {
    const fixture = createFixture();
    write(fixture.root, 'evidence/README.md', '# local-only evidence change\n');
    commit(fixture.root, 'local only');
    const report = inspectCutoverCandidate(fixture.root, fixture.ports, fixture.policy);
    assert.ok(codes(report).includes('CUTOVER_UPSTREAM_DIVERGED'));
  });

  it('rejects a stale local main remote-tracking ref', () => {
    const fixture = createFixture();
    git(fixture.root, 'push', 'origin', `${fixture.candidateHead}:refs/heads/main`);
    git(fixture.root, 'update-ref', 'refs/remotes/origin/main', fixture.mainSha);
    const report = inspectCutoverCandidate(fixture.root, fixture.ports, fixture.policy);
    assert.ok(codes(report).includes('CUTOVER_MAIN_REF_STALE'));
  });

  it('rejects missing/malformed evidence and a non-PASS UV-27A report', () => {
    const fixture = createFixture();
    rmSync(join(fixture.root, 'evidence/e18.json'));
    const ports: ReleaseBoundaryPorts = {
      ...fixture.ports,
      runUv27a: () => ({ status: 1, stdout: '{}', stderr: 'inventory drift' }),
      runUv25Checker: () => ({ status: 1, stdout: '', stderr: 'manifest invalid' }),
    };
    const report = inspectCutoverCandidate(fixture.root, ports, fixture.policy);
    assert.ok(codes(report).includes('CUTOVER_UV27A_INVALID'));
    assert.ok(codes(report).includes('CUTOVER_UV25_INVALID'));
    assert.ok(codes(report).includes('CUTOVER_UV26_MISSING'));
  });

  it('requires an external exact non-reusable ACK and rechecks candidate drift', () => {
    const fixture = createFixture();
    const report = inspectCutoverCandidate(fixture.root, fixture.ports, fixture.policy);
    assert.throws(
      () => authorizeCutoverCandidate(fixture.root, undefined, fixture.ports, fixture.policy),
      /UV27B_ACK_MISSING/u
    );
    assert.throws(
      () => authorizeCutoverCandidate(fixture.root, 'approved=true', fixture.ports, fixture.policy),
      /UV27B_ACK_MISMATCH/u
    );
    write(fixture.root, 'evidence/README.md', '# changed evidence\n');
    commit(fixture.root, 'evidence projection changed');
    repointRelease(fixture);
    assert.throws(
      () =>
        authorizeCutoverCandidate(fixture.root, report.challenge, fixture.ports, fixture.policy),
      /UV27B_ACK_MISMATCH/u
    );
  });

  it('rejects npm auth environment without exposing values', () => {
    const fixture = createFixture();
    const report = inspectCutoverCandidate(
      fixture.root,
      { ...fixture.ports, environment: { NPM_TOKEN: 'never-print-this-secret' } },
      fixture.policy
    );
    assert.ok(codes(report).includes('CUTOVER_NPM_AUTH_PRESENT'));
    assert.doesNotMatch(JSON.stringify(report), /never-print-this-secret/u);
  });

  it('rejects embedded workflow publication authority', () => {
    const fixture = createFixture();
    write(
      fixture.root,
      '.github/workflows/publish.yml',
      'env:\n  NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}\nsteps:\n  - run: npm publish\n'
    );
    commit(fixture.root, 'embedded authority');
    repointRelease(fixture);
    const report = inspectCutoverCandidate(fixture.root, fixture.ports, fixture.policy);
    assert.ok(codes(report).includes('CUTOVER_EMBEDDED_PUBLISH_AUTHORITY'));
  });

  it('rejects malformed runtime policy before candidate inspection', () => {
    const fixture = createFixture();
    write(fixture.root, 'scripts/release-boundary.policy.json', '{"schemaVersion":"unknown"}\n');
    assert.throws(
      () => inspectCutoverCandidate(fixture.root, fixture.ports),
      /release-boundary policy keys must be exactly|unsupported release-boundary policy schema/u
    );
  });

  it('rejects unsafe and option-like Git refs before remote observation', () => {
    const fixture = createFixture();
    let remoteObservations = 0;
    const ports: ReleaseBoundaryPorts = {
      ...fixture.ports,
      resolveRemoteRef: () => {
        remoteObservations += 1;
        throw new Error('remote observation must not run for an invalid policy');
      },
    };
    const invalidPolicies: ReleaseBoundaryPolicy[] = [
      { ...fixture.policy, releaseBranch: '-codex/release' },
      { ...fixture.policy, releaseBranch: 'codex//release' },
      { ...fixture.policy, releaseBranch: 'codex/.hidden' },
      { ...fixture.policy, releaseBranch: 'codex/release.' },
      { ...fixture.policy, releaseBranch: 'codex/release.lock' },
      { ...fixture.policy, releaseBranch: 'codex/release@{upstream}' },
      { ...fixture.policy, releaseBranch: 'codex\\release' },
      {
        ...fixture.policy,
        releaseUpstream: '--upload-pack=evil/codex/sdd-v2-rc52-followup',
      },
      {
        ...fixture.policy,
        releaseUpstream: 'origin/other/codex/sdd-v2-rc52-followup',
      },
      { ...fixture.policy, mainRef: '-evil/main' },
      { ...fixture.policy, mainRef: 'origin/../main' },
    ];
    for (const policy of invalidPolicies) {
      assert.throws(
        () => inspectCutoverCandidate(fixture.root, ports, policy),
        /safe Git ref|safe remote|branch must equal/u
      );
    }
    assert.equal(remoteObservations, 0);
  });
});

describe('UV-27B npm publication denial', () => {
  it('uses one stable exported denial', () => {
    assert.throws(() => denyNpmPublication('test'), new RegExp(denialCode, 'u'));
  });

  for (const script of ['scripts/publish-next.ts', 'scripts/publish-draft.ts']) {
    it(`${script} denies before child or manifest mutation`, () => {
      const { env, sentinel } = fakePublishEnvironment('publish-deny');
      const beforePackage = readFileSync(join(projectRoot, 'package.json'));
      const result = spawnSync(process.execPath, ['--import', 'tsx', script], {
        cwd: projectRoot,
        encoding: 'utf8',
        env,
      });
      assert.notEqual(result.status, 0);
      assert.match(`${result.stdout}${result.stderr}`, new RegExp(denialCode, 'u'));
      assert.deepEqual(readFileSync(join(projectRoot, 'package.json')), beforePackage);
      assert.equal(existsSync(sentinel), false);
    });
  }

  for (const entrypoint of ['prepublishOnly', 'release'] as const) {
    it(`package ${entrypoint} denies before its next command`, () => {
      const { env, sentinel } = fakePublishEnvironment(`package-${entrypoint}`);
      const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as {
        scripts: Record<string, string>;
      };
      const result = spawnSync('/bin/sh', ['-c', packageJson.scripts[entrypoint]!], {
        cwd: projectRoot,
        encoding: 'utf8',
        env,
      });
      assert.notEqual(result.status, 0);
      assert.match(`${result.stdout}${result.stderr}`, new RegExp(denialCode, 'u'));
      assert.equal(existsSync(sentinel), false);
    });
  }
});
