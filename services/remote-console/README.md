# 🛰️ Remote Console Core

Mirror browser `console.*` into local terminal output with a single HTTP endpoint.

- 🎯 Browser side: keep normal local console behavior, add remote mirroring.
- 🧱 Server side: accept command envelopes and print normalized stdout lines.
- 🛠️ CLI side: run runtime and optionally open target page with activation flag.

---

## ✨ Why

`remote-console` is a minimal production slice for fast diagnostics:

- No devtools copy/paste flow.
- Deterministic line format for humans and AI agents.
- Controlled shutdown on client disconnect.

---

## 🚀 Quick Start

### 1) Start server runtime

```bash
npx gennady remote-console
```

You will see endpoint output like:

```txt
[remote-console] listening on http://127.0.0.1:43001/
[remote-console] browser client: remoteConsoleClient.connect(console, { url })
```

### 2) Connect browser runtime

```ts
import { remoteConsoleClient } from 'gennady/services/remote-console/remote-console';

remoteConsoleClient.connect(console, {
  url: 'http://127.0.0.1:43001/',
  tabId: 'tab-a', // optional
  branch: 'feature/login-fix', // optional
});
```

Now each `console.log/info/warn/error/debug` is:

- printed locally as usual;
- mirrored to remote endpoint in batches.

---

## 🧭 CLI

```bash
# start server only
npx gennady remote-console

# custom port/host
npx gennady remote-console --port=44000 --host=127.0.0.1

# open page and inject activation flag
npx gennady remote-console --url="https://example.test/path?foo=1#hash"
```

When `--url` is provided, CLI opens:

- `https://example.test/path?foo=1&__remote_console__=1#hash`

---

## 📦 Public API

```ts
import {
  remoteConsoleClient,
  startRemoteConsoleServer,
  type RemoteConsoleClientConnectConfig,
  type RemoteConsoleServerOptions,
} from 'gennady/services/remote-console/remote-console';
```

### `remoteConsoleClient.connect(consoleTarget, config)`

- `config.url`: absolute endpoint URL (required)
- `config.tabId`: source marker (optional)
- `config.branch`: source branch marker (optional)

Effects:

- monkey-patches `consoleTarget` methods (`log/info/warn/error/debug`);
- enqueues one service connect event (`[remote-console] connected`) with `tabId` and `branch`;
- starts 5s periodic flush;
- adds `consoleTarget.__remote__.disconnect()`;
- subscribes to `pagehide` and `beforeunload`.

### `startRemoteConsoleServer(options)`

- Starts one HTTP endpoint (`/`) for both `logs` and `disconnect`.
- Returns lifecycle handle:

```ts
type RemoteConsoleServerLifecycle = {
  url: string;
  close: () => Promise<void>;
};
```

---

## 🔌 Transport Contract

Single endpoint command envelope:

```ts
type RemoteConsoleCommandEnvelope =
  | { type: 'logs'; tabId?: string; items: RemoteConsoleLogEntry[] }
  | { type: 'disconnect'; tabId?: string };
```

---

## ✅ Behavioral Guarantees

- 🧩 Local console behavior is preserved.
- ⏱️ Flush cadence is throttled by 5-second interval.
- 🔁 Duplicate `connect` on same target does not repatch and warns once.
- 🧯 First transport failure is reported once; local logging keeps working.
- 🚪 Disconnect path is idempotent for both manual and unload-triggered flow.
- 🧵 Server prints one deterministic line per log entry:
  - `[console.<level>] <...args>`

---

## 🧪 Tests

```bash
npx tsx --test \
  services/remote-console/__tests__/remote-console-client.test.ts \
  services/remote-console/__tests__/remote-console-server.test.ts \
  cli/cmd/remote-console/__tests__/remote-console.cmd.test.ts
```

Coverage focus:

- client patching, batching, unload policy, transport degradation;
- server routing, stdout format, controlled shutdown, invalid payload handling;
- CLI registration/help, URL mutation correctness, browser-open branch.

---

## ⚠️ Scope (First Slice)

- No retry queue / durable queue / acknowledgement protocol.
- No multi-endpoint routing.
- No reconnect state machine.

Design goal: keep integration trivial and behavior predictable.
