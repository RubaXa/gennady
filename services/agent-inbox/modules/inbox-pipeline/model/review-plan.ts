// @file: Observable execution plan projected from review contract slots.
// @consumers: ReviewOrchestrator, dashboard projections
// @tasks: TSK-176

/** @purpose Visible execution state for one contract slot. */
export type ReviewPlanSlotState = 'PENDING' | 'RUNNING' | 'COMPLETE' | 'FAILED' | 'SUPERSEDED';

/** @purpose Crash-restorable role-invariant slot execution plan. */
export class ReviewPlan {
  /** @purpose Exact immutable contract reference. */
  readonly contractRef: string;
  /** @purpose Dependency graph retaining every required slot. */
  readonly slotDependencies: Readonly<Record<string, readonly string[]>>;
  /** @purpose Visible execution state indexed by slot identity. */
  protected _states: Map<string, ReviewPlanSlotState>;

  /**
   * @purpose Construct a plan that preserves every contract slot.
   * @param contractRef Exact immutable contract reference.
   * @param slotDependencies Complete slot dependency graph.
   */
  constructor(contractRef: string, slotDependencies: Readonly<Record<string, readonly string[]>>) {
    this.contractRef = contractRef;
    this.slotDependencies = slotDependencies;
    this._states = new Map(Object.keys(slotDependencies).map((slotId) => [slotId, 'PENDING']));
  }

  /**
   * @purpose Return slots whose dependencies are complete and state is pending.
   * @returns Ready slot identities.
   */
  scheduleReadySlots(): string[] {
    return [...this._states.entries()]
      .filter(
        ([slotId, state]) =>
          state === 'PENDING' &&
          (this.slotDependencies[slotId] ?? []).every(
            (dependency) => this._states.get(dependency) === 'COMPLETE'
          )
      )
      .map(([slotId]) => slotId);
  }

  /**
   * @purpose Record a visible terminal or active state without deleting the slot.
   * @param slotId Existing contract slot identity.
   * @param state New visible execution state.
   */
  markSlotState(slotId: string, state: ReviewPlanSlotState): void {
    if (!this._states.has(slotId))
      throw new Error(`[ReviewPlan#markSlotState] Unknown slot ${slotId}`);
    this._states.set(slotId, state);
  }

  /**
   * @purpose Expose an immutable projection of current progress.
   * @returns Slot state projection.
   */
  retrieveProgress(): Readonly<Record<string, ReviewPlanSlotState>> {
    return Object.freeze(Object.fromEntries(this._states));
  }
}
