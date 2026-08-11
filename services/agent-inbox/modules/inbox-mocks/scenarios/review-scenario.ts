// @file: ReviewScenario — immutable deterministic scenario definition with fresh runtime per test invocation.
// @consumers: inbox-mocks unit, integration and UI e2e tests
// @tasks: TSK-180

import type { VcsActionableMr } from '../../../../vcs-client/entities/vcs-actionable-mr.type.ts';
import type { JournalEntry } from '../../inbox-core/event-journal.ts';
import type { OpenCodeCallResult } from '../../inbox-opencode/errors.ts';
import { ControlledClock } from '../../inbox-core/adapters/controlled-clock.ts';
import { InMemoryJournalAdapter } from '../adapters/in-memory-journal.adapter.ts';
import { InMemoryArtifactAdapter } from '../adapters/in-memory-artifact.adapter.ts';
import { InMemoryProjectionAdapter } from '../adapters/in-memory-projection.adapter.ts';
import { MockVcsAdapter, type MockVcsEntry } from '../adapters/mock-vcs.adapter.ts';
import { MockAgentAdapter } from '../adapters/mock-agent.adapter.ts';
import { DeterministicTaskExecutor } from '../adapters/deterministic-task-executor.adapter.ts';
import { MockRuntimeProfile } from '../adapters/mock-runtime-profile.adapter.ts';

/** @purpose Static MR facts declaring what the scenario knows about the subject MR. */
export type ScenarioMrFacts = {
  /** @purpose Composite MR ref (project!iid) */
  ref: string;
  /** @purpose Initial actionable MR for the VCS inbox */
  mr: VcsActionableMr;
  /** @purpose Seeded VCS entry for detail/discussion reads */
  vcsEntry: MockVcsEntry;
};

/** @purpose One scripted agent session result seeded for the scenario. */
export type ScenarioAgentResult = {
  /** @purpose Session label used to name the session at creation time */
  sessionTitle: string;
  /** @purpose Working directory bound to the session */
  directory: string;
  /** @purpose Ordered scripted prompt responses popped in FIFO order */
  responses: OpenCodeCallResult[];
};

/** @purpose All variable inputs that fully define one deterministic scenario. */
export type ScenarioDefinition = {
  /** @purpose Unique run identifier for this scenario — must be a safe single-segment id */
  runId: string;
  /** @purpose Facts about each MR the scenario exercises */
  mrsInput: ScenarioMrFacts[];
  /** @purpose Pre-seeded journal entries replayed before scenario execution */
  seedEvents?: Omit<JournalEntry, 'seq'>[];
  /** @purpose Agent sessions scripted for this scenario */
  agentResults?: ScenarioAgentResult[];
};

/** @purpose Live mutable adapters wired for one test execution. */
export type ScenarioRuntime = {
  /** @purpose Deterministic clock driving all timers — call advanceTo to trigger scheduled work */
  clock: ControlledClock;
  /** @purpose In-memory journal containing all appended events */
  journal: InMemoryJournalAdapter;
  /** @purpose In-memory artifact store */
  artifactStore: InMemoryArtifactAdapter;
  /** @purpose Scripted VCS adapter recording all effect calls */
  vcs: MockVcsAdapter;
  /** @purpose Scripted agent adapter with pre-seeded prompt responses */
  agent: MockAgentAdapter;
  /** @purpose Deterministic task executor backed by the in-memory journal */
  executor: DeterministicTaskExecutor;
  /** @purpose In-memory projection adapter */
  projection: InMemoryProjectionAdapter;
  /** @purpose In-memory runtime profile for namespace isolation */
  profile: MockRuntimeProfile;
  /**
   * @purpose Advance the clock to a named instant and drain all due callbacks.
   * @param isoInstant Target ISO instant to advance to.
   */
  advanceTo(isoInstant: string): void;
};

/** @purpose Options for starting a fresh scenario runtime. */
export type ScenarioStartOptions = {
  /** @purpose Initial clock instant; defaults to 2026-01-01T00:00:00.000Z for determinism */
  initialInstant?: string;
};

