// @file: DebugLog — in-memory ring buffer of diagnostic log lines + a global error flag, so any user
//   can copy the current session's logs (🐞 button) without a dev console. Never persisted (privacy).
// @consumers: DebugLogButton, App (global handlers), api-client (call sites)
// @tasks: TSK-debug-log

/** @purpose Max retained log lines — oldest evicted (FIFO) past this, so a long session stays bounded. */
const CAPACITY = 500;

/** @purpose Ring buffer of formatted log lines, in process memory only (never disk/localStorage). */
const buffer: string[] = [];

/**
 * @purpose ISO-8601 UTC timestamp — matches the server logger's format so the 🐞 button can
 *   merge-sort browser and server lines into one chronological timeline (D-113).
 * @returns The ISO timestamp string.
 */
function stamp(): string {
  return new Date().toISOString();
}

/**
 * @purpose Serialize one log argument to a string; objects become compact JSON, unserializable values
 *   degrade to `[obj]` so a log call can never throw.
 * @param arg Any argument passed to `log`.
 * @returns The string form of `arg`.
 */
function serialize(arg: unknown): string {
  if (arg === null) return 'null';
  const kind = typeof arg;
  if (kind === 'string') return arg as string;
  if (kind === 'number' || kind === 'boolean' || kind === 'undefined' || kind === 'bigint') {
    return String(arg);
  }
  try {
    return JSON.stringify(arg);
  } catch {
    return '[obj]';
  }
}

/**
 * @purpose Append one diagnostic line to the buffer and mirror it to the dev console; fail-safe — a
 *   logging error never propagates to the caller.
 * @param anchor Source tag `namespace#action` (e.g. `api#board`, `sse#connect`).
 * @param args Message parts; primitives inline, objects as compact JSON.
 * @sideEffect Mutates the ring buffer and writes to `console.debug`.
 */
export function log(anchor: string, ...args: unknown[]): void {
  try {
    const line = `[${stamp()}][${anchor}] ${args.map(serialize).join(' ')}`;
    buffer.push(line);
    if (buffer.length > CAPACITY) buffer.shift();
    console.debug(line);
  } catch {
    // logging must never break the app
  }
}

/**
 * @purpose Redact a user identifier to a short prefix — the only ID form allowed in logs (PII-safety).
 * @param id Raw identifier, or nullish.
 * @returns First 8 chars + `…`, or `none` when absent.
 */
export function safeId(id: string | null | undefined): string {
  return id ? `${id.slice(0, 8)}…` : 'none';
}

/**
 * @purpose Snapshot the whole buffer as one clipboard-ready blob plus its line count.
 * @returns `{ text, count }` — joined lines and how many there were at copy time.
 */
export function snapshotLogs(): { text: string; count: number } {
  return { text: buffer.join('\n'), count: buffer.length };
}

/** @purpose Parse the leading `[ISO]` timestamp of a log line to epoch ms, or NaN when absent. */
function lineTimeMs(line: string): number {
  const end = line.indexOf(']');
  if (end <= 0) return NaN;
  return Date.parse(line.slice(1, end));
}

/** @purpose Insert an origin tag right after a line's `[ISO]` prefix (prepend when untimed). */
function injectOrigin(line: string, origin: 'CLIENT' | 'SERVER'): string {
  const end = line.indexOf(']');
  if (end <= 0) return `[${origin}] ${line}`;
  return `${line.slice(0, end + 1)}[${origin}]${line.slice(end + 1)}`;
}

/**
 * @purpose Merge client + server log lines into one origin-tagged timeline for 🐞 (D-113); both
 *   stamp ISO UTC, so a stable sort interleaves them.
 * @param clientLines Browser ring-buffer lines (ui/api/state/window anchors).
 * @param serverLines Server ring-buffer lines (level-tagged trace).
 * @returns One clipboard-ready blob: a header line, then the interleaved `[ISO][CLIENT|SERVER] …`.
 */
export function mergeTimeline(clientLines: string[], serverLines: string[]): string {
  const client = clientLines.filter(Boolean);
  const server = serverLines.filter(Boolean);
  const tagged = [
    ...client.map((l, i) => ({ l: injectOrigin(l, 'CLIENT'), t: lineTimeMs(l), i })),
    ...server.map((l, i) => ({ l: injectOrigin(l, 'SERVER'), t: lineTimeMs(l), i: i + 1_000_000 })),
  ];
  tagged.sort((a, b) => {
    if (Number.isNaN(a.t) && Number.isNaN(b.t)) return a.i - b.i;
    if (Number.isNaN(a.t)) return 1;
    if (Number.isNaN(b.t)) return -1;
    return a.t - b.t || a.i - b.i;
  });
  const header = `# agent-inbox telemetry — ${client.length} client + ${server.length} server lines, merged chronologically (UTC)`;
  return [header, ...tagged.map((x) => x.l)].join('\n');
}

// #region START_ERROR_FLAG — global unhandled-error indicator (spec §3.4), wired to a real handler
let hasError = false;
const listeners = new Set<(v: boolean) => void>();
let installed = false;

/**
 * @purpose Subscribe to the unhandled-error flag; fires immediately with the current value.
 * @param cb Called with the flag now and on every change.
 * @returns Unsubscribe function.
 */
export function subscribeErrorState(cb: (v: boolean) => void): () => void {
  listeners.add(cb);
  cb(hasError);
  return () => {
    listeners.delete(cb);
  };
}

/** @purpose Clear the error flag — called after the user copies logs (the signal was acted on). */
export function clearErrorState(): void {
  hasError = false;
  for (const cb of listeners) cb(false);
}

/**
 * @purpose Install `error`/`unhandledrejection` listeners once — they log the failure and raise the
 *   flag so the 🐞 button highlights. Idempotent; no-op outside the browser.
 * @sideEffect Adds two `window` event listeners on first call.
 */
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e: ErrorEvent) => {
    log('window#error', e.message || String(e.error));
    raiseError();
  });
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    log('window#unhandledrejection', String(e.reason));
    raiseError();
  });
}

/** @purpose Raise the error flag and notify subscribers (idempotent while already raised). */
function raiseError(): void {
  if (hasError) return;
  hasError = true;
  for (const cb of listeners) cb(true);
}
// #endregion END_ERROR_FLAG
