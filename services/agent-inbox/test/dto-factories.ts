// @file: dto-factories — valid widget and board-card DTO fixtures for dashboard tests.
// @consumers: agent-inbox dashboard and API test suites
// @tasks: TSK-162, TSK-166

import type { FeedWidget, FeedWidgetType } from '../modules/inbox-api/dto/feed-widget.type.ts';
import type { MrCard } from '../modules/inbox-api/dto/mr-card.type.ts';

const FIXED_TS = '2026-08-07T00:00:00.000Z';

/**
 * @purpose Build a valid feed widget for one closed widget kind.
 * @param type Discriminant that selects the required widget shape.
 * @param [overrides] Scenario-specific fields that replace deterministic defaults.
 * @returns DTO accepted by the inbox API for the requested widget kind.
 */
export function createFeedWidget(
  type: FeedWidgetType,
  overrides: Partial<FeedWidget> = {}
): FeedWidget {
  const base = {
    widgetId: 'group/project!42:1',
    lastActivity: FIXED_TS,
    resolved: false,
    unread: true,
    anchors: [],
  };
  const widget: FeedWidget = (() => {
    switch (type) {
      case 'findings':
        return { ...base, type, payload: { items: [] } };
      case 'threads':
        return { ...base, type, payload: { items: [] } };
      case 'artifact':
        return {
          ...base,
          type,
          payload: { path: 'report.json', title: 'Report', attachments: [] },
        };
      case 'gitlab':
        return { ...base, type, payload: { event: 'updated', data: {} } };
      case 'plan':
        return {
          ...base,
          type,
          payload: { stage: 'review', tracksDone: 0, tracksTotal: 0, queuePosition: 0 },
        };
      case 'progress':
        return { ...base, type, payload: { events: [] } };
      case 'action':
        return { ...base, type, payload: { effect: 'none', result: {} } };
    }
  })();
  return { ...widget, ...overrides } as FeedWidget;
}

/** @purpose Factories for all seven widget discriminants; guards against fixture drift as DTO expands. */
export const feedWidgetFactories: Record<FeedWidgetType, () => FeedWidget> = {
  findings: () => createFeedWidget('findings'),
  threads: () => createFeedWidget('threads'),
  artifact: () => createFeedWidget('artifact'),
  gitlab: () => createFeedWidget('gitlab'),
  plan: () => createFeedWidget('plan'),
  progress: () => createFeedWidget('progress'),
  action: () => createFeedWidget('action'),
};

/**
 * @purpose Build a complete board MR-card DTO for dashboard component tests.
 * @param [overrides] Scenario-specific fields that replace deterministic defaults.
 * @returns DTO accepted by the board API and dashboard components.
 */
export function createMrCard(overrides: Partial<MrCard> = {}): MrCard {
  return {
    ref: 'group/project!42',
    title: 'feat: deterministic dashboard fixture',
    author: 'author',
    myRole: 'reviewer',
    attention: '💬',
    counters: {
      approvals: '1/2',
      reviewers: [{ user: 'reviewer', voted: true }],
      ci: 'success',
      threads: '1/1',
      awaitingMe: 1,
      newCommits: 0,
      unread: 0,
    },
    work: { state: 'idle', label: 'Нет активной задачи', startedAt: null },
    ...overrides,
  };
}
