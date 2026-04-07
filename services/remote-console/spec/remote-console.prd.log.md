# RC-001: remote-console Execution Log

Этот файл заполняется dev-агентом по мере реализации `RC-001`.

## Rules

- Логировать шаги в хронологическом порядке.
- Для каждого шага фиксировать: что изменено, почему, какие тесты запущены, чем закончилась проверка.
- Если найдено отклонение от PRD, сначала зафиксировать его здесь, затем либо исправить, либо явно эскалировать.

## Entries

- 2026-04-06T09:40:00Z | Updated connect contract with source-identity event (`tabId` + `branch`).
  - Updated client connect config contract to `remoteConsoleClient.connect(console, { url, tabId?, branch? })`.
  - Added synthetic service event emitted on successful connect: `[remote-console] connected tabId=<...> branch=<...>`.
  - Propagated optional `branch` marker into `RemoteConsoleLogEntry`.
  - Updated specs:
    - `services/remote-console/spec/remote-console.prd.spec.md`
    - `services/remote-console/spec/remote-console.tests.spec.md`
  - Updated docs:
    - `services/remote-console/README.md`
  - Updated tests:
    - added client scenario `should emit connect event with tab and branch metadata`.
    - adjusted expectations for mirrored entry counts due to one extra connect event.
  - Verification:
    - `npx tsx --test services/remote-console/__tests__/remote-console-client.test.ts` -> pass (10/10).
    - `npx tsx --test services/remote-console/__tests__/remote-console-server.test.ts cli/cmd/remote-console/__tests__/remote-console.cmd.test.ts` -> pass (8/8).
    - `npm run type-check` -> pass.

- 2026-04-05T19:05:00Z | Implemented RC-001-W1/W2/W3/W4 baseline.
  - Added `services/remote-console` production slice: public entrypoint, browser client runtime (patching, batching, serializer, manual + pagehide disconnect, unload-safe `sendBeacon -> fetch keepalive`), server runtime (single endpoint + envelope dispatch + controlled shutdown), stdout writer.
  - Added CLI command `remote-console` (`cli/cmd/remote-console/*`), registered routing/help/docs updates in `cli/gennady.ts`, `cli/cmd/help/help.cmd.ts`, `cli/AGENTS.md`.
  - Added scope tests:
    - `services/remote-console/__tests__/remote-console-client.test.ts`
    - `services/remote-console/__tests__/remote-console-server.test.ts`
    - `cli/cmd/remote-console/__tests__/remote-console.cmd.test.ts`

- 2026-04-05T19:10:00Z | Ran mandatory DbcAuditor subprocess and applied audit fixes.
  - Subprocess run method: `codex exec` in dedicated subprocess context (DbcAuditor prompt + `dbc-audit` directive target set).
  - Audit output: 5 findings (contracts/comments), no structural blockers.
  - Applied fixes:
    - Added missing declaration-local `@purpose` contracts for internal state/members/constructors and exported shape fields.
    - Removed incorrect `@throws` contract from `runRemoteConsoleCommand` (function degrades to warning instead of rethrow).
    - Added terse why-comments at branch policy points (server envelope guard, serializer fallback).

- 2026-04-05T19:15:00Z | Verification results after fixes.
  - `npm run type-check` -> pass.
  - `npx tsx --test services/remote-console/__tests__/remote-console-client.test.ts services/remote-console/__tests__/remote-console-server.test.ts cli/cmd/remote-console/__tests__/remote-console.cmd.test.ts` -> pass (17/17).
  - `npx tsx --test --experimental-test-coverage services/remote-console/__tests__/remote-console-client.test.ts services/remote-console/__tests__/remote-console-server.test.ts cli/cmd/remote-console/__tests__/remote-console.cmd.test.ts` -> pass; coverage summary: lines 98.14%, branches 83.62%, funcs 89.39%.
