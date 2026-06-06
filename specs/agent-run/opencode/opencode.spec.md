# Module: opencode

<!--SECTION:MODULE_VISION-->
## 1. Module Vision

Адаптер движка opencode. Родительский scope: [`../../agent-run.spec.md`](../../agent-run.spec.md). Реализует контракт [`AgentEngine`](../core/core.spec.md) из модуля `core`.

Знает всё, что специфично для opencode: как запустить `opencode run`, как включить readonly через профиль прав, как отдать рабочие директории, как почистить окружение подпроцесса и как перевести сбой opencode в типизированную `AgentRunError`. Первый из движков; будущие (claude/codex/cursor) — соседи по `engines/`.
<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->
## 2. Module Usage Example

```ts
import { OpencodeEngine } from '@services/agent-run/engines/opencode'

const engine = new OpencodeEngine()

await engine.detect() // { installed: true, version: '1.16.2' }

const res = await engine.run({
  task: 'как связаны эти репозитории?',
  dirs: ['/repoA', '/repoB'],
}) // → { text: '…markdown…', engine: 'opencode' }
// при сбое кидает AgentRunError с code + hint
```
<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->
## 3. Entity Inventory (Closed-World)

_Это полный список сущностей модуля `opencode`. Любое введение сущности execution-агентом помимо этого списка считается drift'ом и требует обновления spec._

| Name | Surface | Type | Purpose |
|------|---------|------|---------|
| `OpencodeEngine` | ⚪ | Adapter | Реализация `AgentEngine`: запуск `opencode run` в readonly с директориями. |
| `opencodeErrorMap` | ⚪ | Utility | Перевод exit-кода + stderr opencode в `ErrorCode` + `hint`. |
<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:ENTITY_SURFACES-->
## 4. Entity Surfaces

### `OpencodeEngine`
- **Type:** Adapter (implements `AgentEngine`)
- **Purpose:** запустить opencode как подпроцесс и вернуть текстовый ответ; включить readonly и доступ к директориям.
- **Public Operations:**
  - `id` = `'opencode'`.
  - `detect() -> { installed, version? }` — запустить `opencode --version`.
  - `run(options) -> RunResult` — собрать аргументы (`run <task> --agent <readonly> --dir <первая>`; остальные директории перечисляются в тексте задания — `external_directory` deferred в v1, Спайк 1), почистить окружение, спавнить, собрать stdout → `{ text, engine: 'opencode' }`.
- **Lifecycle:** singleton, регистрируется в реестре `core` через `index.ts`.
- **Errors & Degradation:** при ненулевом exit или нераспознанном выводе → `opencodeErrorMap` → кидает `AgentRunError`.
- **Consumers:** Internal — реестр `core` (`../core/core.spec.md`); External — N/A (через публичный `run`).

### `opencodeErrorMap`
- **Type:** Utility (pure function)
- **Purpose:** превратить сырой сбой opencode в типизированную ошибку с подсказкой оператору.
- **Public Operations:** `mapError(failure: { spawnErrorCode?: string; exitCode?: number; stderr?: string }) -> { code: ErrorCode, hint: string }` — на вход нормализованный дескриптор сбоя: либо spawn `error.code` (ENOENT/EACCES), либо exit-код + stderr запущенного процесса. `TIMEOUT` сюда НЕ приходит — его бросает `OpencodeEngine` напрямую по своему таймеру.
- **Lifecycle:** чистая функция, без состояния.
- **Errors & Degradation:** нераспознанный паттерн → `LAUNCH_FAILED` + сырой stderr в hint.
- **Consumers:** Internal — `OpencodeEngine`.
<!--/SECTION:ENTITY_SURFACES-->

<!--SECTION:MODULE_CONTRACTS-->
## 5. Module Contracts (DbC)

### 5.1 Adapters

#### Adapter: `OpencodeEngine`
- **Implements:** [`AgentEngine`](../core/core.spec.md) (`core/ports/agent-engine.port.ts`)
- **Purpose:** запуск opencode в readonly с заданием и директориями.
- **Supporting Artifacts:** readonly agent-профиль через штатную команду `opencode agent create --permissions "read,glob,grep,webfetch,websearch,lsp"` (allow-list прав; `edit`/`write`/`bash`/`task`/`todowrite` вне списка → запрещены движком), передаётся через `--agent`. Механизм подтверждён спайком. **Профиль генерится один раз на процесс (lazy, кэш) и переиспользуется** — не подпроцесс `agent create` на каждый `run()` (скорость) и нет утечки temp-папок на горячем пути. Сбой `agent create` → `LAUNCH_FAILED` (типизированно). Очистка — при выходе процесса (best-effort).
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `integration`, `e2e`
- **Deferred Runtime Scope:** доступ к нескольким внешним директориям (`external_directory`) — подтверждается спайком. **v1-фолбэк:** если multi-root окажется ненадёжным — одна `--dir` (первая), остальные пути перечисляются в тексте задания; buildability v1 на спайк не завязана. Стриминг/сессии — не в v1.

