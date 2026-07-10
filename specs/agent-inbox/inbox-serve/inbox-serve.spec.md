# Module: inbox-serve

> Parent scope: [`../agent-inbox.spec.md`](../agent-inbox.spec.md)

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Entry point и dev-инфраструктура serve-режима. Собирает API-сервер,
Vite dev-сервер дашборда и мок-данные в единый запуск одной командой.
В production — DI-bootstrap реальных адаптеров (TSK-115).

<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```bash
# Dev: одна команда запускает и API, и дашборд
$ npm run inbox-serve:dev

  agent-inbox serve  dev
  ───────────────────────────
  API (mocks)  → http://localhost:4174
  Dashboard    → http://localhost:5174

# Dev: Vite стартует дашборд, sidecar-плагин — API
# Proxy /api → 4174
```

```ts
// shared seed factory — используется и standalone, и Vite plugin
import { seedDevData } from './dev-seed.ts';

const boardProvider = new BoardProviderMock();
await seedDevData(boardProvider);
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name               | Type        | Purpose                                                                       |
| ------------------ | ----------- | ----------------------------------------------------------------------------- |
| `inbox-serve.ts`   | Entry Point | Standalone dev-сервер: создаёт HttpServer с BoardProviderMock, слушает SIGINT |
| `dev-seed.ts`      | Factory     | Shared mock seed: наполняет BoardProviderMock тестовыми ролями и MR           |
| `inboxServePlugin` | Vite Plugin | Sidecar-плагин: стартует HttpServer при запуске Vite dev-server               |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:ENTITY_SURFACES-->

## 4. Entity Surfaces

### `inbox-serve.ts`

- **Type:** Entry Point
- **Purpose:** Standalone dev-сервер. Запускает API на порту 4174.
- **Lifecycle:** `node --import tsx services/agent-inbox/modules/inbox-serve/inbox-serve.ts`
- **Signals:** SIGINT/SIGTERM → `server.stop().then(() => process.exit(0))` — no microtask interruption
- **Consumers:** npm script `inbox-serve:dev`, Playwright webServer

### `dev-seed.ts`

- **Type:** Factory
- **Purpose:** Наполняет BoardProviderMock эталонными данными для dev/e2e.
- **Public Operations:** `seedDevData(provider: BoardProviderMock): Promise<BoardProviderMock>` — создаёт роли (reviewer, author), MR в разных стадиях
- **Consumers:** `inbox-serve.ts`, Vite plugin, Playwright fixtures

### `inboxServePlugin`

- **Type:** Vite Plugin
- **Purpose:** Sidecar — стартует HttpServer как часть Vite dev-server. Позволяет запускать всё одной командой `npm run inbox-serve:dev`.
- **Lifecycle:** `configureServer` hook Vite — создаёт сервер, `server.httpServer.on('close', ...)` — останавливает
- **Consumers:** Vite config (`inbox-dashboard/vite.config.ts`)

<!--/SECTION:ENTITY_SURFACES-->

<!--SECTION:MODULE_CONTRACTS-->

## 5. Module Contracts (DbC)

- **Invariants:**
  - `npm run inbox-serve:dev` — single command, starts API (4174) + dashboard (5174), proxy `/api` → 4174
  - SIGINT/SIGTERM → `server.stop().then(() => process.exit(0))` — graceful shutdown, no microtask interruption
  - Port 4174 for API, 5174 for Vite dev
  - Mock data shared via `dev-seed.ts` (single source of truth)

<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:FILE_STRUCTURE-->

## 7. File Structure

```
services/agent-inbox/modules/inbox-serve/
├── inbox-serve.ts       # Standalone dev entry point
├── dev-seed.ts          # Shared mock seed factory
```

**File Mapping:**

- `inbox-serve.ts` — `inbox-serve` entry point
- `dev-seed.ts` — `dev-seed` factory

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->

## 9. Inter-Module Dependencies

- **Depends on:** `inbox-api`, `inbox-mocks`
- **Provides to:** `inbox-dashboard` (Vite plugin), e2e (Playwright webServer), production (TSK-115)

```mermaid
graph TD
    inbox-serve --> inbox-api
    inbox-serve --> inbox-mocks
    inbox-dashboard --> inbox-serve
```

<!--/SECTION:INTER_MODULE_DEPENDENCIES-->

<!--SECTION:HANDOFF-->

## 10. Handoff to task-scaffolding

- **Implementation files to be created:** 2 файла
- **Test files to be created:** 0 (covered by e2e TSK-108)
- **Stack dependencies:**
  - Language: TypeScript
  - Runtime: Node.js 22+
  - Vite plugin API
- **Module Rules Additions:** None

<!--/SECTION:HANDOFF-->
