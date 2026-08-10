// @file: BootReadiness — boot-phase state machine: connect→poll→reconcile→restore→ready/failed with progress tracking
// @consumers: inbox-api, bootstrap
// @tasks: TSK-157, TSK-172

import { logger } from '#logger';

/** @purpose Ordered boot phases — the server progresses through these in sequence (D-305). */
export type BootPhase = 'connect' | 'poll' | 'reconcile' | 'restore' | 'ready' | 'failed';

/** @purpose Phase ordering array — used for monotonic progress tracking. */
const PHASE_ORDER: readonly BootPhase[] = [
  'connect',
  'poll',
  'reconcile',
  'restore',
  'ready',
] as const;

/** @purpose Progress descriptor for the current boot phase. */
export type BootProgress = {
  /** @purpose Completed phases count */
  done: number;
  /** @purpose Total phases in the sequence */
  total: number;
  /** @purpose Human-readable label for the current phase */
  label: string;
};

/** @purpose Observable lazy preparation state for one MR content worktree. */
export type WorktreePreparationState = 'deferred' | 'preparing' | 'ready' | 'failed';

/** @purpose Full boot state snapshot exposed via /api/boot (D-305). */
export type BootState = {
  /** @purpose Current phase identifier */
  phase: BootPhase;
  /** @purpose Monotonic progress descriptor */
  progress: BootProgress;
  /** @purpose Whether the boot sequence completed successfully */
  ready: boolean;
  /** @purpose Failure reason when phase='failed' */
  error?: string;
  /** @purpose Whether config was loaded successfully */
  configured: boolean;
  /** @purpose Missing config keys when configured=false */
  missing: string[];
  /** @purpose Per-content-key lazy worktree state; absent keys remain deferred and uncreated. */
  worktrees: Record<string, WorktreePreparationState>;
};

/** @purpose Callback invoked on every boot state transition — registered before connect. */
export type BootTransitionListener = (state: BootState) => void;

/**
 * @purpose Boot-phase state machine: observable phase progression with /api/boot contract.
 * @invariant Phase transitions are monotonic — never regress.
 * @invariant Snapshot available immediately — listeners fire on every transition.
 * @invariant Config status settable independently via setConfigStatus.
 */
export class BootReadiness {
  /** @purpose Current boot phase. */
  protected _phase: BootPhase = 'connect';
  /** @purpose Progress descriptor. */
  protected _progress: BootProgress = { done: 0, total: PHASE_ORDER.length, label: 'connect' };
  /** @purpose Whether boot completed. */
  protected _ready: boolean = false;
  /** @purpose Failure reason when failed. */
  protected _error: string | undefined;
  /** @purpose Config load status. */
  protected _configured: boolean = true;
  /** @purpose Missing config keys. */
  protected _missing: string[] = [];
  /** @purpose Registered transition listeners. */
  protected _listeners: BootTransitionListener[] = [];
  /** @purpose Observable states only for content worktrees that crossed the lazy barrier. */
  protected _worktrees = new Map<string, WorktreePreparationState>();
  /** @purpose Single-flight preparation promises keyed by content identity. */
  protected _worktreePreparations = new Map<string, Promise<unknown>>();

  /**
   * @purpose Create a BootReadiness instance — snapshot available immediately, before connect.
   */
  constructor() {
    logger.debug('[BootReadiness#constructor] [init → ready_for_listeners]');
  }

  /**
   * @purpose Take a snapshot of the current boot state — available before any phase begins.
   * @returns Immutable-style copy of the current boot state.
   */
  snapshot(): BootState {
    return {
      phase: this._phase,
      progress: { ...this._progress },
      ready: this._ready,
      error: this._error,
      configured: this._configured,
      missing: [...this._missing],
      worktrees: Object.fromEntries(this._worktrees),
    };
  }