**Side Effects:**
- Спавн подпроцесса `opencode run …` **с таймаутом**; при превышении — SIGTERM, затем **SIGKILL после grace-периода 5с**, если процесс не завершился (SIGTERM игнорируем — нужен добивающий SIGKILL, иначе сирота держит pipe и течут fd).
- Генерация readonly agent-профиля (`opencode agent create`) — **однократно на процесс, кэш**.
- Чтение stdout/stderr подпроцесса.
- Очистка окружения подпроцесса: снять **весь набор прокси-переменных** — `HTTPS_PROXY`, `https_proxy`, `HTTP_PROXY`, `http_proxy`, `ALL_PROXY`, `all_proxy` (libcurl/Node читают и строчные; иначе корпоративный прокси режет провайдера — урок сессии).

**Contract (DbC):**
- Preconditions: `options.task` непустой.
- **Оптимистичный запуск:** НЕ делать pre-flight `detect()`; спавнить `opencode run` сразу. Ошибка spawn (`error.code` ENOENT/EACCES) → `AGENT_NOT_INSTALLED` через `opencodeErrorMap`.
- Postconditions: при успехе `{ text, engine: 'opencode' }`, `text` = stdout движка; **ни один файл в `dirs` не изменён** (readonly). При неуспехе — `AgentRunError` через `opencodeErrorMap`. Превышение `timeout` → `AgentRunError('TIMEOUT')` после SIGTERM (+SIGKILL по grace). Сбой генерации профиля (`agent create` non-zero) → `LAUNCH_FAILED`.
- Invariants: запуск всегда с readonly-профилем; окружение подпроцесса очищено от прокси-переменных (оба регистра); по завершении (успех/ошибка/таймаут) подпроцесс гарантированно мёртв — не сирота.

### 5.2 Utility

#### Utility: `opencodeErrorMap`
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`

**Contract (DbC):**
- Postconditions: вернуть `{ code, hint }`. Маппинг (6 кодов; `TIMEOUT` сюда не входит — его кидает `OpencodeEngine` напрямую):

  | Сигнал | вход | `code` | `hint` |
  |---|---|---|---|
  | бинарь не в PATH/не запускается | `spawnErrorCode` ENOENT/EACCES | `AGENT_NOT_INSTALLED` | поставить opencode (`brew install opencode`) |
  | `403` / proxy / `ERR_ACCESS_DENIED` | stderr | `NETWORK_BLOCKED` | снять прокси-переменные (`HTTPS_PROXY`/`https_proxy`…) или дать доступ |
  | `constraint failed.*session_message` / `database schema` / `migration` | stderr | `VERSION_MISMATCH` | CLI отстал → `brew upgrade opencode`; App отстал → обновить opencode App |
  | `Forbidden` на модель/провайдера | stderr | `MODEL_FORBIDDEN` | проверить ключ и права на модель |
  | `API key … missing` / пустой ключ | stderr | `CREDENTIAL_MISSING` | задать env-ключ провайдера |
  | сбой генерации профиля (`agent create` non-zero) или прочее | exitCode+stderr | `LAUNCH_FAILED` | сырой stderr + «причина не распознана» |
- Invariants: всегда возвращает валидный `ErrorCode`; никогда не кидает сама. Паттерны `VERSION_MISMATCH` намеренно широкие — текст ошибки opencode хрупок к версиям, узкий матч ловит не всё.
- `TIMEOUT` живёт вне error-map: `OpencodeEngine` по своему таймеру делает SIGTERM→SIGKILL и кидает `AgentRunError('TIMEOUT')` сам.
<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->
## 6. Public Options & Policies

- Все публичные опции приходят из `RunOptions` (`core`); этот модуль их исполняет:
  - `dirs` → `--dir` (первая) + `external_directory` (остальные); фолбэк — одна `--dir` + пути в тексте задания.
  - `mode: 'readonly'` → readonly agent через `opencode agent create --permissions` + `--agent`.
  - `timeout` → потолок подпроцесса; превышение → SIGTERM + `TIMEOUT`.
  - `engine` → не наблюдается здесь (выбор движка — забота реестра).
- Отложено / not consumed in v1: `--format json`, `--model`/`--variant` (выбор модели), стриминг, сессии — см. scope spec §3.3.
<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->
## 7. File Structure

```
services/agent-run/
└── engines/
    └── opencode/
        ├── opencode-engine.ts        # OpencodeEngine (Adapter)
        ├── opencode-error-map.ts     # opencodeErrorMap (Utility)
        └── __tests__/
            ├── opencode-engine.test.ts
            └── opencode-error-map.test.ts
