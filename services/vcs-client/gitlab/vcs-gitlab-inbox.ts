// @file: GitLab GraphQL implementation of the actionable inbox port.
// @consumers: VcsGitlabClient
// @tasks: TSK-75, TSK-158, TSK-174

import { VcsClientInbox } from '../abstract/vcs-client-inbox.ts';
import type {
  VcsActionableMr,
  VcsActionableMrState,
  VcsActionableRole,
  VcsActionableEvent,
} from '../entities/vcs-actionable-mr.type.ts';

/** @purpose GraphQL request adapter: runs a query, returns the `data` payload. */
type GraphqlRequestFn = (query: string, variables?: Record<string, unknown>) => Promise<unknown>;

/**
 * @purpose Shared MR projection selected independently by every actionable source query.
 * @invariant `type: [MERGEREQUEST]` and `state: [pending]` are list enums on
 *   the todos connection (verified against the live instance).
 */
const MR_FIELDS = `iid title webUrl updatedAt draft state
  description diffHeadSha approvalsRequired
  author { username }
  reviewers(first: 100) { nodes { username } }
  approvedBy(first: 100) { nodes { username } }
  headPipeline { status }
  project { fullPath }`;

/**
 * @purpose Complexity-bounded source queries executed separately for GitLab instances with a low query budget.
 * @invariant Every document contains exactly one root connection below `currentUser`.
 * @invariant All root connections are explicitly bounded; result normalization remains cross-source deduplicated.
 */
const ACTIONABLE_QUERIES = [
  `{
    currentUser {
      todos(first: 100, state: [pending], type: [MERGEREQUEST]) {
        nodes {
          id
          action
          target {
            __typename
            ... on MergeRequest { ${MR_FIELDS} }
          }
        }
      }
    }
  }`,
  `{
    currentUser {
      reviewRequestedMergeRequests(first: 100, state: opened) {
        nodes { ${MR_FIELDS} }
      }
    }
  }`,
  `{
    currentUser {
      assignedMergeRequests(first: 100, state: opened) {
        nodes { ${MR_FIELDS} }
      }
    }
  }`,
  `{
    currentUser {
      authoredMergeRequests(first: 100, state: opened) {
        nodes { ${MR_FIELDS} }
      }
    }
  }`,
] as const;

/**
 * @purpose Build a single targeted query scoped to one MR IID — eliminates the 4×broad-query
 *   overhead when the caller knows which MR to look up.
 * @param iid MR internal ID.
 * @returns GraphQL query document.
 */
function TARGETED_QUERY(iid: string): string {
  return `{
    currentUser {
      authoredMergeRequests(first: 1, iids: ["${iid}"]) {
        nodes { ${MR_FIELDS} }
      }
      reviewRequestedMergeRequests(first: 1, iids: ["${iid}"]) {
        nodes { ${MR_FIELDS} }
      }
      assignedMergeRequests(first: 1, iids: ["${iid}"]) {
        nodes { ${MR_FIELDS} }
      }
    }
  }`;
}

/** @purpose GitLab Todo action name → my role on the MR (priority resolved later). */
const ACTION_ROLE: Record<string, VcsActionableRole> = {
  review_requested: 'reviewer',
  approval_required: 'reviewer',
  mentioned: 'mentioned',
  directly_addressed: 'mentioned',
  assigned: 'mentioned',
};

/** @purpose GitLab Todo action name → state event decorating the MR. */
const ACTION_EVENT: Record<string, VcsActionableEvent> = {
  build_failed: 'ci_failed',
  unmergeable: 'unmergeable',
  merge_train_removed: 'merge_train_removed',
  review_submitted: 'review_submitted',
};

/** @purpose Role precedence when several sources point to the same MR. */
const ROLE_PRIORITY: Record<VcsActionableRole, number> = {
  author: 3,
  reviewer: 2,
  mentioned: 1,
};

/** @purpose A GraphQL `{ nodes: [{ username }] }` user connection. */
type UserConn = { nodes?: ({ username?: string } | null)[] | null };

/** @purpose Pluck usernames from a GraphQL user connection, dropping blanks. */
const usernames = (conn: UserConn | null | undefined): string[] =>
  (conn?.nodes ?? []).map((n) => n?.username ?? '').filter(Boolean);

/** @purpose Raw MergeRequest node shape returned by the GraphQL query. */
type MrNode = {
  iid?: string;
  title?: string;
  webUrl?: string;
  updatedAt?: string;
  draft?: boolean;
  state?: string;
  description?: string;
  diffHeadSha?: string;
  approvalsRequired?: number;
  author?: { username?: string } | null;
  reviewers?: UserConn | null;
  approvedBy?: UserConn | null;
  headPipeline?: { status?: string } | null;
  project?: { fullPath?: string } | null;
};

type TodoNode = {
  id?: string;
  action?: string;
  target?: ({ __typename?: string } & MrNode) | null;
};

type ActionableData = {
  currentUser?: {
    todos?: { nodes?: TodoNode[] } | null;
    reviewRequestedMergeRequests?: { nodes?: MrNode[] } | null;
    assignedMergeRequests?: { nodes?: MrNode[] } | null;
    authoredMergeRequests?: { nodes?: MrNode[] } | null;
  } | null;
};

