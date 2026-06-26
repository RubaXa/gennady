// @file: Unit tests for VcsCliContext resolution — auto-detect, explicit overrides, error paths.
// @tasks: TSK-68

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { resolveVcsContext, VcsResolveError } from '../vcs-context-resolver.ts';

// #region START_VCS_RESOLVER_UNIFIED_CONTEXT
type VcsResolveContext = {
  deps: {
    git(cmd: string[]): Promise<string>;
    env(name: string): string | undefined;
  };
  gitMock: ReturnType<typeof mock.fn>;
  envMock: ReturnType<typeof mock.fn>;
};

function createVcsResolveContext(overrides?: {
  git?: Record<string, string>;
  env?: Record<string, string | undefined>;
}): VcsResolveContext {
  const gitMock = mock.fn(async (cmdKey: string): Promise<string> => {
    const val = overrides?.git?.[cmdKey];
    if (val !== undefined) return val;
    throw new Error(`unexpected git command: ${cmdKey}`);
  });
  const envMock = mock.fn((name: string): string | undefined => overrides?.env?.[name]);

  return {
    deps: {
      git: (cmd: string[]) => gitMock(cmd.join(' ')),
      env: (name: string) => envMock(name),
    },
    gitMock,
    envMock,
  };
}
// #endregion END_VCS_RESOLVER_UNIFIED_CONTEXT

