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
 * @purpose Shared MR projection selected by every actionable source query.
 * @invariant `conflicts` and `headPipeline.status` back the derived blocking state
 *   events (unmergeable / ci_failed) now that pending todos are not a discovery source.
 */
const MR_FIELDS = `iid title webUrl updatedAt draft state
  description diffHeadSha approvalsRequired conflicts
  commits(last: 1) { nodes { committedDate } }
  author { username }
  reviewers(first: 100) { nodes { username } }
  approvedBy(first: 100) { nodes { username } }
  headPipeline { status }
  project { fullPath }`;

/**
 * @purpose Light projection for todo targets — only the ids the opt-in todo path needs.
 * @invariant Retains `state` so merged/closed ghost todos stay droppable downstream.
 */
const TODO_MR_FIELDS = `iid title webUrl updatedAt draft state
  author { username }
  project { fullPath }`;

// Discovery reads the three real relationships to an MR — explicit reviewer, assignee,
// author. Pending todos are deliberately NOT a discovery source: on a live account they
// returned ~1000 rows, ~94% pointing at already merged/closed MRs (ghosts GitLab never
// clears), which both truncated real items past the 100-cap and dominated latency.
/**
 * @purpose Bounded discovery query per real MR relationship (reviewer, assignee, author).
 * @param [updatedAfter] ISO recency cutoff — idle-old MRs the view hides are not fetched.
 * @returns One GraphQL document per connection source.
 */
function CONNECTION_QUERIES(updatedAfter?: string): string[] {
  const bound = updatedAfter ? `, updatedAfter: "${updatedAfter}"` : '';
  return [
    `{ currentUser { reviewRequestedMergeRequests(first: 100, state: opened${bound}) { nodes { ${MR_FIELDS} } } } }`,
    `{ currentUser { assignedMergeRequests(first: 100, state: opened${bound}) { nodes { ${MR_FIELDS} } } } }`,
    `{ currentUser { authoredMergeRequests(first: 100, state: opened${bound}) { nodes { ${MR_FIELDS} } } } }`,
  ];
}

/**
 * @purpose Opt-in pending-todo source — used ONLY for todo management (e.g. marking
 *   todos done), never for inbox discovery. Light projection; caller pays the cost.
 */
const TODOS_QUERY = `{
  currentUser {
    todos(first: 100, state: [pending], type: [MERGEREQUEST]) {
      nodes {
        id
        action
        target {
          __typename
          ... on MergeRequest { ${TODO_MR_FIELDS} }
        }
      }
    }
  }
}`;

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

