// @file: Unified VCS context resolver — auto-detect branch, project, host, and token for all VCS commands.
// @consumers: vcs-approve, vcs-worktree, vcs-reply, review-issues
// @tasks: TSK-68

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '#logger';

const execFileAsync = promisify(execFile);

/** @purpose Injectable dependencies for VCS context resolution. */
export type VcsCliDeps = {
  /**
   * @purpose Execute a git command and return trimmed stdout.
   * @param cmd Git command and arguments (e.g. ['config', 'remote.origin.url']).
   * @returns Trimmed stdout of the git command.
   */
  git(cmd: string[]): Promise<string>;
  /**
   * @purpose Read an environment variable by name.
   * @param name Environment variable name.
   * @returns The variable value or undefined when not set.
   */
  env(name: string): string | undefined;
};

/** @purpose Input arguments for VCS context resolution. */
export type VcsCliArgs = {
  /** @purpose MR ref in group/repo!iid format | @invariant Mutually exclusive with explicit branch */
  ref?: string;
  /** @purpose Explicit project path (group/repo) */
  project?: string;
  /** @purpose Explicit MR iid */
  iid?: number;
  /** @purpose Explicit branch name */
  branch?: string;
  /** @purpose Explicit VCS host override */
  host?: string;
};

/** @purpose Fully resolved VCS context for API calls. */
export type VcsCliContext = {
  /** @purpose VCS provider identifier */
  provider: 'gitlab' | 'github';
  /** @purpose VCS host (e.g. gitlab.company.com, github.com) */
  host: string;
  /** @purpose Project path (group/repo) */
  project: string;
  /** @purpose Merge request iid when explicitly provided or parsed from ref */
  iid?: number;
  /** @purpose Current git branch when auto-detected */
  branch?: string;
  /** @purpose Personal access token */
  token: string;
};

/** @purpose Error thrown by resolveVcsContext when context resolution fails. */
export class VcsResolveError extends Error {
  /**
   * @purpose Create a VCS resolution error with an optional root cause.
   * @param message Human-readable error description.
   * @param [cause] Original error that triggered this failure.
   */
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'VcsResolveError';
  }
}

/** @purpose Default DI implementation — real child_process and process.env. */
function defaultDeps(): VcsCliDeps {
  return {
    git: async (cmd: string[]) => {
      const { stdout } = await execFileAsync('git', cmd, { encoding: 'utf-8' });
      return String(stdout ?? '').trim();
    },
    env: (name: string) => process.env[name],
  };
}

// #region START_PARSE_GITLAB_REF
/**
 * @purpose Parse a GitLab MR ref of the form group/repo!iid into project and iid.
 * @param ref Raw ref string.
 * @returns Parsed { project, iid } or null when ref does not match the expected format.
 */
function parseGitlabRef(ref: string): { project: string; iid: number } | null {
  const lastExcl = ref.lastIndexOf('!');
  if (lastExcl === -1) return null;

  const project = ref.slice(0, lastExcl);
  const iidRaw = ref.slice(lastExcl + 1);
  const iid = Number(iidRaw);

  if (!project || !Number.isInteger(iid) || iid <= 0) return null;

  return { project, iid };
}
// #endregion END_PARSE_GITLAB_REF

// #region START_PARSE_GIT_REMOTE_URL
/**
 * @purpose Extract host and project from a git remote origin URL (HTTP or SSH).
 * @param url Raw git remote URL.
 * @returns { host, project } or null when the URL format is unrecognized.
 */
function parseGitRemoteUrl(url: string): { host: string; project: string } | null {
  const sshMatch = url.match(/^git@([^:]+):(.+)\.git$/);
  if (sshMatch) {
    return { host: sshMatch[1], project: sshMatch[2] };
  }

  const httpMatch = url.match(/^https?:\/\/([^/]+)\/(.+)\.git$/);
  if (httpMatch) {
    return { host: httpMatch[1], project: httpMatch[2] };
  }

  return null;
}
// #endregion END_PARSE_GIT_REMOTE_URL

/**
 * @purpose Resolve VCS context from CLI args, git state, and environment.
 * @implements {VcsCliContext} in specs/cli/cli.spec.md#VcsCliContext
 * @invariant Priority: ref > project+iid > branch (auto). Provider detected from host.
 * @param args CLI input arguments.
 * @param [deps] Injectable dependencies — defaults to real child_process and process.env.
 * @throws {VcsResolveError} On mutual exclusion, missing token, non-GitLab host, missing git remote, or branch not found.
 * @returns Fully resolved VCS context.
 * @sideEffect Process: runs git rev-parse and git config when auto-detection is needed.
 */
