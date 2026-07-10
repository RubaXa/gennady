// @file: dev-seed — shared mock data factory for dev/e2e.
// @consumers: inbox-serve.ts, vite.config.ts (inboxServePlugin)
// @tasks: TSK-105

import type { BoardProviderMock } from '../inbox-api/board-provider.mock.ts';
import { mockActionableMr } from '../inbox-mocks/mr.mock.ts';

/**
 * @purpose Seed the board provider with dev/e2e test data.
 * @param provider Board provider mock to seed.
 * @returns The seeded board provider.
 */
export async function seedDevData(provider: BoardProviderMock): Promise<BoardProviderMock> {
  const mr1 = mockActionableMr({
    iid: 510,
    title: 'feat: add new feature',
    role: 'reviewer',
    webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/510',
  });
  const mr2 = mockActionableMr({
    iid: 511,
    title: 'fix: resolve critical bug',
    role: 'reviewer',
    stage: 'in_progress',
    webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/511',
  });
  const mr3 = mockActionableMr({
    iid: 512,
    title: 'docs: update README',
    role: 'reviewer',
    stage: 'awaiting_reply',
    directlyAddressed: true,
    webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/512',
  });
  const mr4 = mockActionableMr({
    iid: 400,
    title: 'feat: unassigned improvement',
    role: null,
    author: 'other.dev',
    reviewers: [],
    webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/400',
  });

  provider.seed(
    {
      roles: [
        { name: 'reviewer', active: true },
        { name: 'author', active: true },
        { name: 'mentioned', active: false },
      ],
      unassigned: [mr1, mr2, mr3, mr4],
    },
    {
      [mr1.webUrl]: {
        findings: [
          {
            severity: 'warning',
            file: 'src/utils.ts',
            line: 42,
            message: 'Potential null reference',
          },
          {
            severity: 'info',
            file: 'src/index.ts',
            line: 10,
            message: 'Consider extracting helper',
          },
        ],
        verdict: 'commented',
      },
    }
  );

  const state = (provider as unknown as { _mrs: Map<string, unknown> })._mrs;
  for (const [, entry] of state) {
    const typed = entry as {
      card: { webUrl: string; iid: number };
      assignedRole: string | null;
      lane: string;
    };
    if (typed.card.iid === 510) {
      typed.assignedRole = 'reviewer';
      typed.lane = 'inbox';
    } else if (typed.card.iid === 511) {
      typed.assignedRole = 'reviewer';
      typed.lane = 'inProgress';
    } else if (typed.card.iid === 512) {
      typed.assignedRole = 'reviewer';
      typed.lane = 'awaitingMe';
    }
  }

  return provider;
}
