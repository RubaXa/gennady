// @file: GitLab GraphQL implementation of the actionable inbox port.
// @consumers: VcsGitlabClient
// @tasks: N/A

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
 * @purpose Single GraphQL query collecting everything that needs the user's
 *   attention: todos on MRs, MRs where review is requested, and authored MRs.
 * @invariant `type: [MERGEREQUEST]` and `state: [pending]` are list enums on
 *   the todos connection (verified against the live instance).
 */
const MR_FIELDS = `iid title webUrl updatedAt draft state
  description
  author { username }
  reviewers { nodes { username } }
  approvedBy { nodes { username } }
  project { fullPath }`;

const ACTIONABLE_QUERY = `{
  currentUser {
    todos(state: [pending], type: [MERGEREQUEST]) {
      nodes {
        action
        target {
          __typename
          ... on MergeRequest { ${MR_FIELDS} }
        }
      }
    }
    reviewRequestedMergeRequests(state: opened) {
      nodes { ${MR_FIELDS} }
    }
    authoredMergeRequests(state: opened) {
      nodes { ${MR_FIELDS} }
    }
  }
}`;

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
  author?: { username?: string } | null;
  reviewers?: UserConn | null;
  approvedBy?: UserConn | null;
  project?: { fullPath?: string } | null;
};

type TodoNode = {
  action?: string;
  target?: ({ __typename?: string } & MrNode) | null;
};

type ActionableData = {
  currentUser?: {
    todos?: { nodes?: TodoNode[] } | null;
    reviewRequestedMergeRequests?: { nodes?: MrNode[] } | null;
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
  >;
  role: VcsActionableRole | null;
  events: Set<VcsActionableEvent>;
  directlyAddressed: boolean;
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
   * @returns Deduplicated actionable MRs with one role + state events each; unfiltered.
   * @sideEffect Network: POST /api/graphql (currentUser todos + MR connections)
   * @see {VcsClientInbox#getActionable} in services/vcs-client/abstract/vcs-client-inbox.ts
   */
  async getActionable(): Promise<VcsActionableMr[]> {
    const data = (await this._graphql(ACTIONABLE_QUERY)) as ActionableData;
    const user = data?.currentUser;
    if (!user) return [];

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
          },
          role: null,
          events: new Set(),
          directlyAddressed: false,
        };
        merged.set(node.webUrl, entry);
      }
      return entry;
    };

    const upgradeRole = (entry: Accumulator, role: VcsActionableRole): void => {
      if (!entry.role || ROLE_PRIORITY[role] > ROLE_PRIORITY[entry.role]) entry.role = role;
    };

    for (const todo of user.todos?.nodes ?? []) {
      if (todo?.target?.__typename !== 'MergeRequest') continue;
      const entry = ensure(todo.target);
      if (!entry) continue;
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
    for (const mr of user.authoredMergeRequests?.nodes ?? []) {
      const entry = ensure(mr);
      if (entry) upgradeRole(entry, 'author');
    }

    return [...merged.values()].map((entry) => ({
      ...entry.base,
      role: entry.role,
      events: [...entry.events],
      directlyAddressed: entry.directlyAddressed,
    }));
  }
}