export async function resolveVcsContext(
  args: VcsCliArgs,
  deps: VcsCliDeps = defaultDeps()
): Promise<VcsCliContext> {
  logger.debug('[resolveVcsContext] [idle → resolving]');

  // #region START_VALIDATE_MUTUAL_EXCLUSIVITY
  if (args.ref && args.branch) {
    const msg = '[resolveVcsContext] ref и branch не могут быть указаны одновременно';
    logger.error(`[resolveVcsContext] [resolving → failed] ${msg}`);
    throw new VcsResolveError('ref и branch не могут быть указаны одновременно');
  }
  // #endregion END_VALIDATE_MUTUAL_EXCLUSIVITY

  // #region START_PARSE_REF
  const parsedRef = args.ref ? parseGitlabRef(args.ref) : null;
  if (args.ref && !parsedRef) {
    const msg = `[resolveVcsContext] Некорректный формат ref: ${args.ref}`;
    logger.error(`[resolveVcsContext] [resolving → failed] ${msg}`);
    throw new VcsResolveError(`Некорректный формат ref: ${args.ref}`);
  }
  // #endregion END_PARSE_REF

  const explicitIid = parsedRef?.iid ?? args.iid;
  const explicitProject = parsedRef?.project ?? args.project;

  // #region START_RESOLVE_HOST_AND_PROJECT
  let host = args.host;
  let project = explicitProject;

  if (!host || !project) {
    try {
      logger.debug('[resolveVcsContext] [resolving → fetching-remote]');
      const remoteUrl = await deps.git(['config', 'remote.origin.url']);
      const parsed = parseGitRemoteUrl(remoteUrl);

      if (!parsed) {
        const msg = `[resolveVcsContext] Не удалось разобрать URL удалённого репозитория: ${remoteUrl}`;
        logger.error(`[resolveVcsContext] [resolving → failed] ${msg}`);
        throw new VcsResolveError(`Не удалось разобрать URL удалённого репозитория: ${remoteUrl}`);
      }

      host ??= parsed.host;
      project ??= parsed.project;
    } catch (cause) {
      if (cause instanceof VcsResolveError) throw cause;

      if (!explicitProject) {
        const msg = '[resolveVcsContext] Не найден удалённый репозиторий origin';
        const error = new VcsResolveError('Не найден удалённый репозиторий origin', cause);
        logger.error(`[resolveVcsContext] [resolving → failed] ${msg}`, { error });
        throw error;
      }

      logger.debug(
        `[resolveVcsContext] [resolving → remote-unreachable] project explicit, skipping host auto-detect`
      );
    }
  }

  if (!host || !project) {
    const msg = '[resolveVcsContext] Не удалось определить host и project';
    logger.error(`[resolveVcsContext] [resolving → failed] ${msg}`);
    throw new VcsResolveError('Не удалось определить host и project');
  }
  // #endregion END_RESOLVE_HOST_AND_PROJECT

  const provider: VcsCliContext['provider'] = /github/i.test(host) ? 'github' : 'gitlab';

  // #region START_RESOLVE_BRANCH
  let branch: string | undefined = args.branch;

  if (!parsedRef && explicitIid === undefined) {
    try {
      logger.debug('[resolveVcsContext] [resolving → fetching-branch]');
      branch ??= await deps.git(['rev-parse', '--abbrev-ref', 'HEAD']);
    } catch (cause) {
      const msg =
        '[resolveVcsContext] Не удалось определить текущую ветку без явного ref или project+iid';
      const error = new VcsResolveError(
        'Не удалось определить текущую ветку без явного ref или project+iid',
        cause
      );
      logger.error(`[resolveVcsContext] [resolving → failed] ${msg}`, { error });
      throw error;
    }
  }
  // #endregion END_RESOLVE_BRANCH

  // #region START_RESOLVE_TOKEN
  const token =
    provider === 'github'
      ? (deps.env('GITHUB_PERSONAL_TOKEN') ?? deps.env('GITHUB_TOKEN'))
      : deps.env('GITLAB_PERSONAL_TOKEN');
  if (!token) {
    const envVar =
      provider === 'github' ? 'GITHUB_PERSONAL_TOKEN or GITHUB_TOKEN' : 'GITLAB_PERSONAL_TOKEN';
    const msg = `[resolveVcsContext] Не найден токен доступа. Установите ${envVar}.`;
    logger.error(`[resolveVcsContext] [resolving → failed] ${msg}`);
    throw new VcsResolveError(`Не найден токен доступа. Установите ${envVar}.`);
  }
  // #endregion END_RESOLVE_TOKEN

  const context: VcsCliContext = {
    provider,
    host,
    project,
    iid: explicitIid,
    branch,
    token,
  };

  logger.info(
    `[resolveVcsContext] [resolving → resolved] ${host}/${project}${explicitIid ? `!${explicitIid}` : ''}`
  );
  return context;
}
