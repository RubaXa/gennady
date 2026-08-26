// @file: InMemoryProjectionAdapter — deterministic seeded implementation of ProjectionPort for scenario tests.
// @consumers: ReviewScenario, inbox-mocks test suite
// @tasks: TSK-180

import type { ProjectionPort } from '../../inbox-api/projections/projection.port.ts';
import type { ReviewBoardProjection } from '../../inbox-api/projections/review-board.projection.ts';
import type { ReviewFeedProjection } from '../../inbox-api/projections/review-feed.projection.ts';
import type { ReviewMrProjection } from '../../inbox-api/projections/review-mr.projection.ts';
import type { ReviewPackageProjection } from '../../inbox-api/projections/review-package.projection.ts';
import type { ReviewTestRunProjection } from '../../inbox-api/projections/review-test-run.projection.ts';

/** @purpose Seeded projection snapshot for all views of one MR. */
export type MockMrProjectionSeed = {
  /** @purpose Seeded MR workspace projection; absent → null from mr(). */
  mr?: ReviewMrProjection;
  /** @purpose Seeded feed widgets for feed(); absent → empty feed with cursor 0. */
  feedWidgets?: ReviewFeedProjection;
  /** @purpose Seeded package projection; absent → empty packages. */
  packages?: ReviewPackageProjection;
  /** @purpose Seeded test run projection; absent → unknown status. */
  testRun?: ReviewTestRunProjection;
};

/**
 * @purpose Deterministic seeded projection adapter for isolated scenario tests.
 * @implements {ProjectionPort} in ../../inbox-api/projections/projection.port.ts
 * @invariant All methods are pure reads — no mutations, no side effects.
 * @invariant Absent MR → board returns empty queues; mr() returns null; others return empty collections.
 */
export class InMemoryProjectionAdapter implements ProjectionPort {
  /** @purpose Seeded board projection returned verbatim by board(). */
  protected _board: ReviewBoardProjection;
  /** @purpose Seeded per-MR projection snapshots keyed by MR ref. */
  protected _mrSeeds: Map<string, MockMrProjectionSeed>;
  /** @purpose Reported cursor value. */
  protected _cursor: number;

  /**
   * @purpose Create an empty projection adapter with an empty board.
   */
  constructor() {
    this._board = { mine: [], assigned: [], visible: [], cursor: 0 };
    this._mrSeeds = new Map();
    this._cursor = 0;
  }

  /**
   * @purpose Pre-load all seeded projections for one test scenario.
   * @param board Board projection returned by board().
   * @param [mrSeeds] Per-MR seeds keyed by composite MR ref; defaults to empty map.
   * @param [cursor] Journal cursor reported by cursor(); defaults to 0.
   * @sideEffect Replaces all previously seeded state.
   */
  seed(
    board: ReviewBoardProjection,
    mrSeeds: Record<string, MockMrProjectionSeed> = {},
    cursor = 0
  ): void {
    this._board = board;
    this._mrSeeds = new Map(Object.entries(mrSeeds));
    this._cursor = cursor;
  }

  /** @see {ProjectionPort#board} in ../../inbox-api/projections/projection.port.ts */
  board(): ReviewBoardProjection {
    return { ...this._board };
  }

  /** @see {ProjectionPort#feed} in ../../inbox-api/projections/projection.port.ts */
  feed(mrRef: string, _cursor: number): ReviewFeedProjection {
    const seed = this._mrSeeds.get(mrRef);
    return seed?.feedWidgets ?? { widgets: [], nextCursor: 0, unread: 0 };
  }

  /** @see {ProjectionPort#mr} in ../../inbox-api/projections/projection.port.ts */
  mr(mrRef: string): ReviewMrProjection | null {
    return this._mrSeeds.get(mrRef)?.mr ?? null;
  }

  /** @see {ProjectionPort#packages} in ../../inbox-api/projections/projection.port.ts */
  packages(mrRef: string): ReviewPackageProjection {
    return this._mrSeeds.get(mrRef)?.packages ?? { current: [], stale: [], cursor: 0 };
  }

  /** @see {ProjectionPort#testRun} in ../../inbox-api/projections/projection.port.ts */
  testRun(mrRef: string): ReviewTestRunProjection {
    return (
      this._mrSeeds.get(mrRef)?.testRun ?? {
        ref: mrRef,
        status: 'unknown',
        preconditions: [],
        runs: [],
        cursor: 0,
      }
    );
  }

  /** @see {ProjectionPort#cursor} in ../../inbox-api/projections/projection.port.ts */
  cursor(): number {
    return this._cursor;
  }
}