  /**
   * @purpose Run the first content worktree preparation only after boot reaches read-ready state.
   * @invariant No worktree is created by boot phases; concurrent/repeated calls for one key share one preparation.
   * @param key Stable MR/content identity shown in the observable worktree state map.
   * @param prepare Actual content task that materializes or reuses the worktree.
   * @throws {Error} Before ready or when preparation fails.
   * @returns The first successful preparation result for this key.
   * @sideEffect Runs caller-supplied filesystem/network preparation at most once after ready.
   */
  async prepareWorktreeOnce<T>(key: string, prepare: () => Promise<T>): Promise<T> {
    if (!this._ready) {
      throw new Error('[BootReadiness#prepareWorktreeOnce] Content worktree is behind ready');
    }

    const existing = this._worktreePreparations.get(key);
    if (existing) return existing as Promise<T>;

    this._worktrees.set(key, 'preparing');
    this._notifyListeners();

    // #region START_RUN_LAZY_WORKTREE_PREPARATION
    const preparation = prepare()
      .then((result) => {
        this._worktrees.set(key, 'ready');
        this._notifyListeners();
        logger.info(`[BootReadiness#prepareWorktreeOnce] [preparing → ready] ${key}`);
        return result;
      })
      .catch((cause: unknown) => {
        this._worktrees.set(key, 'failed');
        this._worktreePreparations.delete(key);
        this._notifyListeners();
        const error = new Error(
          `[BootReadiness#prepareWorktreeOnce] Worktree preparation failed for ${key}`,
          { cause }
        );
        logger.error(`[BootReadiness#prepareWorktreeOnce] [preparing → failed] ${key}`, {
          error,
        });
        throw error;
      });
    this._worktreePreparations.set(key, preparation);
    return preparation;
    // #endregion END_RUN_LAZY_WORKTREE_PREPARATION
  }

  /**
   * @purpose Transition to a new boot phase, advancing progress monotonically.
   * @param phase Target phase — must be next in sequence or 'failed'/'ready'.
   * @param [progressOverride] Optional partial progress override for the new phase.
   * @throws {Error} When phase regression is attempted.
   * @sideEffect Fires all registered listeners with the new state.
   */
  transition(phase: BootPhase, progressOverride?: Partial<BootProgress>): void {
    logger.debug('[BootReadiness#transition] [idle → transitioning]', {
      from: this._phase,
      to: phase,
    });

    if (phase === this._phase) {
      logger.debug('[BootReadiness#transition] [idle → skipped] Same phase', { phase });
      return;
    }

    // #region START_VALIDATE_TRANSITION
    if (phase === 'failed' || phase === 'ready') {
      this._phase = phase;
      if (phase === 'ready') {
        this._ready = true;
        this._progress = { done: PHASE_ORDER.length, total: PHASE_ORDER.length, label: 'ready' };
      }
    } else {
      const currentIdx = PHASE_ORDER.indexOf(this._phase);
      const targetIdx = PHASE_ORDER.indexOf(phase);
      if (targetIdx < 0 || targetIdx <= currentIdx) {
        const error = new Error(
          `[BootReadiness#transition] Phase regression: ${this._phase} → ${phase}`
        );
        logger.error('[BootReadiness#transition] [transitioning → invalid]', { error });
        return;
      }
      this._phase = phase;
      this._progress = {
        done: targetIdx,
        total: PHASE_ORDER.length,
        label: phase,
        ...progressOverride,
      };
    }
    // #endregion END_VALIDATE_TRANSITION

    logger.info('[BootReadiness#transition] [transitioning → transitioned]', {
      phase: this._phase,
      progress: this._progress,
    });

    this._notifyListeners();
  }

  /**
   * @purpose Record a boot failure with reason — transitions to 'failed' phase.
   * @param error Human-readable failure reason.
   * @sideEffect Fires all registered listeners with the failed state.
   */
  fail(error: string): void {
    logger.error('[BootReadiness#fail] [idle → failing]', { error });

    this._phase = 'failed';
    this._error = error;
    this._ready = false;

    this._notifyListeners();
  }

  /**
   * @purpose Update config load status independently of phase transitions.
   * @param configured Whether config loaded successfully.
   * @param [missing] Missing config keys when configured=false.
   */
  setConfigStatus(configured: boolean, missing?: string[]): void {
    this._configured = configured;
    this._missing = missing ?? [];
  }

  /**
   * @purpose Register a transition listener — callable before any phase begins.
   * @param listener Callback invoked on every state transition.
   */
  onTransition(listener: BootTransitionListener): void {
    this._listeners.push(listener);
    logger.debug('[BootReadiness#onTransition] [idle → registered]', {
      listenerCount: this._listeners.length,
    });
  }

  /**
   * @purpose Notify all registered listeners of the current state.
   */
  protected _notifyListeners(): void {
    const state = this.snapshot();
    for (const listener of this._listeners) {
      try {
        listener(state);
      } catch (cause) {
        logger.error('[BootReadiness#_notifyListeners] [notifying → listener_error]', {
          cause,
        });
      }
    }
  }
}