/** @purpose One pending merge-request todo with the ids needed to reconcile or clear it. */
export type PendingMrTodo = {
  /** @purpose GitLab todo global id, passed to `todoMarkDone` to clear it */
  todoId: string;
  /** @purpose Target MR lifecycle state | @invariant `merged`/`closed` marks a clearable ghost */
  targetState: VcsActionableMrState;
  /** @purpose Target MR project full path */
  project: string;
  /** @purpose Target MR internal id */
  iid: string;
  /** @purpose Target MR web URL (dedup key) */
  webUrl: string;
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
  commits?: { nodes?: ({ committedDate?: string } | null)[] | null } | null;
  approvalsRequired?: number;
  conflicts?: boolean;
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
    | 'headCommittedAt'
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

  // `iid` → one targeted query; `updatedAfter` → ISO recency bound on discovery sources;
  // `includeTodos` → also read pending todos (todo management only, not for discovery).
  /**
   * @param [filter] Scope: `iid`, `updatedAfter`, `includeTodos` (see note above).
   * @returns Deduplicated actionable MRs with one role + state events each; unfiltered.
   * @sideEffect Network: bounded POST /api/graphql reads (three discovery sources,
   *   plus one todos read when `includeTodos`, or one targeted read when `iid`).
   * @see {VcsClientInbox#getActionable} in services/vcs-client/abstract/vcs-client-inbox.ts
   */
  async getActionable(filter?: {
    iid?: string;
    updatedAfter?: string;
    includeTodos?: boolean;
  }): Promise<VcsActionableMr[]> {
    const queries = filter?.iid
      ? [TARGETED_QUERY(filter.iid)]
      : [
          ...CONNECTION_QUERIES(filter?.updatedAfter),
          ...(filter?.includeTodos ? [TODOS_QUERY] : []),
        ];

    // Corporate GitLab/VPN routes can reject a same-origin TLS burst even though every
    // query succeeds alone. There are at most four discovery sources, so preserve the
    // provider order and avoid turning startup into a connection storm.
    const payloads: ActionableData[] = [];
    for (const query of queries) {
      payloads.push((await this._graphql(query)) as ActionableData);
    }
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
            // Connection sources are already `state: opened`; the opt-in todo target
            // still carries `state` so any merged/closed ghost stays droppable downstream.
            state: (node.state as VcsActionableMrState) ?? 'opened',
            // Context for cards/header; raw fact — "did I approve" is the caller's check.
            description: node.description ?? '',
            author: node.author?.username ?? '',
            reviewers: usernames(node.reviewers),
            approvedBy: usernames(node.approvedBy),
            headSha: node.diffHeadSha,
            headCommittedAt: node.commits?.nodes?.at(-1)?.committedDate,
            pipelineStatus: node.headPipeline?.status,
            approvalsRequired: node.approvalsRequired,
          },
          role: null,
          events: new Set(),
          directlyAddressed: false,
          todoIds: [],
        };
        // Blocking state events are derived from MR facts, not pending todos: a failed
        // head pipeline → ci_failed, merge conflicts → unmergeable. (Connection sources
        // carry these fields; the light opt-in todo target does not, and adds its own.)
        if (node.headPipeline?.status === 'FAILED') entry.events.add('ci_failed');
        if (node.conflicts === true) entry.events.add('unmergeable');
        merged.set(node.webUrl, entry);
      }
      return entry;
    };

    const upgradeRole = (entry: Accumulator, role: VcsActionableRole): void => {
      if (!entry.role || ROLE_PRIORITY[role] > ROLE_PRIORITY[entry.role]) entry.role = role;
    };

    // Pass 1: connection sources first — they carry the full MR projection, so an MR
    // seen here keeps its complete fields even when a light todo also points at it.
    for (const user of users) {
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
    // Pass 2: todos last — a MR already merged from a connection keeps its full fields;
    // todos only contribute mention-role, state events and todoIds from a light target.
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
   * @purpose List every pending merge-request todo across all pages — for todo maintenance
   *   (e.g. clearing ghost todos on merged/closed MRs), never for inbox discovery.
   * @returns Each pending todo's id and its target MR state and ref.
   * @sideEffect Network: paginated POST /api/graphql reads until the todo list is exhausted.
   */
  async listPendingTodos(): Promise<PendingMrTodo[]> {
    const out: PendingMrTodo[] = [];
    let after: string | null = null;
    // Page cap is a runaway backstop only; real todo lists are bounded by the account.
    for (let page = 0; page < 50; page++) {
      const cursor = after ? `, after: "${after}"` : '';
      const query = `{
        currentUser {
          todos(first: 100, state: [pending], type: [MERGEREQUEST]${cursor}) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              target { __typename ... on MergeRequest { iid webUrl state project { fullPath } } }
            }
          }
        }
      }`;
      const data = (await this._graphql(query)) as {
        currentUser?: {
          todos?: {
            pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
            nodes?: { id?: string; target?: ({ __typename?: string } & MrNode) | null }[];
          } | null;
        } | null;
      };
      const conn = data?.currentUser?.todos;
      for (const node of conn?.nodes ?? []) {
        const target = node?.target;
        if (target?.__typename !== 'MergeRequest' || !node?.id || !target.webUrl) continue;
        out.push({
          todoId: node.id,
          targetState: (target.state as VcsActionableMrState) ?? 'opened',
          project: target.project?.fullPath ?? '',
          iid: target.iid ?? '',
          webUrl: target.webUrl,
        });
      }
      if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
      after = conn.pageInfo.endCursor;
    }
    return out;
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
