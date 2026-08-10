// @file: Inclusive operator participation signals and singular responsibility placement.
// @consumers: ReviewState, inbox-vcs, inbox-api
// @tasks: TSK-173

const PARTICIPATION_SIGNALS = [
  'author',
  'reviewer',
  'assignee',
  'mentioned',
  'commented',
  'approved',
] as const;

type ParticipationSignal = (typeof PARTICIPATION_SIGNALS)[number];

/**
 * @purpose Preserve every operator participation reason while deriving one dashboard group.
 * @invariant Signals are inclusive; owned placement wins only for author or assignee.
 */
export class ReviewParticipation {
  /** @purpose Whether the operator authored the MR. */
  readonly author: boolean;
  /** @purpose Whether the operator is an assigned reviewer. */
  readonly reviewer: boolean;
  /** @purpose Whether the operator is assigned to the MR. */
  readonly assignee: boolean;
  /** @purpose Whether the operator was mentioned. */
  readonly mentioned: boolean;
  /** @purpose Whether the operator commented. */
  readonly commented: boolean;
  /** @purpose Whether the operator approved. */
  readonly approved: boolean;
  /** @purpose Signals derived from incomplete external evidence. */
  readonly estimated: readonly ParticipationSignal[];

  /**
   * @purpose Materialize one already validated inclusive participation value.
   * @param input Complete participation signal map.
   * @param estimated Signals whose source observation is estimated.
   */
  protected constructor(
    input: Record<ParticipationSignal, boolean>,
    estimated: ParticipationSignal[]
  ) {
    this.author = input.author;
    this.reviewer = input.reviewer;
    this.assignee = input.assignee;
    this.mentioned = input.mentioned;
    this.commented = input.commented;
    this.approved = input.approved;
    this.estimated = Object.freeze([...estimated].sort());
  }

  /**
   * @purpose Validate one complete participation observation without dropping overlapping roles.
   * @param input Untrusted participation payload.
   * @throws {Error} When a signal is absent, non-boolean or estimated outside the closed vocabulary.
   * @returns Inclusive immutable participation value.
   */
  static from(input: unknown): ReviewParticipation {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new Error('[ReviewParticipation.from] Participation must be an object');
    }
    const source = input as Record<string, unknown>;
    const signals = {} as Record<ParticipationSignal, boolean>;
    for (const signal of PARTICIPATION_SIGNALS) {
      if (typeof source[signal] !== 'boolean') {
        throw new Error(`[ReviewParticipation.from] ${signal} must be boolean`);
      }
      signals[signal] = source[signal];
    }
    const estimated = source.estimated ?? [];
    if (
      !Array.isArray(estimated) ||
      estimated.some((signal) => !PARTICIPATION_SIGNALS.includes(signal as ParticipationSignal))
    ) {
      throw new Error('[ReviewParticipation.from] estimated contains an unknown signal');
    }
    return new ReviewParticipation(signals, estimated as ParticipationSignal[]);
  }

  /**
   * @purpose Create an explicit empty value before the first complete VCS observation.
   * @returns Participation with every signal false.
   */
  static empty(): ReviewParticipation {
    return new ReviewParticipation(
      {
        author: false,
        reviewer: false,
        assignee: false,
        mentioned: false,
        commented: false,
        approved: false,
      },
      []
    );
  }

  /**
   * @purpose Derive the one dashboard responsibility group without erasing role badges.
   * @returns Owned for author/assignee, otherwise review.
   */
  responsibilityGroup(): 'review' | 'owned' {
    return this.author || this.assignee ? 'owned' : 'review';
  }

  /**
   * @purpose Determine whether discovery has any explicit operator participation reason.
   * @returns Whether at least one inclusive signal is true.
   */
  hasAnySignal(): boolean {
    return PARTICIPATION_SIGNALS.some((signal) => this[signal]);
  }

  /**
   * @purpose Expose a deterministic projection-safe participation snapshot.
   * @returns Stable inclusive signal and placement projection.
   */
  toSnapshot(): Record<string, unknown> {
    return {
      author: this.author,
      reviewer: this.reviewer,
      assignee: this.assignee,
      mentioned: this.mentioned,
      commented: this.commented,
      approved: this.approved,
      estimated: [...this.estimated],
      responsibilityGroup: this.responsibilityGroup(),
    };
  }
}
