# RC-001: remote-console Test Spec

Этот документ фиксирует обязательные BDD-сценарии для `services/remote-console` и CLI-команды `remote-console`.
Цель тестового набора: доказать, что browser logging дублируется в remote sink без поломки локального `console`, а server и CLI дают стабильный управляемый terminal output path.

## Basic Rules

- Строго следовать правилам тестирования из `ai/agents/agent-qa-code.rules.xml`.
- Источником истины является `services/remote-console/spec/remote-console.prd.spec.md`, а не случайное текущее поведение реализации.
- Один тест покрывает один сценарий или одну ветку поведения.
- Timer-driven batching, HTTP transport и process shutdown должны тестироваться через controllable doubles или local harness, а не через flaky wall-clock sleeps.
- Snapshot assertions допустимы только как дополнение; они не заменяют явные проверки payload shape, flush cadence, line format и shutdown semantics.

## Test File Structure

- `services/remote-console/__tests__/remote-console-client.test.ts`
- `services/remote-console/__tests__/remote-console-server.test.ts`
- `cli/cmd/remote-console/__tests__/remote-console.cmd.test.ts`

Если реализация выберет другое разбиение, оно допустимо только при сохранении той же проверяемой области ответственности.

## BDD Scenarios

### rc-tests-public-contracts

Feature: Public domain API

Scenario: domain exposes stable client and server entrypoints without leaking internal runtime files
Given a consumer imports the public `remote-console` entrypoint
When the consumer resolves the exported browser client and server factory
Then the consumer can start integration without importing internal helper files
And the public API remains sufficient for CLI and browser runtime consumers

### rc-tests-client-connect-config-contract

Feature: Client config contract

Scenario: connect accepts a URL-centric config instead of host or port fragments
Given a consumer prepares a browser console target
When the consumer calls `remoteConsoleClient.connect(console, {url, tabId, branch})`
Then the client uses the absolute `url` as the only transport destination
And `tabId` is treated as an optional source marker
And `branch` is treated as an optional source marker

### rc-tests-connect-emits-source-event

Feature: Connect source observability

Scenario: successful connect emits source event with identity and branch
Given a browser console target is connected with `tabId` and `branch`
When the first flush happens
Then the remote `logs` payload contains one service `info`-event announcing the connection
And this event includes both `tabId` and `branch`

### rc-tests-server-command-envelope-contract

Feature: Single endpoint command envelope

Scenario: server dispatches actions by envelope type on one HTTP endpoint
Given the server receives parsed JSON requests on its only endpoint
When one request has `type = "logs"` and another has `type = "disconnect"`
Then the first request is routed to batch log handling
And the second request is routed to shutdown handling

### rc-tests-patch-preserves-local-console

Feature: Local console preservation

Scenario: patched logging methods still call the original console implementation
Given a console target is connected to remote-console
When the page calls `console.log`, `console.info`, `console.warn`, `console.error` and `console.debug`
Then each call still reaches the original local console implementation
And each call also produces one remote log entry

### rc-tests-batch-flush-every-five-seconds

Feature: Client batching

Scenario: log entries are flushed no more than once every five seconds
Given the client has buffered multiple console calls
When fewer than five seconds have elapsed since the previous flush
Then no second flush is sent
When the five-second throttle window expires
Then the buffered entries are sent as one HTTP batch

### rc-tests-disconnect-best-effort-flush

Feature: Disconnect lifecycle

Scenario: disconnect tries to flush buffered logs before requesting server shutdown
Given the client has buffered log entries that have not yet been flushed
When `console.__remote__.disconnect()` is called
Then the client performs one best-effort flush attempt
And only after that sends the `disconnect` command envelope

### rc-tests-pagehide-triggers-auto-disconnect

Feature: Unload lifecycle

Scenario: pagehide automatically initiates the shutdown path
Given the client is connected and has installed its lifecycle handlers
When the page emits the `pagehide` event
Then the client starts the same shutdown path used by `console.__remote__.disconnect()`
And the client does not require a manual disconnect call to notify the server

### rc-tests-unload-prefers-sendbeacon-then-keepalive

Feature: Unload-safe transport policy

