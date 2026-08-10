// @file: Canonical local policies used by lifecycle and accumulated verification batches.
// @consumers: ReviewState, composition root
// @tasks: TSK-173

import { isAbsolute, resolve } from 'node:path';

type ReviewConfigInput = Partial<{
  debounceMs: number;
  quietMs: number;
  activityHorizonMs: number;
  botAllowlist: readonly string[];
  stateRoots: readonly string[];
  effectAllowlist: readonly string[];
}>;

/** @purpose Validate and normalize one closed string allowlist. */
function normalizeAllowlist(values: readonly string[], field: string): readonly string[] {
  if (values.some((value) => typeof value !== 'string' || value.trim().length === 0)) {
    throw new Error(`[ReviewConfig#constructor] ${field} must contain non-empty strings`);
  }
  return Object.freeze([...new Set(values.map((value) => value.trim()))].sort());
}

/**
 * @purpose Validated local timing, storage and effect policies for canonical review state.
 * @invariant Durations are finite positive milliseconds and allowlists are immutable and unique.
 */
export class ReviewConfig {
  /** @purpose Human discussion reply debounce duration. */
  readonly debounceMs: number;
  /** @purpose Quiet period postponed by every observed MR event. */
  readonly quietMs: number;
  /** @purpose Visibility horizon measured from last observed MR activity. */
  readonly activityHorizonMs: number;
  /** @purpose Bot identities permitted to contribute canonical observations. */
  readonly botAllowlist: readonly string[];
  /** @purpose Canonical physical roots permitted for stateful adapters. */
  readonly stateRoots: readonly string[];
  /** @purpose Effect identities permitted by the bound runtime policy. */
  readonly effectAllowlist: readonly string[];

  /**
   * @purpose Resolve defaults and reject unsafe timing policies before state folds.
   * @param [input] Optional policy overrides in milliseconds.
   * @throws {Error} When any configured duration is not finite and positive.
   */
  constructor(input: ReviewConfigInput = {}) {
    this.debounceMs = input.debounceMs ?? 5 * 60_000;
    this.quietMs = input.quietMs ?? 10 * 60_000;
    this.activityHorizonMs = input.activityHorizonMs ?? 90 * 24 * 60 * 60_000;
    this.botAllowlist = normalizeAllowlist(input.botAllowlist ?? [], 'botAllowlist');
    this.effectAllowlist = normalizeAllowlist(input.effectAllowlist ?? [], 'effectAllowlist');
    const roots = normalizeAllowlist(input.stateRoots ?? [], 'stateRoots');
    if (roots.some((root) => !isAbsolute(root))) {
      throw new Error('[ReviewConfig#constructor] stateRoots must contain absolute paths');
    }
    this.stateRoots = Object.freeze(roots.map((root) => resolve(root)));
    for (const [name, value] of Object.entries({
      debounceMs: this.debounceMs,
      quietMs: this.quietMs,
      activityHorizonMs: this.activityHorizonMs,
    })) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`[ReviewConfig#constructor] ${name} must be finite and positive`);
      }
    }
  }

  /**
   * @purpose Verify that one adapter root belongs to the boot-bound state-root allowlist.
   * @param stateRoot Canonical physical adapter root.
   * @throws {Error} When a configured root allowlist excludes the adapter root.
   */
  verifyStateRoot(stateRoot: string): void {
    const canonical = resolve(stateRoot);
    if (this.stateRoots.length > 0 && !this.stateRoots.includes(canonical)) {
      throw new Error(
        '[ReviewConfig#verifyStateRoot] State root is outside the configured allowlist'
      );
    }
  }

  /**
   * @purpose Determine whether a bot identity may contribute canonical observations.
   * @param botId Candidate bot identity.
   * @returns Whether the bot is explicitly allowed.
   */
  permitsBot(botId: string): boolean {
    return this.botAllowlist.includes(botId);
  }

  /**
   * @purpose Determine whether an external effect identity is boot-authorized.
   * @param effectId Candidate effect identity.
   * @returns Whether the effect is explicitly allowed.
   */
  permitsEffect(effectId: string): boolean {
    return this.effectAllowlist.includes(effectId);
  }

  /**
   * @purpose Expose the immutable boot policy used for deterministic configuration events.
   * @returns Stable policy snapshot.
   */
  toSnapshot(): Record<string, unknown> {
    return {
      debounceMs: this.debounceMs,
      quietMs: this.quietMs,
      activityHorizonMs: this.activityHorizonMs,
      botAllowlist: [...this.botAllowlist],
      stateRoots: [...this.stateRoots],
      effectAllowlist: [...this.effectAllowlist],
    };
  }

  /**
   * @purpose Describe an observable system event when boot policy changes.
   * @param previous Previously active configuration.
   * @param occurredAt Controlled change instant.
   * @returns Null for byte-equivalent policy or a configuration-changed system event.
   */
  describeChangeFrom(previous: ReviewConfig, occurredAt: string): Record<string, unknown> | null {
    const before = previous.toSnapshot();
    const after = this.toSnapshot();
    if (JSON.stringify(before) === JSON.stringify(after)) return null;
    return {
      kind: 'configuration_changed',
      actor: { kind: 'system', id: 'inbox-core' },
      occurredAt,
      before,
      after,
    };
  }
}