```

**File Mapping:**
- `engines/opencode/opencode-engine.ts`: `OpencodeEngine`.
- `engines/opencode/opencode-error-map.ts`: `opencodeErrorMap`.

Namespace: файлы `opencode-*`, тип `OpencodeEngine` — `rg opencode` находит весь модуль.
<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->
## 8. Module Decision Log

### D-001 — readonly через эфемерный agent-профиль (`--agent`)
- **Status:** active
- **Recorded:** session ModuleDecomposition, agent-run
- **Why:** у opencode есть permission-движок; профиль прав надёжнее разбора флагов.
- **Risk accepted:** enforcement делегирован opencode (trust boundary, см. scope spec §3.4).

### D-002 — Очистка `HTTPS_PROXY` в окружении подпроцесса
- **Status:** active
- **Recorded:** session ModuleDecomposition, agent-run
- **Why:** прямой урок сессии — корпоративный прокси отдаёт 403 на провайдера.
- **Risk accepted:** если провайдер доступен только через прокси — поймаем `NETWORK_BLOCKED`, что и нужно.

### D-000 — Модуль внутренний (internal-only — not in composition view)
- **Status:** active
- **Recorded:** session ModuleDecomposition, agent-run
- **Why:** все сущности модуля ⚪ internal; потребитель видит движок только через публичный `run()` из `core`, не напрямую. В composition view scope-спеки модуль не фигурирует намеренно.

### D-003 — Каталог ошибок зашит в `opencodeErrorMap`, не в `core`
- **Status:** active
- **Recorded:** session ModuleDecomposition, agent-run
- **Why:** сопоставление паттернов специфично для opencode; `core` держит только сам тип `ErrorCode`.
- **Risk accepted:** каждый новый движок несёт свой error-map — это правильно (паттерны у движков разные).

### D-004 — Оптимистичный запуск + таймаут с SIGTERM
- **Status:** active
- **Recorded:** session SddCritic, agent-run
- **Why:** скорость — главное правило; запускаем `opencode run` сразу, без пред-проверки `--version`. Спайк подтвердил: spawn отдаёт `error.code` (ENOENT/EACCES) → `AGENT_NOT_INSTALLED`. Таймаут (дефолт 120000 мс) + SIGTERM защищают от зависшего подпроцесса.
- **Risk accepted:** TOCTOU-зазор закрыт маппингом spawn-ошибки.

### D-005 — readonly через `opencode agent create --permissions` (allow-list)
- **Status:** active
- **Recorded:** session SddCritic, agent-run
- **Why:** спайк показал штатную команду opencode для генерации агента с allow-list прав — надёжнее ручного файла профиля.
- **Risk accepted:** enforcement делегирован opencode (trust boundary, scope §3.4); v1 исключает `bash` из allow-list, теряя shell-поиск ради гарантированного readonly.
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->
## 9. Inter-Module Dependencies
- **Depends on:** [`core`](../core/core.spec.md) — контракт `AgentEngine`, типы `RunOptions`/`RunResult`, `AgentRunError`, `ErrorCode`.
- **Scope Reference (cross-scope):** None.
- **Provides to:** регистрируется в реестре `core` через `index.ts` (composition root).

```mermaid
graph TD
  opencode --> core
```
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->

<!--SECTION:HANDOFF-->
## 10. Handoff to task-scaffolding
- **Implementation files to be created:** `engines/opencode/opencode-engine.ts`, `engines/opencode/opencode-error-map.ts`.
- **Test files to be created:** `engines/opencode/__tests__/opencode-engine.test.ts`, `engines/opencode/__tests__/opencode-error-map.test.ts`.
- **Stack dependencies:**
  - Language: `typescript` (resolves to `ai/directives/coding/typescript-rules.xml`)
  - Test framework: `node-test` (resolves to `ai/directives/testing/node-test.xml`)
- **Module Rules Additions:** None
- **Open risks & validation needs:**
  - **Спайк 1 (multi-dir):** доступ к нескольким внешним директориям (`external_directory` + `--dir`) — не подтверждён. Фолбэк: одна `--dir` + перечисление путей в задании. Buildability v1 НЕ блокируется.
  - **Спайк 2 (readonly) — ЗАКРЫТ:** механизм подтверждён — `opencode agent create --permissions "read,glob,grep,webfetch,websearch,lsp"` создаёт профиль с allow-list прав; `--agent` его подхватывает.
  - **Тестируемость без живой модели:** `opencode-error-map.test.ts` — чистый unit на строках stderr + spawn `error.code` (полное покрытие 7 кодов без подпроцесса). `opencode-engine.test.ts` — integration/e2e: требует установленного opencode и снятых прокси-переменных; таймаут проверяется на заведомо долгом задании.
<!--/SECTION:HANDOFF-->
