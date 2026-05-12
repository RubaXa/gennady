# WS-001: web-specter Test Spec

Этот документ фиксирует обязательные BDD-сценарии для `services/web-specter` и CLI-команды `web-specter`.
Цель тестового набора: доказать, что сервис даёт стабильный live event stream и что CLI может доставить этот trace в stdout или файл без потери причинной структуры сессии.

## Basic Rules

- Строго следовать правилам тестирования из `ai/agents/agent-qa-code.rules.xml`.
- Источником истины является `services/web-specter/web-specter.prd.spec.md`, а не случайное текущее поведение реализации.
- Один тест покрывает один сценарий или одну ветку поведения.
- Browser runtime interactions должны быть изолированы через controllable adapter doubles или локально управляемый integration harness.
- Snapshot-тесты для whole log file не подменяют явные assertions по event order, `tabId`, payload, live delivery и terminal result.

## Test File Structure

Обязательная минимальная структура:

- `services/web-specter/__tests__/web-specter-service.test.ts`
- `services/web-specter/__tests__/web-specter-browser-locator.test.ts`
- `services/web-specter/__tests__/web-specter-profile-store.test.ts`
- `services/web-specter/__tests__/web-specter-filter.test.ts`
- `services/web-specter/__tests__/web-specter-session-runtime.test.ts`
- `cli/cmd/web-specter/__tests__/web-specter.cmd.test.ts`

Если реализация выберет другое разбиение, оно допустимо только при сохранении той же проверяемой области ответственности.

## BDD Scenarios

### ws-tests-public-service-contract

Feature: Public service contract

Scenario: service exposes a stable session-oriented API without leaking browser runtime handles
Given a consumer imports the public `web-specter` entrypoint
When the consumer creates `WebSpecterService` and starts a session
Then the consumer receives a session contract with live event stream, stop path and terminal result
And the public API does not require the consumer to hold live Puppeteer objects

### ws-tests-session-result-contract

Feature: Terminal session summary

Scenario: session result remains stable after terminal state
Given a session has already reached terminal state
When the consumer requests the session result multiple times
Then each call returns an equivalent summary
And the summary contains `startedAt`, `endedAt`, `eventCount`, `tabCount` and `endReason`

### ws-tests-startup-failure-creates-no-session

Feature: Fail-fast startup failure

Scenario: startup failure returns diagnostics and does not create a session object
Given the service cannot resolve or launch the browser during startup
When the consumer calls `startSession`
Then the call fails with a startup failure contract
And the failure contains ordered startup diagnostics
And no `WebSpecterSession` object is created

### ws-tests-reject-second-active-session

Feature: Single active session policy

Scenario: service rejects a second session while the first one is still active
Given a service instance already has an active session
When the consumer calls `startSession` again on the same instance
Then the call fails with an explicit concurrency error
And the service does not launch a second browser process

### ws-tests-browser-resolution-order

Feature: Browser resolution policy

Scenario: service resolves browser executable through the fixed precedence chain
Given the service is configured with an explicit executable path
When a session starts
Then the explicit executable path is used
And autodetect is not consulted for that run
When the explicit executable path is absent and a browser channel is configured
Then the configured browser channel is used
When neither explicit path nor channel is configured
Then the service attempts browser autodetection
And if autodetection fails the startup error explains how to provide an explicit override

### ws-tests-startup-status-enum-is-fixed

Feature: Startup diagnostic status vocabulary

Scenario: startup diagnostics use only the fixed public status values
Given the startup path emits diagnostics for success and failure branches
When the consumer inspects every diagnostic entry
Then each `status` value is one of `attempt`, `selected`, `ready`, `failed`
And no implementation-specific synonym appears in the emitted diagnostics

### ws-tests-start-managed-session

Feature: Managed debug profile startup

Scenario: service starts Chrome with the managed persistent debug profile
Given the managed debug profile does not yet exist
When the consumer starts the first session
Then the service creates the managed profile
And launches Chrome against that profile
And opens the configured root URL in the root tab

### ws-tests-cli-logs-startup-lifecycle

Feature: Startup lifecycle logging

Scenario: CLI logs the startup path before the first session event
Given the operator starts `gennady web-specter`
When the CLI resolves the browser, prepares the profile and launches the browser
Then the output contains startup diagnostic lines in the order they happened
And the diagnostics include browser resolution attempts
And the diagnostics include the chosen browser path or channel
And the diagnostics include the managed profile path

### ws-tests-clean-start-with-no-restored-tabs

Feature: Clean session startup

Scenario: each session starts without restoring old tabs from the previous browser run
Given the managed profile was used in a previous session
When a new session starts
Then no previously open tab is restored into the new session
And the root tab is the first tracked tab for that session

### ws-tests-preserve-auth-clear-http-cache-only

Feature: Startup cleanup

Scenario: startup clears only HTTP or browser network cache without dropping auth-related browser state
Given the managed profile already contains cookies and other auth-related site state
When a new session starts
Then HTTP or browser network cache is cleared before opening the root URL
And cookies, local storage and IndexedDB state remain available to the session

### ws-tests-project-console-and-network-events

Feature: Snapshot event projection

