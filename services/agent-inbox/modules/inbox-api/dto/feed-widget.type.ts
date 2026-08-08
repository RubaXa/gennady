// @file: FeedWidget DTO — canonical discriminated feed-widget surface from inbox-api spec §4.
// @consumers: FeedProjection, feed.router.ts, inbox-dashboard
// @tasks: TSK-162

/** @purpose Meta-anchor transported with a widget into inbox-chat (inbox-chat §2). */
export type FeedWidgetAnchor = {
  /** @purpose Widget that owns this anchor. */
  widgetId: string;
  /** @purpose Optional durable artifact location. */
  artifactPath?: string;
  /** @purpose Optional non-text element identity. */
  elementId?: string;
  /** @purpose Optional character offsets in the raw artifact. */
  fragment?: { start: number; end: number };
  /** @purpose Re-anchoring excerpt from the artifact. */
  quote?: string;
};

/** @purpose Common fields every feed widget exposes, regardless of its payload. */
type FeedWidgetBase<TType extends string, TPayload> = {
  widgetId: string;
  type: TType;
  lastActivity: string;
  resolved: boolean;
  unread: boolean;
  anchors: FeedWidgetAnchor[];
  payload: TPayload;
};

/** @purpose Findings payload widget. */
export type FindingsWidget = FeedWidgetBase<
  'findings',
  {
    items: {
      id: string;
      severity: string;
      file: string;
      line: number;
      summary: string;
      state: string;
    }[];
  }
>;
/** @purpose Discussion threads payload widget. */
export type ThreadsWidget = FeedWidgetBase<
  'threads',
  {
    items: {
      threadId: string;
      author: string;
      quote: string;
      factcheck: string;
      reactions: unknown[];
    }[];
  }
>;
/** @purpose Produced artifact payload widget. */
export type ArtifactWidget = FeedWidgetBase<
  'artifact',
  { path: string; title: string; attachments: unknown[] }
>;
/** @purpose GitLab event payload widget. */
export type GitlabWidget = FeedWidgetBase<
  'gitlab',
  { event: string; data: unknown; taskId?: string }
>;
/** @purpose Plan progress payload widget. */
export type PlanWidget = FeedWidgetBase<
  'plan',
  { stage: string; tracksDone: number; tracksTotal: number; queuePosition: number }
>;
/** @purpose Durable work-event payload widget. */
export type ProgressWidget = FeedWidgetBase<'progress', { events: unknown[] }>;
/** @purpose Applied effect payload widget. */
export type ActionWidget = FeedWidgetBase<'action', { effect: string; result: unknown }>;

/** @purpose Closed canonical seven-kind widget union required by inbox-api spec §4. */
export type FeedWidget =
  | FindingsWidget
  | ThreadsWidget
  | ArtifactWidget
  | GitlabWidget
  | PlanWidget
  | ProgressWidget
  | ActionWidget;

/** @purpose Discriminant values of the canonical FeedWidget union. */
export type FeedWidgetType = FeedWidget['type'];

/** @purpose Result of a feed projection — paginated widget slice plus the next cursor. */
export type FeedProjectionResult = {
  /** @purpose Canonical widget page. */
  widgets: FeedWidget[];
  /** @purpose Cursor for the following page. */
  nextCursor: number;
};
