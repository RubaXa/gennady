## Logging And Error Rules

### 1) Logger API
- Use direct logger calls: `const logger = console;`
- Do not use custom wrapper helpers.
- Use the contract: `logger[level](message, detail)`

### 2) Message format
- Method scope: `[Class#method] [state -> state] Message`
- Function scope: `[functionName] [state -> state] Message`
- Scope anchor is mandatory and stable.
- State transition is mandatory for entry/branch/exit/error points.

### 3) Detail payload
- Pass context as the second argument (`detail`) only.
- Keep `message` readable; keep structured data in `detail`.
- Prefer consistent keys. Use `time` for elapsed time.

### 4) Log levels
- `info`: business milestones and major flow stages.
- `debug`: execution details, branch decisions, and diagnostics.
- `warn`: recoverable anomalies and guarded non-happy paths.
- `error`: failures and thrown/rethrown errors.

### 5) Placement rules
- Entry points (public handlers/controllers/jobs): log start (`info` or `debug`).
- Important branches (`if/switch/guard`) that change flow: log chosen branch (`debug` or `warn`).
- External IO/mutations: log before and/or after as needed.
- Loops: log summary before/after, avoid per-item noise.
- Catch blocks: always log `error` with anchor and context.

### 6) Error construction
- Error messages must include anchor:
  - `new Error("[Class#method] Message", { cause })`
  - `new Error("[functionName] Message", { cause })`
- `cause` may contain any value type; do not coerce it.
- Preserve original context when rethrowing.

### 7) Minimal example
```js
const logger = console;

function performAction(input) {
  const startedAt = Date.now();
  logger.info("[performAction] [idle -> starting] Action started", { input });

  try {
    logger.debug("[performAction] [starting -> processing] Processing input", { input });
    // ...work...

    logger.info("[performAction] [processing -> completed] Action completed", {
      time: Date.now() - startedAt,
    });
  } catch (cause) {
    logger.error("[performAction] [processing -> failed] Action failed", {
      input,
      cause,
      time: Date.now() - startedAt,
    });
    throw new Error("[performAction] Action failed", { cause });
  }
}
```