Scenario: runtime projects first-slice browser activity into immutable snapshot events
Given the browser runtime emits console, request, response and frame lifecycle activity
When the event projector handles these runtime payloads
Then the consumer receives immutable events with the required common fields
And console events contain flattened text
And network events contain the relevant URL and method or status information

### ws-tests-time-format-contract

Feature: Event timestamp format

Scenario: projected events use the fixed machine and human time formats
Given the projector emits first-slice events
When the consumer inspects the time fields
Then `time` is an epoch-milliseconds integer
And `datetime` is an ISO-8601 UTC string with the `Z` suffix

### ws-tests-event-kind-required-fields

Feature: Event kind matrix

Scenario: each event kind satisfies the required field set defined by the public contract
Given the projector emits every first-slice event kind at least once
When the consumer validates each emitted event against the public event matrix
Then each event contains the common fields
And each event kind contains its required additional fields
And no validation step depends on a live browser handle

### ws-tests-filter-noise-with-regex-helper

Feature: Filter pipeline

Scenario: regex helper suppresses noisy events before text rendering
Given a session is configured with regex-based filters for a specific event family
When an emitted event matches one of the configured patterns
Then that event is dropped before it reaches the CLI renderer
And non-matching events continue through the pipeline in the original order

### ws-tests-track-session-tabs

Feature: Multi-tab session ownership

Scenario: all page tabs created in the session browser process are tracked
Given a session has started and opened the root tab
When the runtime creates additional page tabs or popup windows in the same browser process
Then each new page target is assigned a stable `tabId`
And events from those tabs are emitted as part of the same session trace

### ws-tests-end-when-last-tab-closes

Feature: Terminal session lifecycle

Scenario: session ends only after the last tracked tab closes
Given a session has more than one tracked tab
When one tracked tab closes
Then the session remains active
When the final tracked tab closes
Then the session enters terminal state
And the terminal result reports `endReason = all-tabs-closed`

### ws-tests-cli-streams-to-stdout-by-default

Feature: CLI default delivery

Scenario: CLI writes live log lines to stdout when no output file is requested
Given the operator starts `gennady web-specter` with `--url` and without `--file`
When the session emits events
Then the CLI writes rendered lines to stdout in observation order
And no file path is required for the default mode

### ws-tests-cli-writes-file-when-file-is-set

Feature: CLI file delivery

Scenario: CLI writes the final log to a file when `--file` is provided
Given the operator starts `gennady web-specter` with `--url` and `--file`
When the session emits events and reaches terminal state
Then the CLI writes the rendered lines to the requested file path
And the event order in the file matches the order observed from the session stream

### ws-tests-cli-file-mode-truncates-and-uses-utf8

Feature: CLI file mode write policy

Scenario: file mode truncates existing output and writes UTF-8 text
Given the target log file already exists with previous contents
When the operator starts `gennady web-specter` with `--file`
Then the CLI rewrites the file instead of appending to it
And the output is encoded as UTF-8

### ws-tests-cli-creates-parent-directories-for-file-mode

Feature: CLI file mode path preparation

Scenario: file mode creates missing parent directories before writing
Given the requested output path points to a file inside a missing directory tree
When the operator starts `gennady web-specter` with `--file`
Then the CLI creates the missing parent directories
And writes the rendered log to the requested file path

### ws-tests-cli-fails-fast-when-file-path-is-unwritable

Feature: CLI file mode failure behavior

Scenario: CLI exits non-zero when the requested file path cannot be prepared or opened
Given the requested output path cannot be created or opened for writing
When the operator starts `gennady web-specter` with `--file`
Then the CLI exits with a non-zero status before session startup
And no partial session log is emitted after the file error

### ws-tests-cli-renders-normalized-log-line-format

Feature: Normalized log line format

Scenario: CLI renders startup and session lines in the fixed public grammar
Given the CLI renders both startup diagnostics and session events
When the output is inspected line by line
Then each startup line starts with `[startup:<phase>] [status:<status>]`
And each session line starts with `[tab:<id>] [opener:<null|id>] [<event-family.event-kind>]`
And request lines include an explicit method marker
And response lines include an explicit status marker

### ws-tests-cli-fails-fast-on-startup-error

Feature: CLI startup failure behavior

Scenario: CLI exits non-zero when startup fails before a session is created
Given the browser cannot be resolved or launched
When the operator starts `gennady web-specter`
Then the CLI prints the accumulated startup diagnostics
And the process exits with a non-zero status
And no session event line is emitted after the failure

### ws-tests-cli-flushes-live-output

Feature: CLI live flushing

Scenario: CLI flushes each rendered line as soon as the corresponding event arrives
Given the CLI consumes a live session event stream
When a new event passes projection and filtering
Then the corresponding rendered line is flushed immediately to the selected sink
And the CLI does not wait for session termination before delivering that line

## Coverage Notes

- First slice intentionally excludes user action capture such as click, input, scroll and focus.
- First slice intentionally excludes non-page browser targets such as extension pages, service workers and similar background targets.
- First slice intentionally excludes configurable cleanup modes beyond the fixed HTTP or browser network cache clear.
- If an implementation chooses to add more event kinds, tests for them are additive and must not weaken the required first-slice scenarios above.
