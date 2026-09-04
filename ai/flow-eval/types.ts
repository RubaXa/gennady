// @file: Typed contracts for the external SDD evaluation harness.
// @consumers: runner, observer, judge, OpenCode adapter, fake-backed tests

/** @purpose An SDD scenario that can be evaluated without coupling the runner to telemetry. */
export type SddEvalScenario = {
  /** @purpose Stable scenario identifier used in reports and parallel-run coordination. */
  id: string;
  /** @purpose User intent sent to the worker and later passed unchanged to the judge. */
  intent: string;
  /** @purpose Working directory for the OpenCode session. */
  directory?: string;
  /** @purpose Optional built-in fixture provisioned into an isolated temp directory. */
  fixture?: SddEvalFixtureId;
  /** @purpose SDD phase selected by the scenario; runner never falls back to generic coding. */
  phase: SddEvalPhase;
  /** @purpose Explicit execution mode within the selected SDD phase. */
  mode: SddEvalMode;
  /** @purpose Synthetic operator-confirmed authoring depth; avoids silently inferred SCALE in headless runs. */
  scale?: 'product' | 'module' | 'function' | 'fix';
  /** @purpose Optional acceptance signal the judge can use when interpreting the diff. */
  acceptance?: string;
};

/** @purpose Supported intellectual SDD flow phases exercised by the harness. */
export type SddEvalPhase = 'spec-authoring' | 'scaffold' | 'execute' | 'repair';

/** @purpose Human-auditable phase modes with approval boundaries. */
export type SddEvalMode =
  | 'full-spec-to-approval-1'
  | 'actual-tickets-to-approval-2'
  | 'canonical-execute'
  // Repair: the workspace already holds specs that fail `sdd-check`; drive the flow to a clean check.
  | 'fix-to-clean';

/** @purpose Prepared, small, deterministic fixture scenarios for cheap eval smoke runs. */
export type SddEvalFixtureId =
  | 'fibonacci-library'
  | 'tic-tac-toe'
  | 'slugify-toolchain'
  // A repository whose specs are structurally complete but carry deliberate, checker-visible defects
  // (e.g. an invalid mermaid diagram). Exercises the repair trajectory: does the worker self-correct
  // from the validator's own error, without any how-to guidance in the prompt/directive?
  | 'broken-specs';

/** @purpose Provider/model selection accepted by OpenCode's SDK. */
export type OpenCodeModel = {
  providerID: string;
  modelID: string;
};

/** @purpose External runner configuration; no session trace or JSON output settings are present. */
export type SddEvalConfig = {
  /** @purpose OpenCode server base URL. */
  baseUrl: string;
  /** @purpose Model used for worker turns. */
  runnerModel: OpenCodeModel;
  /** @purpose Model used for the isolated judge turn. */
  judgeModel: OpenCodeModel;
  /** @purpose Provider/model agent name, when configured by the server. */
  agent?: string;
  /** @purpose Maximum number of worker scenarios active at once. */
  concurrency: number;
  /** @purpose Observer interval; production default is five minutes. */
  observeEveryMs: number;
  /** @purpose Number of unchanged observations before a scenario is marked stuck. */
  stuckAfter: number;
  /** @purpose Hard observation budget; changing activity cannot keep a scenario alive forever. */
  maxObservations: number;
  /** @purpose Maximum tail messages requested from OpenCode per observation. */
  tailLimit: number;
  /** @purpose Optional compact progress sink; receives bounded observations only. */
  onObservation?: (scenarioId: string, observation: SddEvalObservation) => void | Promise<void>;
};

/** @purpose A bounded, external view of an OpenCode message part. */
export type SddEvalTailEntry = {
  messageId: string;
  role: 'user' | 'assistant' | string;
  createdAt?: number;
  text: string;
  /** @purpose Stable digest used to detect progress without persisting full transcripts. */
  fingerprint: string;
  /** @purpose Compact tool activity summary, retained so repeated bash/tool loops are observable. */
  toolCalls: Array<{
    callId: string;
    tool: string;
    status: 'pending' | 'running' | 'completed' | 'error' | string;
    inputSummary?: string;
  }>;
};

/** @purpose A compact event fact captured externally from the OpenCode event stream. */
export type SddEvalEvent = {
  id?: string;
  type: string;
  sessionId?: string;
  at?: number;
  summary?: string;
};