describe('resolveVcsContext', () => {
  it('auto-detect HTTP remote — returns full context', async () => {
    // contract: full auto-detected context from HTTP remote, branch, and env token
    // failure mode: do not assert full strict equality on error message — token is sensitive

    // #region START_AUTO_HTTP_SETUP_MOCKS
    const ctx = createVcsResolveContext({
      git: {
        'config remote.origin.url': 'https://gitlab.company.com/group/repo.git',
        'rev-parse --abbrev-ref HEAD': 'feat/payments',
      },
      env: { GITLAB_PERSONAL_TOKEN: 'glpat-xxx' },
    });
    // #endregion END_AUTO_HTTP_SETUP_MOCKS

    const result = await resolveVcsContext({}, ctx.deps);

    assert.strictEqual(result.provider, 'gitlab');
    assert.strictEqual(result.host, 'gitlab.company.com');
    assert.strictEqual(result.project, 'group/repo');
    assert.strictEqual(result.branch, 'feat/payments');
    assert.strictEqual(result.token, 'glpat-xxx');
  });

  it('SSH remote URL — parses host and project', async () => {
    // contract: SSH remote URL format git@host:path.git parsed into host and project
    // invariant: provider is always gitlab for recognized gitlab hosts

    // #region START_SSH_REMOTE_SETUP_MOCKS
    const ctx = createVcsResolveContext({
      git: {
        'config remote.origin.url': 'git@gitlab.company.com:group/repo.git',
        'rev-parse --abbrev-ref HEAD': 'main',
      },
      env: { GITLAB_PERSONAL_TOKEN: 'glpat-xxx' },
    });
    // #endregion END_SSH_REMOTE_SETUP_MOCKS

    const result = await resolveVcsContext({}, ctx.deps);

    assert.strictEqual(result.host, 'gitlab.company.com');
    assert.strictEqual(result.project, 'group/repo');
    assert.strictEqual(result.provider, 'gitlab');
  });

  it('explicit ref — skips branch auto-detect', async () => {
    // contract: ref=group/other!99 → project=group/other, iid=99, branch NOT fetched
    // invariant: parsed ref takes priority over git auto-detection

    // #region START_EXPLICIT_REF_SETUP_MOCKS
    const ctx = createVcsResolveContext({
      git: {
        'config remote.origin.url': 'https://gitlab.company.com/group/repo.git',
      },
      env: { GITLAB_PERSONAL_TOKEN: 'glpat-xxx' },
    });
    // #endregion END_EXPLICIT_REF_SETUP_MOCKS

    const result = await resolveVcsContext({ ref: 'group/other!99' }, ctx.deps);

    assert.strictEqual(result.project, 'group/other');
    assert.strictEqual(result.iid, 99);
    assert.strictEqual(result.branch, undefined);
  });

  it('explicit project+iid — returns iid directly', async () => {
    // contract: explicit project+iid bypasses remote URL project parsing
    // invariant: iid from args takes precedence; branch auto-detect skipped when iid present

    // #region START_EXPLICIT_PROJECT_IID_SETUP_MOCKS
    const ctx = createVcsResolveContext({
      git: {
        'config remote.origin.url': 'https://gitlab.company.com/group/repo.git',
      },
      env: { GITLAB_PERSONAL_TOKEN: 'glpat-xxx' },
    });
    // #endregion END_EXPLICIT_PROJECT_IID_SETUP_MOCKS

    const result = await resolveVcsContext({ project: 'a/b', iid: 55 }, ctx.deps);

    assert.strictEqual(result.project, 'a/b');
    assert.strictEqual(result.iid, 55);
    assert.strictEqual(result.branch, undefined);
  });

  it('ref and branch mutually exclusive — throws', async () => {
    // contract: ref and branch cannot coexist — VcsResolveError before any git call
    // failure mode: do not match full message — it may include specific arg values

    await assert.rejects(
      () => resolveVcsContext({ ref: 'g/r!1', branch: 'feat/x' }),
      (error: unknown) => {
        assert.ok(error instanceof VcsResolveError);
        assert.match((error as Error).message, /не могут быть указаны одновременно/);
        return true;
      }
    );
  });

  it('non-GitLab host — throws with GitHub deferred', async () => {
    // contract: provider check via /gitlab/i rejects non-GitLab hosts
    // invariant: GitHub and other providers are deferred — not silently accepted

    // #region START_NON_GITLAB_SETUP_MOCKS
    const ctx = createVcsResolveContext({
      git: {
        'config remote.origin.url': 'https://github.com/user/repo.git',
      },
      env: { GITLAB_PERSONAL_TOKEN: 'glpat-xxx' },
    });
    // #endregion END_NON_GITLAB_SETUP_MOCKS

    await assert.rejects(
      () => resolveVcsContext({}, ctx.deps),
      (error: unknown) => {
        assert.ok(error instanceof VcsResolveError);
        assert.match((error as Error).message, /GitHub is deferred/);
        return true;
      }
    );
  });

  it('no origin remote — throws', async () => {
    // contract: missing origin remote without explicit project → VcsResolveError with cause
    // failure mode: do not strict-equal — message includes anchor prefix

    const ctx = createVcsResolveContext();

    await assert.rejects(
      () => resolveVcsContext({}, ctx.deps),
      (error: unknown) => {
        assert.ok(error instanceof VcsResolveError);
        assert.match((error as Error).message, /Не найден удалённый репозиторий origin/);
        return true;
      }
    );
  });

  it('no GITLAB_PERSONAL_TOKEN — throws', async () => {
    // contract: missing token blocks resolution — VcsResolveError with human-readable guidance
    // invariant: token check is last gate after host+project resolution

    // #region START_NO_TOKEN_SETUP_MOCKS
    const ctx = createVcsResolveContext({
      git: {
        'config remote.origin.url': 'https://gitlab.company.com/group/repo.git',
        'rev-parse --abbrev-ref HEAD': 'feat/payments',
      },
      env: {},
    });
    // #endregion END_NO_TOKEN_SETUP_MOCKS

    await assert.rejects(
      () => resolveVcsContext({}, ctx.deps),
      (error: unknown) => {
        assert.ok(error instanceof VcsResolveError);
        assert.match((error as Error).message, /токен/);
        return true;
      }
    );
  });

  it('VcsCliContext type contract', async () => {
    // contract: every resolved context carries mandatory fields provider, host, project, token
    // observation focus: type presence (string), not value equality

    // #region START_TYPE_CONTRACT_SETUP_MOCKS
    const ctx = createVcsResolveContext({
      git: {
        'config remote.origin.url': 'https://gitlab.company.com/group/repo.git',
        'rev-parse --abbrev-ref HEAD': 'main',
      },
      env: { GITLAB_PERSONAL_TOKEN: 'glpat-xxx' },
    });
    // #endregion END_TYPE_CONTRACT_SETUP_MOCKS

    const result = await resolveVcsContext({}, ctx.deps);

    assert.strictEqual(typeof result.provider, 'string');
    assert.strictEqual(typeof result.host, 'string');
    assert.strictEqual(typeof result.project, 'string');
    assert.strictEqual(typeof result.token, 'string');
    assert.strictEqual(result.provider, 'gitlab');
  });
});
