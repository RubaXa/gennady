// @file: BootReadiness — boot-phase state machine: connect→poll→reconcile→restore→ready/failed with progress tracking
// @consumers: inbox-api, bootstrap
// @tasks: TSK-157

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
    };
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
