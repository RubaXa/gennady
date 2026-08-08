// @file: BootRouter — GET /api/boot handler returning bootstrap phase and progress.
// @consumers: HttpServer
// @tasks: TSK-157, TSK-162

import type { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from '#logger';
import { sendJson, sendError } from '../http-helpers.ts';
import { BootReadiness, type BootState } from '../../inbox-core/boot-readiness.ts';

/** @purpose Regex pattern for matching GET /api/boot requests. */
const BOOT_RE = /^\/api\/boot$/;

/** @purpose Closed set of bootstrap phases — heartbeat endpoint for dashboard initialization. */
export type BootPhase = 'connect' | 'poll' | 'reconcile' | 'restore' | 'ready' | 'failed';

/** @purpose Progress descriptor — how many steps done out of total during a boot phase. */
export type BootProgress = {
  /** @purpose Completed steps count */
  done: number;
  /** @purpose Total steps count */
  total: number;
  /** @purpose Human-readable label for the current phase */
  label: string;
};

/** @purpose Response shape for GET /api/boot — consumed by dashboard initialization spinner. */
export type BootDto = {
  /** @purpose Current bootstrap phase */
  phase: BootPhase;
  /** @purpose Phase progress when mid-phase; undefined after ready */
  progress?: BootProgress;
  /** @purpose Error message when phase=failed */
  error?: string;
  /** @purpose True only after restore completes. */
  ready: boolean;
  /** @purpose Whether config was loaded successfully. */
  configured: boolean;
  /** @purpose Missing configuration fields when not configured. */
  missing: string[];
};

/**
 * @purpose Route handler for GET /api/boot — lightweight heartbeat driving the dashboard's
 *   initialization spinner until the server reaches the ready phase.
 */
export class BootRouter {
  /** @purpose Shared production readiness state, never a router-local duplicate. */
  protected _readiness: BootReadiness;
  /** @purpose Current boot phase — set externally by the boot sequence */
  protected _phase: BootPhase;
  /** @purpose Current progress descriptor */
  protected _progress: BootProgress | null;
  /** @purpose Error message when phase=failed */
  protected _error: string | null;

  /**
   * @purpose Create a BootRouter with an initial boot phase.
   * @param [readiness] Shared bootstrap state; defaults only for isolated router tests.
   */
  constructor(readiness: BootReadiness = new BootReadiness()) {
    this._readiness = readiness;
    this._phase = 'connect';
    this._progress = null;
    this._error = null;
  }

  /**
   * @purpose Transition the boot phase — called by the startup orchestrator at each stage boundary.
   * @param phase New boot phase.
   * @param [progress] Optional progress descriptor for mid-phase polling.
   */
  setPhase(phase: BootPhase, progress?: BootProgress): void {
    this._readiness.transition(phase, progress);
    this._phase = phase;
    this._progress = progress ?? null;
  }

  /**
   * @purpose Set error state — transitions to failed phase automatically.
   * @param error Human-readable error message.
   */
  setFailed(error: string): void {
    this._readiness.fail(error);
    this._phase = 'failed';
    this._error = error;
    this._progress = null;
  }

  /**
   * @purpose Check if this request matches the boot route.
   * @param req Incoming HTTP request.
   * @returns true if this router should handle the request.
   */
  matches(req: IncomingMessage): boolean {
    if (req.method !== 'GET') return false;
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    return BOOT_RE.test(url.pathname);
  }

  /**
   * @purpose Handle the boot request — return current phase and progress as JSON.
   * @param _req Incoming HTTP request.
   * @param res Server response.
   */
  handle(_req: IncomingMessage, res: ServerResponse): void {
    try {
      const state: BootState = this._readiness.snapshot();
      const body: BootDto = {
        phase: state.phase,
        progress: state.progress,
        ready: state.ready,
        configured: state.configured,
        missing: state.missing,
      };
      if (state.error) body.error = state.error;
      sendJson(res, 200, { ok: true, ...body });
    } catch (cause) {
      logger.error('[BootRouter#handle] [boot → failed]', { error: cause });
      sendError(res, cause);
    }
  }
}