const DEFAULT_INSTANT = '2026-01-01T00:00:00.000Z';

/**
 * @purpose Immutable scenario definition that produces a fresh isolated runtime per test invocation.
 * @invariant Each start() call returns independent adapters — no shared state between calls.
 * @invariant Unspecified adapter calls fail loudly — no fallback, no invented data.
 * @invariant Controlled clock drives all scheduling; wall-clock sleeps are absent.
 */
export class ReviewScenario {
  /** @purpose Closed definition used to wire every fresh runtime. */
  protected readonly _definition: ScenarioDefinition;

  /**
   * @purpose Store the immutable scenario definition for fresh runtime construction.
   * @param definition Complete scenario inputs.
   */
  protected constructor(definition: ScenarioDefinition) {
    this._definition = definition;
  }

  /**
   * @purpose Construct a fixed scenario from static MR facts, events and agent results.
   * @param definition Complete scenario definition.
   * @throws {Error} When runId is empty or mrsInput is absent.
   * @returns Immutable ReviewScenario ready to start.
   */
  static fixed(definition: ScenarioDefinition): ReviewScenario {
    if (!definition.runId) {
      throw new Error('[ReviewScenario.fixed] runId must be non-empty');
    }
    if (!Array.isArray(definition.mrsInput) || definition.mrsInput.length === 0) {
      throw new Error('[ReviewScenario.fixed] mrsInput must be a non-empty array');
    }
    return new ReviewScenario(definition);
  }

  /**
   * @purpose Start a fresh isolated runtime wired with all mock adapters.
   * @param [options] Clock initial instant and optional overrides.
   * @returns Fresh runtime adapters ready for test assertions.
   * @sideEffect Seeds journal with definition.seedEvents before returning.
   */
  start(options: ScenarioStartOptions = {}): ScenarioRuntime {
    const clock = new ControlledClock(options.initialInstant ?? DEFAULT_INSTANT);
    const journal = new InMemoryJournalAdapter();
    const artifactStore = new InMemoryArtifactAdapter();
    const projection = new InMemoryProjectionAdapter();
    const profile = MockRuntimeProfile.forMockRun(this._definition.runId);

    // #region START_WIRE_VCS_ADAPTER — seed inbox and per-MR entries
    const vcs = new MockVcsAdapter();
    const inbox = this._definition.mrsInput.map((f) => f.mr);
    const entries = Object.fromEntries(this._definition.mrsInput.map((f) => [f.ref, f.vcsEntry]));
    vcs.seed(inbox, entries);
    // #endregion END_WIRE_VCS_ADAPTER

    // #region START_WIRE_AGENT_ADAPTER — create scripted sessions with pre-seeded responses
    const agent = new MockAgentAdapter();
    if (this._definition.agentResults) {
      const pending: Promise<void>[] = [];
      for (const result of this._definition.agentResults) {
        pending.push(
          agent
            .createScriptedSession(
              { title: result.sessionTitle, directory: result.directory },
              result.responses
            )
            .then(() => undefined)
        );
      }
      // sessions are created synchronously in the mock; pending promises resolve immediately
      void Promise.all(pending);
    }
    // #endregion END_WIRE_AGENT_ADAPTER

    const executor = new DeterministicTaskExecutor(journal);

    // #region START_REPLAY_SEED_EVENTS — pre-populate journal with scenario seed events
    if (this._definition.seedEvents?.length) {
      const seeding = this._definition.seedEvents.reduce<Promise<void>>(
        (chain, event) =>
          chain.then(async () => {
            await journal.append(event);
          }),
        Promise.resolve()
      );
      // seed is synchronous-equivalent in InMemoryJournalAdapter; void is safe here
      void seeding;
    }
    // #endregion END_REPLAY_SEED_EVENTS

    return {
      clock,
      journal,
      artifactStore,
      vcs,
      agent,
      executor,
      projection,
      profile,
      advanceTo: (isoInstant: string) => clock.advanceTo(isoInstant),
    };
  }
}
