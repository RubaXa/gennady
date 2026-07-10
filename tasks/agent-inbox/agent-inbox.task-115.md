# Task: TSK-115 — inbox-serve: entry point + DI bootstrap + OpenCode spawn

## 1. Meta

- **Task-ID:** TSK-115 | **Status:** [ ] TODO | **Scope:** agent-inbox | **Module:** inbox-serve (entry point) | **Dependencies:** TSK-106 (API), TSK-109 (core state), TSK-110 (VCS), TSK-111 (opencode), TSK-113 (roles)
- **Purpose:** Собрать все модули в работающий `gennady inbox serve`: spawn opencode, DI-композиция, запуск сервера, graceful shutdown. Последний интеграционный шаг.
- **Spec:** [agent-inbox.spec.md](../../specs/agent-inbox/agent-inbox.spec.md) SV-01, SV-13, §5.1 | **Runtime:** not-implemented | **Verification:** integration

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

## 3. Phases

### P1 — impl (entry point + DI)

- **Rules:** `ai/directives/coding/typescript-rules.xml`
- **Target Files:**
  - `cli/cmd/inbox/serve.cmd.ts` — команда `gennady inbox serve`: парсинг флагов, проверка конфига, DI-композиция, запуск
  - `cli/cmd/inbox/serve/help.ts` — help-вывод
  - `services/agent-inbox/serve/bootstrap.ts` — `bootstrap()`: spawn opencode (PATH, retry ×3, degraded fallback), создать StateStore, VcsInbox (env-определяет mock/real), OpenCode (env-определяет mock/real), RoleEngine, RoleScheduler, HttpServer, DI-связывание. Возвращает `{ server, scheduler, opencode }`.
  - `services/agent-inbox/serve/shutdown.ts` — `gracefulShutdown()`: SIGTERM → отмена OpenCode-сессий, остановка scheduler, закрытие http.Server (таймаут 10s)
- **Exit:** `gennady inbox serve` запускает сервер, выводит статус-бар (OpenCode status, polling interval, roles loaded, port).

### P2 — test (интеграционный)

- **Rules:** none
- **Target Files:**
  - `services/agent-inbox/serve/__tests__/bootstrap.test.ts` — DI-композиция с моками
  - `services/agent-inbox/serve/__tests__/shutdown.test.ts` — graceful shutdown
- **Exit:** Интеграционный тест: bootstrap с мок-VCS + мок-OpenCode → сервер отвечает на `/api/board`. Shutdown → процесс завершается без orphan-сессий.

## 4. BDD

- GIVEN все модули реализованы WHEN bootstrap(USE_MOCKS=true) THEN HttpServer запущен, /api/board возвращает 200
- GIVEN opencode не найден в PATH WHEN bootstrap() THEN «opencode not found in PATH» → ошибка старта
- GIVEN opencode не отвечает 3 попытки WHEN bootstrap() THEN degraded-режим, AI-шаги отключены, сервер запущен
- GIVEN сервер запущен WHEN SIGTERM THEN все OpenCode-сессии отменены, http.Server закрыт, scheduler остановлен
- GIVEN `gennady inbox serve` в CLI WHEN конфиг отсутствует THEN «agent-inbox не настроен. Запустите gennady inbox config --init»
- GIVEN `gennady inbox serve --port 4175` WHEN запущен THEN сервер слушает порт 4175

## 5. Verification

- `npm run type-check` — pass
- `npm run test -- 'services/agent-inbox/serve/__tests__/*.test.ts'` — pass
- `npm run format:check` — pass

## 6. Test Scenario Coverage

| Scenario                             | Level       | Test File         |
| ------------------------------------ | ----------- | ----------------- |
| bootstrap с моками → сервер отвечает | integration | bootstrap.test.ts |
| opencode not found → ошибка          | integration | bootstrap.test.ts |
| opencode 3 retries → degraded        | integration | bootstrap.test.ts |
| graceful shutdown                    | integration | shutdown.test.ts  |
| config absent → сообщение            | unit        | serve.cmd.test.ts |

## 7. Execution Log

### Round 1 — initial

#### P1

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE

#### P2

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
