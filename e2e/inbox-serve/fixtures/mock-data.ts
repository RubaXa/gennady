// @file: Mock data scenarios for inbox-dashboard e2e tests.
// @consumers: e2e/inbox-serve/*.spec.ts
// @tasks: TSK-107, TSK-108

import type {
  BoardData,
  RoleView,
  MrCard,
  MrDetail,
} from '../../services/agent-inbox/modules/inbox-api/types.ts';
import type { AuditEntry } from '../../services/agent-inbox/modules/inbox-core/audit-log.ts';

/**
 * @purpose Create a minimal board with one role and a few MRs for smoke testing.
 * @returns BoardData fixture.
 */
export function smokeBoardData(): BoardData {
  const sampleMr: MrCard = {
    project: 'group/project',
    iid: 510,
    webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/510',
    title: 'feat: add new feature',
    description: '',
    author: 'j.doe',
    reviewers: ['k.lebedev'],
    approvedBy: [],
    updatedAt: new Date().toISOString(),
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

  const reviewerLaneMr: MrCard = {
    ...sampleMr,
    iid: 511,
    title: 'fix: resolve bug',
    stage: 'in_progress',
  };
  const awaitingMr: MrCard = {
    ...sampleMr,
    iid: 512,
    title: 'docs: update README',
    stage: 'awaiting_reply',
    directlyAddressed: true,
  };

  const reviewerRole: RoleView = {
    name: 'reviewer',
    active: true,
    lanes: {
      inbox: [sampleMr],
      inProgress: [reviewerLaneMr],
      awaitingMe: [awaitingMr],
      done: [],
    },
  };

  return {
    roles: [reviewerRole],
    unassigned: [],
  };
}

/**
 * @purpose Board data with multiple roles and unassigned MRs.
 * @returns BoardData fixture.
 */
export function multiRoleBoardData(): BoardData {
  const baseMr: MrCard = {
    project: 'team/backend',
    iid: 200,
    webUrl: 'https://gitlab.example.com/team/backend/-/merge_requests/200',
    title: 'refactor: extract service layer',
    description: '',
    author: 'a.smith',
    reviewers: [],
    approvedBy: [],
    updatedAt: new Date().toISOString(),
    draft: false,
    state: 'opened',
    role: null,
    events: [],
    directlyAddressed: false,
    todoIds: [],
    stage: 'review_needed',
    sourceBranch: 'refactor/service-layer',
    targetBranch: 'main',
  };

  return {
    roles: [
      {
        name: 'reviewer',
        active: true,
        lanes: {
          inbox: [{ ...baseMr, iid: 201, title: 'feat: new endpoint', role: 'reviewer' }],
          inProgress: [
            {
              ...baseMr,
              iid: 202,
              title: 'fix: race condition',
              role: 'reviewer',
              stage: 'in_progress',
            },
          ],
          awaitingMe: [],
          done: [
            { ...baseMr, iid: 203, title: 'chore: update deps', role: 'reviewer', stage: 'idle' },
          ],
        },
      },
      {
        name: 'author',
        active: true,
        lanes: {
          inbox: [],
          inProgress: [
            { ...baseMr, iid: 300, title: 'WIP: draft feature', role: 'author', draft: true },
          ],
          awaitingMe: [
            {
              ...baseMr,
              iid: 301,
              title: 'docs: api guide',
              role: 'author',
              directlyAddressed: true,
            },
          ],
          done: [],
        },
      },
      {
        name: 'mentioned',
        active: false,
        lanes: {
          inbox: [],
          inProgress: [],
          awaitingMe: [],
          done: [],
        },
      },
    ],
    unassigned: [{ ...baseMr, iid: 400, title: 'feat: unassigned MR', role: null }],
  };
}

// #region START_SEEDED_BOARD_DATA — matches inbox-serve.ts seed: MRs 510, 511, 512, 400
/**
 * @purpose Board data matching what inbox-serve.ts seeds on startup.
 * @returns BoardData with reviewer role populated and one unassigned MR.
 */
export function seededBoardData(): BoardData {
  const now = new Date().toISOString();
  const mr510: MrCard = {
    project: 'group/project',
    iid: 510,
    webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/510',
    title: 'feat: add new feature',
    description: '',
    author: 'j.doe',
    reviewers: ['k.lebedev'],
    approvedBy: [],
    updatedAt: now,
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
  const mr511: MrCard = {
    ...mr510,
    iid: 511,
    title: 'fix: resolve critical bug',
    stage: 'in_progress',
  };
  const mr512: MrCard = {
    ...mr510,
    iid: 512,
    title: 'docs: update README',
    stage: 'awaiting_reply',
    directlyAddressed: true,
  };
  const mr400: MrCard = {
    ...mr510,
    iid: 400,
    title: 'feat: unassigned improvement',
    role: null,
    author: 'other.dev',
    reviewers: [],
  };

  return {
    roles: [
      {
        name: 'reviewer',
        active: true,
        lanes: { inbox: [mr510], inProgress: [mr511], awaitingMe: [mr512], done: [] },
      },
      {
        name: 'author',
        active: true,
        lanes: { inbox: [], inProgress: [], awaitingMe: [], done: [] },
      },
      {
        name: 'mentioned',
        active: false,
        lanes: { inbox: [], inProgress: [], awaitingMe: [], done: [] },
      },
    ],
    unassigned: [mr400],
  };
}
// #endregion END_SEEDED_BOARD_DATA

// #region START_MR_DETAIL_510 — matches report for group/project!510 from inbox-serve
/**
 * @purpose Expected MR detail response for group/project!510 (seeded with findings in inbox-serve.ts).
 * @returns MrDetail fixture.
 */
export function mrDetail510(): MrDetail {
  const now = new Date().toISOString();
  const audit: AuditEntry[] = [
    {
      ts: now,
      mr: 'group/project!510',
      role: 'system',
      event: 'seeded',
      detail: 'MR seeded into mock board',
    },
    {
      ts: now,
      mr: 'group/project!510',
      role: 'reviewer',
      event: 'assigned',
      detail: 'Assigned to role reviewer',
    },
  ];

  return {
    mr: {
      project: 'group/project',
      iid: 510,
      webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/510',
      title: 'feat: add new feature',
      description: '',
      author: 'j.doe',
      reviewers: ['k.lebedev'],
      approvedBy: [],
      updatedAt: now,
      draft: false,
      state: 'opened',
      role: 'reviewer',
      events: [],
      directlyAddressed: false,
      todoIds: [],
      stage: 'review_needed',
      sourceBranch: 'feature/new-feature',
      targetBranch: 'main',
    },
    findings: [
      { severity: 'warning', file: 'src/utils.ts', line: 42, message: 'Potential null reference' },
      { severity: 'info', file: 'src/index.ts', line: 10, message: 'Consider extracting helper' },
    ],
    verdict: 'commented',
    audit,
  };
}
// #endregion END_MR_DETAIL_510
