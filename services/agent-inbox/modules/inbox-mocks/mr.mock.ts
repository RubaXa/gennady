// @file: Mock factories for ActionableMr and MrContext — typed mock objects for dev/e2e.
// @consumers: inbox-api tests, inbox-dashboard e2e, inbox-roles tests
// @tasks: TSK-105

/**
 * @purpose An actionable merge request as surfaced by agent-inbox.
 * @invariant iid is a number (not string) — differs from VcsActionableMr which stores iid as string.
 */
export type ActionableMr = {
  /** @purpose Project full path, e.g. group/subgroup/project */
  project: string;
  /** @purpose Merge request internal ID within its project */
  iid: number;
  /** @purpose Web URL of the merge request */
  webUrl: string;
  /** @purpose Merge request title */
  title: string;
  /** @purpose MR description (may be long/empty) */
  description: string;
  /** @purpose Author's username */
  author: string;
  /** @purpose Reviewer usernames assigned to the MR */
  reviewers: string[];
  /** @purpose Usernames who approved the MR */
  approvedBy: string[];
  /** @purpose ISO timestamp of the last update */
  updatedAt: string;
  /** @purpose Whether the MR is a draft */
  draft: boolean;
  /** @purpose MR lifecycle state | @invariant Only `opened` is actionable */
  state: 'opened' | 'closed' | 'locked' | 'merged';
  /** @purpose My role; null when no relationship */
  role: 'reviewer' | 'author' | 'mentioned' | null;
  /** @purpose State events decorating the MR */
  events: string[];
  /** @purpose Whether I was directly addressed in a discussion */
  directlyAddressed: boolean;
  /** @purpose GitLab todo IDs linked to this MR */
  todoIds: string[];
  /** @purpose Current pipeline stage (AI-04) | @invariant One of review_needed/reply_needed/awaiting_reply/idle */
  stage: string;
  /** @purpose Source branch name */
  sourceBranch: string;
  /** @purpose Target branch name */
  targetBranch: string;
};

/**
 * @purpose Full MR context returned by inbox-context (AI-16).
 * @invariant headChanged, newCommits, changeset, stage, openQuestions, lastAuthor, threadStats may be null depending on skip flags.
 */
export type MrContext = {
  /** @purpose MR ref in project!iid format */
  ref: string;
  /** @purpose MR title */
  title: string;
  /** @purpose Web URL of the merge request */
  webUrl: string;
  /** @purpose Source branch name */
  sourceBranch: string;
  /** @purpose Target branch name */
  targetBranch: string;
  /** @purpose ISO creation timestamp */
  createdAt: string;
  /** @purpose ISO last update timestamp */
  updatedAt: string;
  /** @purpose Authenticated user's login */
  myLogin: string;
  /** @purpose Authenticated user's role on this MR */
  myRole: string;
  /** @purpose MR author's username */
  author: string;
  /** @purpose Reviewer usernames */
  reviewers: string[];
  /** @purpose MR description */
  description: string;
  /** @purpose Usernames who approved */
  approvedBy: string[];
  /** @purpose HEAD change info since last reviewed | @invariant null when --skip-worktree */
  headChanged: { kind: string; newCommitCount: number } | null;
  /** @purpose New commits since last reviewed | @invariant null when --skip-worktree */
  newCommits: Array<{ sha: string; subject: string; author: string; date: string }> | null;
  /** @purpose Worktree info | @invariant Contains path, base, diffRefs, repoLayout */
  worktree: {
    path: string;
    base: string;
    diffRefs: string;
    repoLayout: { dirs: string[]; rootFiles: string[] };
  };
  /** @purpose Changeset summary | @invariant null when --skip-worktree */
  changeset: {
    files: Array<{ path: string; status: string; plus: number; minus: number }>;
    totals: { files: number; plus: number; minus: number };
    byCategory: Record<string, { files: number; plus: number; minus: number; added: number }>;
  } | null;
  /** @purpose Pipeline stage (AI-04) | @invariant null when --skip-threads */
  stage: string | null;
  /** @purpose Count of open questions | @invariant null when --skip-threads */
  openQuestions: number | null;
  /** @purpose Last comment author | @invariant null when --skip-threads */
  lastAuthor: string | null;
  /** @purpose Thread statistics | @invariant null when --skip-threads */
  threadStats: { total: number; drafts: number } | null;
};

/** @purpose Default values for mockActionableMr factory. */
const DEFAULT_ACTIONABLE_MR: ActionableMr = {
  project: 'group/project',
  iid: 510,
  webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/510',
  title: 'feat: add new feature',
  description: '',
  author: 'j.doe',
  reviewers: ['k.lebedev'],
  approvedBy: [],
  updatedAt: '2026-07-10T10:00:00Z',
  draft: false,
  state: 'opened',
  role: 'reviewer',
  events: [],
  directlyAddressed: false,
  todoIds: [],
  stage: 'review_needed',
  sourceBranch: 'feature/new-feature',
  targetBranch: 'main',
};

/** @purpose Default values for mockMrContext factory. */
const DEFAULT_MR_CONTEXT: MrContext = {
  ref: 'group/project!510',
  title: 'feat: add new feature',
  webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/510',
  sourceBranch: 'feature/new-feature',
  targetBranch: 'main',
  createdAt: '2026-07-01T08:00:00Z',
  updatedAt: '2026-07-10T10:00:00Z',
  myLogin: 'k.lebedev',
  myRole: 'reviewer',
  author: 'j.doe',
  reviewers: ['k.lebedev'],
  description: '',
  approvedBy: [],
  headChanged: null,
  newCommits: null,
  worktree: {
    path: '/tmp/worktree/group__project-510',
    base: '/repos/group/project',
    diffRefs: 'main...feature/new-feature',
    repoLayout: { dirs: ['src', 'src/utils'], rootFiles: ['package.json', 'tsconfig.json'] },
  },
  changeset: {
    files: [{ path: 'src/index.ts', status: 'modified', plus: 10, minus: 2 }],
    totals: { files: 1, plus: 10, minus: 2 },
    byCategory: { code: { files: 1, plus: 10, minus: 2, added: 0 } },
  },
  stage: 'review_needed',
  openQuestions: 0,
  lastAuthor: 'j.doe',
  threadStats: { total: 1, drafts: 0 },
};

/**
 * @purpose Create a mock ActionableMr with overridable fields.
 * @param [overrides] Partial object to merge over defaults.
 * @returns Fully populated ActionableMr.
 */
export function mockActionableMr(overrides?: Partial<ActionableMr>): ActionableMr {
  if (!overrides) return { ...DEFAULT_ACTIONABLE_MR };
  return { ...DEFAULT_ACTIONABLE_MR, ...overrides };
}

/**
 * @purpose Create a mock MrContext with overridable fields.
 * @param [overrides] Partial object to merge over defaults.
 * @returns Fully populated MrContext.
 */
export function mockMrContext(overrides?: Partial<MrContext>): MrContext {
  if (!overrides) return { ...DEFAULT_MR_CONTEXT };
  return { ...DEFAULT_MR_CONTEXT, ...overrides };
}