Scenario: unload delivery uses the fixed browser-native priority order
Given the page is leaving and the client must deliver its final remote actions
When `navigator.sendBeacon` is available for the current payload
Then the client uses `navigator.sendBeacon` for unload-time delivery
When `navigator.sendBeacon` is unavailable or unsuitable for the payload
Then the client falls back to `fetch` with `keepalive: true`
And the client does not add retries, acknowledgement waits or persistent queueing

### rc-tests-unload-flushes-buffer-before-disconnect

Feature: Unload flush ordering

Scenario: buffered logs are attempted before the unload disconnect signal
Given the client still has buffered log entries when `pagehide` fires
When the unload shutdown path runs
Then the client first attempts to deliver the buffered log payload through the unload-safe transport policy
And after that it attempts to deliver the `disconnect` command
And if the buffered logs cannot be fully delivered the client still attempts the `disconnect` command

### rc-tests-duplicate-connect-warns-once

Feature: Duplicate connect handling

Scenario: reconnecting the same console target does not create a second patch
Given a console target is already connected
When the consumer calls `remoteConsoleClient.connect` again with the same target
Then the client does not re-patch the methods
And the client emits one local warning

### rc-tests-transport-failure-degrades-locally

Feature: Transport failure degradation

Scenario: client reports the first remote failure and continues local logging
Given the remote endpoint becomes unavailable after the connection is active
When the next flush attempt fails
Then the client emits one local error describing the lost remote sink
And subsequent local console calls still reach the original console
And later remote failures do not spam repeated local errors

### rc-tests-serializer-never-throws

Feature: Safe serialization

Scenario: serializer always returns printable output for primitives and complex values
Given the console receives primitives, cyclic objects, `Error`, `BigInt`, `Symbol` and DOM-like objects
When the client serializes the call arguments
Then serialization does not throw
And primitives become readable text
And complex values carry at least an `Object.prototype.toString`-derived type signal

### rc-tests-server-prints-normalized-lines

Feature: Stdout rendering

Scenario: server prints one normalized line per remote log entry
Given the server receives a `logs` envelope with ordered entries
When the batch is handled
Then the server writes one line per entry
And each line matches the format `"[console.<level>] <...args>"`
And the argument order in the line matches the payload order

### rc-tests-server-single-endpoint-dispatch

Feature: Single endpoint routing

Scenario: all client actions are accepted through one HTTP endpoint
Given the server is running
When the client sends both `logs` and `disconnect` commands to the configured URL
Then both requests are accepted through the same route
And routing depends only on the envelope `type`

### rc-tests-server-disconnect-shutdown

Feature: Controlled shutdown

Scenario: disconnect closes the server and exits with the configured code
Given the server is running with a known exit code configuration
When the server handles a `disconnect` envelope
Then the listening socket begins shutdown
And the server triggers `process.exit` with the configured code
And repeated shutdown handling does not start a second shutdown path

### rc-tests-invalid-request-does-not-crash-process

Feature: Request validation

Scenario: malformed requests do not terminate the process uncontrollably
Given the server receives invalid JSON or an unsupported command envelope
When request validation fails
Then the server returns an explicit failure response
And the process remains alive for subsequent valid requests

### rc-tests-cli-registers-command

Feature: CLI registration

Scenario: CLI exposes the remote-console command in routing and help
Given the operator runs `npx gennady` help output
When the command list is rendered
Then `remote-console` appears in the documented commands
And routing through `cli/gennady.ts` resolves the command entrypoint

### rc-tests-cli-opens-url-with-activation-flag

Feature: Optional browser opening

Scenario: CLI opens the provided page URL with the remote activation query flag
Given the operator runs `npx gennady remote-console --url="https://example.test/path?foo=1"`
When the server starts successfully
Then the CLI calls `open` with a URL that contains `__remote_console__=1`
And the original URL components remain otherwise intact

### rc-tests-cli-preserves-existing-query-and-hash

Feature: URL mutation correctness

Scenario: activation flag injection preserves both existing query params and hash fragment
Given the operator passes a URL that already contains query params and a hash fragment
When the CLI prepares the browser URL
Then existing query params are preserved
And the hash fragment is preserved
And `__remote_console__` is set to `1`

### rc-tests-cli-no-open-when-url-absent

Feature: Headless server start

Scenario: CLI does not open a browser when no URL is provided
Given the operator runs `npx gennady remote-console` without `--url`
When the server starts
Then no browser open call is made
And the command still reports the remote endpoint needed by browser clients