/** @purpose One observer observation, bounded to the configured tail and event window. */
export type SddEvalObservation = {
  at: number;
  status: 'running' | 'idle' | 'completed' | 'error' | 'unknown';
  tail: SddEvalTailEntry[];
  events: SddEvalEvent[];
  progress: boolean;
  /** @purpose True only when the repository diff changed; separates artifact work from new chatter/reads. */
  artifactProgress: boolean;
  /** @purpose Whether any repository diff exists at this snapshot. */
  hasArtifactDiff: boolean;
  /** @purpose Stable bounded digest of the diff, never the diff bytes themselves. */
  artifactFingerprint: string;
  /** @purpose Consecutive observations without a diff change. */
  artifactRepeatCount: number;
  /** @purpose Tool calls visible in the current bounded tail. */
  toolCallCount: number;
  repeated: boolean;
  /** @purpose Consecutive unchanged snapshots, used for deterministic stuck detection. */
  repeatCount: number;
  errors: string[];
  waiting: boolean;
  stuck: boolean;
};

/** @purpose Per-run token + cost totals, summed across the worker session and its children. The A/B
 * currency: tokens and tool-calls are model input/output, independent of machine load, so runs on
 * different servers are still comparable. */
export type SddEvalUsage = {
  /** @purpose Assistant messages counted (parent + children). */
  messages: number;
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  /** @purpose input + output + reasoning — the headline consumption figure. */
  total: number;
  /** @purpose Provider-reported cost, summed. */
  cost: number;
};

/** @purpose Worker result plus the evidence needed by the judge. */
export type SddEvalWorkerResult = {
  scenarioId: string;
  sessionId: string;
  intent: string;
  diff: string;
  observations: SddEvalObservation[];
  events: SddEvalEvent[];
  tail: SddEvalTailEntry[];
  status: SddEvalObservation['status'];
  /** @purpose Token/cost totals for the run; absent when the evidence source cannot report them. */
  usage?: SddEvalUsage;
  error?: string;
};

/** @purpose Narrow judge input; worker prompt/response and unbounded session data are excluded. */
export type SddEvalJudgeInput = {
  intent: string;
  /** @purpose Exact bounded acceptance facts; unlike the intent, this carries numeric/negative edges. */
  acceptance?: string;
  diff: string;
  events: SddEvalEvent[];
  tail: SddEvalTailEntry[];
  state: {
    status: SddEvalObservation['status'];
    stuck: boolean;
    waiting: boolean;
    errors: string[];
  };
};

/** @purpose Structured judge outcome. */
export type SddEvalJudgeResult = {
  scenarioId: string;
  verdict: 'pass' | 'fail' | 'inconclusive';
  rationale: string;
  model: OpenCodeModel;
};

/** @purpose Provider-neutral SDK operations required by the harness. */
export interface SddEvalRuntime {
  createSession(input: { title: string; directory: string }): Promise<{ id: string }>;
  prompt(input: {
    sessionId: string;
    /** @purpose Exact sandbox cwd repeated on the worker prompt request. */
    directory: string;
    text: string;
    model: OpenCodeModel;
    agent?: string;
    system?: string;
  }): Promise<void>;
  /** @purpose Abort a worker session after an externally detected stuck observation. */
  abort?(sessionId: string): Promise<void>;
  judge(input: { directory: string; prompt: string; model: OpenCodeModel }): Promise<string>;
}

/** @purpose Shared session-to-working-directory binding used by every SDK operation. */
export interface SddEvalSessionDirectoryRegistry {
  set(sessionId: string, directory: string): void;
  get(sessionId: string): string | undefined;
}

/** @purpose External evidence source; production implementation can be SDK/SQLite backed, tests use fakes. */
export interface SddEvalEvidenceSource {
  readTail(sessionId: string, limit: number): Promise<SddEvalTailEntry[]>;
  readEvents(sessionId: string): Promise<SddEvalEvent[]>;
  readDiff(sessionId: string): Promise<string>;
  readStatus(sessionId: string): Promise<SddEvalObservation['status']>;
  /** @purpose Sum token/cost usage across the session and its children; optional so fakes may omit it. */
  readUsage?(sessionId: string): Promise<SddEvalUsage>;
}