/** @purpose Mutable accumulator merging one MR's facts across sources. */
type Accumulator = {
  base: Pick<
    VcsActionableMr,
    | 'iid'
    | 'project'
    | 'webUrl'
    | 'title'
    | 'updatedAt'
    | 'draft'
    | 'state'
    | 'description'
    | 'author'
    | 'reviewers'
    | 'approvedBy'
    | 'headSha'
    | 'pipelineStatus'
    | 'approvalsRequired'
  >;
  role: VcsActionableRole | null;
  events: Set<VcsActionableEvent>;
  directlyAddressed: boolean;
  todoIds: string[];
};

/**
 * @purpose Access the GitLab actionable inbox via GraphQL.
 * @invariant Error Policy: Transport/GraphQL errors propagated to caller.
 * @invariant Pure normalization: no filtering, grouping, or staleness — that is the consumer's policy.
 * @consumer VcsGitlabClient
 */
export class VcsGitlabInbox extends VcsClientInbox {
  /** @purpose Bound GraphQL request function injected for GitLab API calls */
  protected _graphql: GraphqlRequestFn;

  /**
   * @purpose Wire the GraphQL request adapter for the inbox query.
   * @param graphql Authenticated GraphQL request function targeting GitLab.
   */
  constructor(graphql: GraphqlRequestFn) {
    super();
    this._graphql = graphql;
  }

  /**
   * @param [filter] When `iid` is provided, uses a single targeted query instead of 4 broad ones.
   * @returns Deduplicated actionable MRs with one role + state events each; unfiltered.
   * @sideEffect Network: one or four bounded POST /api/graphql reads.
   * @see {VcsClientInbox#getActionable} in services/vcs-client/abstract/vcs-client-inbox.ts
   */
  async getActionable(filter?: { iid?: string }): Promise<VcsActionableMr[]> {
    const queries = filter?.iid
      ? [TARGETED_QUERY(filter.iid)]
      : (ACTIONABLE_QUERIES as unknown as string[]);

    const payloads = (await Promise.all(
      queries.map((query) => this._graphql(query))
    )) as ActionableData[];
    const users = payloads.flatMap((payload) =>
      payload?.currentUser ? [payload.currentUser] : []
    );
    if (users.length === 0) return [];

    const merged = new Map<string, Accumulator>();

    const ensure = (node: MrNode | null | undefined): Accumulator | null => {
      if (!node || !node.webUrl) return null;
      let entry = merged.get(node.webUrl);
      if (!entry) {
        entry = {
          base: {
            iid: node.iid ?? '',
            project: node.project?.fullPath ?? '',
            webUrl: node.webUrl,
            title: node.title ?? '',
            updatedAt: node.updatedAt ?? '',
            draft: node.draft ?? false,
            // `state` is queried on the todos target so merged/closed MRs (whose
            // pending todo GitLab never auto-clears) can be filtered downstream.
            // The connection-based sources are already `state: opened`.
            state: (node.state as VcsActionableMrState) ?? 'opened',
            // Context for cards/header; raw fact — "did I approve" is the caller's check.
            description: node.description ?? '',
            author: node.author?.username ?? '',
            reviewers: usernames(node.reviewers),
            approvedBy: usernames(node.approvedBy),
            headSha: node.diffHeadSha,
            pipelineStatus: node.headPipeline?.status,
            approvalsRequired: node.approvalsRequired,
          },
          role: null,
          events: new Set(),
          directlyAddressed: false,
          todoIds: [],
        };
        merged.set(node.webUrl, entry);
      }
      return entry;
    };

    const upgradeRole = (entry: Accumulator, role: VcsActionableRole): void => {
      if (!entry.role || ROLE_PRIORITY[role] > ROLE_PRIORITY[entry.role]) entry.role = role;
    };

    for (const user of users) {
      for (const todo of user.todos?.nodes ?? []) {
        if (todo?.target?.__typename !== 'MergeRequest') continue;
        const entry = ensure(todo.target);
        if (!entry) continue;
        if (todo.id && !entry.todoIds.includes(todo.id)) entry.todoIds.push(todo.id);
        const action = todo.action ?? '';
        const role = ACTION_ROLE[action];
        if (role) upgradeRole(entry, role);
        const event = ACTION_EVENT[action];
        if (event) entry.events.add(event);
        if (action === 'directly_addressed') entry.directlyAddressed = true;
      }
      for (const mr of user.reviewRequestedMergeRequests?.nodes ?? []) {
        const entry = ensure(mr);
        if (entry) upgradeRole(entry, 'reviewer');
      }
      for (const mr of user.assignedMergeRequests?.nodes ?? []) {
        const entry = ensure(mr);
        if (entry) upgradeRole(entry, 'mentioned');
      }
      for (const mr of user.authoredMergeRequests?.nodes ?? []) {
        const entry = ensure(mr);
        if (entry) upgradeRole(entry, 'author');
      }
    }

    return [...merged.values()].map((entry) => ({
      ...entry.base,
      role: entry.role,
      events: [...entry.events],
      directlyAddressed: entry.directlyAddressed,
      todoIds: entry.todoIds,
      approvalsRequired: entry.base.approvalsRequired,
    }));
  }

  /**
   * @param query Identifies the todo to mark as completed.
   * @returns Promise that resolves when the mutation completes.
   * @see {VcsClientInbox#markTodoDone} in services/vcs-client/abstract/vcs-client-inbox.ts
   */
  async markTodoDone(query: { todoId: string }): Promise<void> {
    const mutation = `mutation ($input: TodoMarkDoneInput!) {
      todoMarkDone(input: $input) {
        errors
      }
    }`;
    await this._graphql(mutation, { input: { id: query.todoId } });
  }
}
