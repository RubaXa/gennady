# Logging (LLD)

Use this flow when the agent is **writing or changing code that logs** (console, logger).

## 1) Logger API
- Use project logger: `import { logger } from '../utils/logger.js'` (path relative to your module).
- Contract: `logger[level](message, detail?)` — only two arguments. Levels: `debug`, `info`, `warn`, `error`.
- Do not use `const logger = console` in modules; use the shared logger.

## 2) Message format (three parts)
- **Part 1 — anchor**: `[Class#method]` or `[functionName]`. Mandatory, stable.
- **Part 2 — state transition**: `[stateA -> stateB]`. Mandatory at entry/branch/exit/error.
- **Part 3 — description**: Must **add new information**; must **not duplicate** the state.

**Rule:** If the state is e.g. `-> failed`, do not write "Action failed" (duplicates "failed"). Write the *reason* or *type*: e.g. "Exit code 1", "Spawn error", "Not MODULE_NOT_FOUND", "Second import". Same for other states: the third part answers "what exactly" or "why", not repeat the transition.

## 3) Message vs detail
- **Primitives** (specifier, code, paths, time, numbers): put in the **message** string (e.g. `` `${specifier} (${time.toFixed(2)}ms)` ``). Easier to read in log stream.
- **Non-primitives** (errors, cause, complex objects): put in the second argument **detail** only when needed (e.g. `{ cause }`).
- Prefer a single, self-explanatory message; use detail only when the value cannot be sensibly inlined.

## 4) Time in logs
- Log elapsed time **only for long operations** (e.g. npm install, network, heavy IO).
- Measure with `performance.now()` (from `node:perf_hooks`), not `Date.now()`.
- Format: `` `${time.toFixed(2)}ms` `` (two decimal places), not `Math.round(time)`.

## 5) Log levels
- `info`: business milestones and major flow stages.
- `debug`: execution details, branch decisions, diagnostics.
- `warn`: recoverable anomalies and guarded non-happy paths.
- `error`: failures and thrown/rethrown errors.

## 6) Placement rules
- Entry points: log start (`info` or `debug`).
- Important branches: log chosen branch (`debug` or `warn`).
- External IO/mutations: log before and/or after as needed.
- Loops: log summary before/after, avoid per-item noise.
- Catch blocks: always log `error` with anchor and context; then throw (see [errors.md](./errors.md)).

## 7) Block comments (START_/END_)
- Do **not** add `// START_...` / `// END_...` unless the block’s intent is **not** obvious from the function contract (JSDoc) or structure.
- If the code and contract already explain the flow, such markers add noise; omit them.

## 8) Minimal example
```js
import { performance } from 'node:perf_hooks';
import { logger } from '../utils/logger.js';

async function performAction(specifier) {
  const startedAt = performance.now();
  logger.info(`[performAction] [idle -> starting] ${specifier}`);

  try {
    logger.debug(`[performAction] [starting -> processing] ${specifier}`);
    // ...work...
    const time = performance.now() - startedAt;
    logger.info(`[performAction] [processing -> completed] ${specifier} (${time.toFixed(2)}ms)`);
    return result;
  } catch (cause) {
    const time = performance.now() - startedAt;
    logger.error(`[performAction] [processing -> failed] Other error: ${specifier} (${time.toFixed(2)}ms)`, { cause });
    throw new Error('[performAction] Action failed', { cause });
  }
}
```

For error construction in `throw`, see [errors.md](./errors.md).
