# Бриф: переработка serve-спек под детерминированный конвейер ролей

> Handoff-документ для агента, дорабатывающего specs/agent-inbox и tasks/agent-inbox
> (TSK-105–117). После внесения правок файл удалить.

## 1. Зачем всё это (мотивация — вписать в спеку, не потерять)

Serve-режим — это перенос оркестрации ревью-конвейера из инструкций-в-сессии в
детерминированный код движка. Причина: инструкциям агент может не следовать, и на
живых прогонах это происходит регулярно:

- пропускает шаги конвейера (не запускает сабагентов, не следует плану);
- забывает спросить оператора перед публичным действием или спрашивает не то;
- не дописывает артефакты до конца / не проставляет маркеры;
- сессия OpenCode падает или зависает (в UI видно `Terminated` / edit-fail),
  при этом достаточно написать в сессию сообщение — и она продолжает работу.

Вывод: контроль процесса нельзя оставлять внутри LLM-сессии. Порядок шагов, гейты,
ретраи, классификация исходов, публичные действия — код. LLM — только содержимое
отдельного узла.

Текущий контракт роли (SV-04: один `buildSystemPrompt` на роль, одна JSON-схема на
роль в SchemaRegistry, `Transition {from,to,trigger}` без guard-функций) эту модель
не вмещает — он описывает «одну AI-вставку между состояниями». Переделываем на
граф типизированных узлов.

## 2. Аксиомы (добавить в agent-inbox.spec.md §4.2.1, стиль существующих AX_*)

| Аксиома | Суть |
| --- | --- |
| `AX_ENGINE_ORCHESTRATES` | Последовательность шагов, гейты, ретраи, лимиты — детерминированный код движка. LLM не управляет процессом. |
| `AX_SESSION_NO_SIDE_EFFECTS` | AI-сессия не совершает публичных действий (постинг, approve, пинг оператора) и не задаёт вопросов оператору. Она завершается артефактом/результатом. Все side effects выполняет движок через effect-узлы после гейтов. Усиливает NFC-SV-06 (токены в сессию не передаются). |
| `AX_ARTIFACTS_ARE_CHECKPOINTS` | Истина — артефакты на диске (`reports/<mr>/`) + audit log. Сессии расходные. Состояние RoleInstance восстановимо/пересоздаваемо от артефактов. |
| `AX_CLASSIFIED_OUTCOME` | Исход каждого AI-узла классифицируется программно. Каждому классу отказа соответствует типизированный remediation-сигнал, содержательный для агента («JSON-блок не распарсился, отдай в формате X», «сессия прервалась на шаге Y — доделай Z»), а не «неправильно, переделай». |
| `AX_RECOVERY_LADDER` | Восстановление узла — лесенка: (1) continue-сигнал в ту же сессию (дёшево, лечит зависания/недоделки), (2) restart узла в свежей сессии от артефактов (те же входы), (3) `AWAITING_OPERATOR`. Лимиты на каждую ступень — политика узла. |

## 3. Целевая модель роли (переписать SV-04 + inbox-roles.spec.md)

Роль = TypeScript-модуль, экспортирующий граф узлов. Эскиз контракта (детали —
на усмотрение агента, сохранить дух):

```ts
type RoleNode =
  | {
      kind: 'session';
      prompt(ctx: MrContext, artifacts: Artifacts): { system: string; text: string };
      dir(ctx: MrContext): string;            // cwd сессии: worktree MR или reports-папка
      resultSchema?: JsonSchema;               // схема результата узла (не роли!)
      policy: { promptTimeout: number; continueMax: number; restartMax: number };
    }
  | { kind: 'gate';   verify(artifacts: Artifacts): GateResult }   // код, не LLM
  | { kind: 'ask';    question(artifacts: Artifacts): OperatorQuestion } // generic, ждёт оператора
  | { kind: 'effect'; run(ctx: MrContext, artifacts: Artifacts): Promise<void> }; // vcs-reply/approve

interface RoleModule {
  name: string;
  nodes: Record<NodeId, RoleNode>;
  edges: Edge[];               // от исхода узла (ok | fail-класс | ответ оператора) к следующему узлу
  defaultRights: Rights;
  escalation: EscalationConfig; // см. открытый вопрос §8.1
}
```

Следствия:

- `buildSystemPrompt(ctx)` на уровне роли **удалить**; промпт собирается per-node
  (TSK-116 ai-kit остаётся поставщиком склейки директив, но вызывается из узлов).
- `SchemaRegistry`: маппинг `роль → схема` заменить на `узел → схема`.
- Кодовые гейты v1 переиспользуют готовое: `inbox-review-plan --validate`
  (структура плана/такс-файлов, словари, mermaid) — вызывать как функцию.
- Fan-out по дорожкам: session-узел, который движок инстанцирует N раз параллельно
  (лимит SV-11 действует); join — gate-узел.
- Reviewer-роль v1 обязана выражать существующий конвейер (D57/D70):
  `scaffold → gate(validate scaffolded) → enrich → gate(enriched) → track-sessions(fan-out)
  → gate(filled) → synthesize → ask(согласование ответов) → effect(post) → done`.
  Это тест выразительности контракта: если конвейер не ложится — контракт неверен.

## 4. Классификация исходов и remediation (новая секция в inbox-opencode.spec.md)

Новая сущность `OutcomeClassifier` (место — inbox-opencode или inbox-roles, решить
по связности):

- Вход: сырой результат узла (финальное сообщение сессии, статус сессии, событие SDK).
- Классы (минимум): `OK` | `NO_RESULT` (нет ожидаемого блока/артефакта) |
  `PARSE_ERROR` | `SCHEMA_MISMATCH(details)` | `SESSION_ERROR` (Terminated и т.п.) |
  `TIMEOUT` | `INCOMPLETE_ARTIFACT(details из gate)`.
- Каждому классу — шаблон remediation-сигнала с конкретикой из классификации
  (какие поля не совпали со схемой, какого маркера не хватает, на каком шаге упал).
- Движок по `AX_RECOVERY_LADDER`: сигнал → continue в ту же сессию; исчерпан
  `continueMax` → restart от артефактов; исчерпан `restartMax` → `AWAITING_OPERATOR`
  с накопленной диагностикой. Все переходы — в audit log
  (`ai_node_retry` расширить полем `outcome`).

Факт про SDK (проверено по docs, перепроверить при TSK-112): `@opencode-ai/sdk`
поддерживает structured output — `session.prompt()` с
`format: { type: 'json_schema', schema }` (модель отвечает через StructuredOutput-tool
валидированным JSON); есть SSE-события `client.event.list()` и `session.abort()`.
Значит: native structured output — первая линия (класс `SCHEMA_MISMATCH` отдаёт SDK),
но `OutcomeClassifier` обязателен поверх — зависшая сессия не возвращает ничего,
и это тоже классифицируемый исход. Контракт порта не должен ломаться, если
format-параметр в какой-то версии SDK недоступен (fallback: JSON-блок в финальном
сообщении + парсинг движком).

## 5. Правки по файлам спек

### specs/agent-inbox/agent-inbox.spec.md

1. §4.2.1: добавить 5 аксиом из §2 (таблица или список в стиле NFC).
2. SV-04: переписать на узловую модель (§3). Убрать `buildSystemPrompt` из
   минимального контракта роли.
3. SV-05: дополнить — structured output через `format: json_schema` SDK,
   плюс `OutcomeClassifier` и recovery ladder поверх; ссылка на inbox-opencode.
4. SV-13: дополнить лесенкой восстановления AI-узла (continue → restart →
   AWAITING_OPERATOR) и судьбой RoleInstance при рестарте serve (см. §8.2).
5. NFC-SV-06: уточнить — read-only на код проекта (worktree), read-write на
   `reports/<mr>/` (артефакты-чекпоинты); публичные действия — только движок
   (`AX_SESSION_NO_SIDE_EFFECTS`).
6. Decision Log: новая запись D77+ — «оркестрация в движке, LLM только в узлах»
   с мотивацией из §1 и отвергнутой альтернативой «инструкции в сессии +
  самопроверка модели» (наблюдаемые отказы).

### specs/agent-inbox/inbox-roles/inbox-roles.spec.md

1. Entity Inventory/Surfaces: `RoleNode`-модель; `RoleInstance.state` = текущий
   узел + счётчики continue/restart; `advance()` → `step()` (выполнить текущий
   узел, классифицировать исход, перейти по edge).
2. Контракты DbC: инварианты — «gate-узлы детерминированы (без LLM)», «effect-узлы
   выполняются не более одного раза на успешный проход» (идемпотентность/защита
   от двойного постинга при restart — продумать: маркер в артефактах или audit).
3. Reviewer/Author роли: описать графы v1 (reviewer — из §3; author — по D68:
   разбор замечаний → сводка+задание+черновики → ask → effect react/reply).

### specs/agent-inbox/inbox-opencode/inbox-opencode.spec.md

1. `OpenCodePort`: `createSession({ title, directory })` (directory обязателен);
   `prompt(sessionId, { system?, text, format? })` → сырой результат;
   `status(sessionId)`; `continue(sessionId, signal)` (семантически выделенный
   prompt); `abort`; `close`. Событийная подписка (SSE) — для детекта зависаний;
   если по итогам research проще polling `status` — допустимо, зафиксировать.
2. `OutcomeClassifier` (или вынести в inbox-roles — решить и записать).
3. `SchemaRegistry`: узел → схема.
4. `OpenCodeMock`: обязан уметь симулировать все классы исходов (зависание,
   Terminated, битый JSON, недоделанный артефакт) — иначе recovery ladder
   нетестируем.
5. D-78: дополнить фактом про format/json_schema и events.

### specs/agent-inbox/inbox-api/inbox-api.spec.md

1. `POST /api/mr/:id/action`: вместо enum `post|reject|skip` — generic ответ на
   `OperatorQuestion`: `{ questionId, choice, payload? }`. Board отдаёт pending
   question в карточке (ask-узел = источник).
2. Новый эндпоинт `GET /api/mr/:id/report` — отдаёт артефакты из
   `reports/<mr>/` (README/план/находки) для `MrDetailModal`. Закрывает старую
   дыру «модалке неоткуда взять отчёт».
3. Зафиксировать контракт границы api↔roles: интерфейс, который MrRouter/BoardRouter
   требуют от scheduler (порт `BoardProviderPort` или эквивалент) — чтобы TSK-106
   мокал определённый контракт, а TSK-113 его реализовал.

### specs/agent-inbox/inbox-dashboard/inbox-dashboard.spec.md

1. `MrDetailModal`: рендер `OperatorQuestion` (варианты из ask-узла), данные
   отчёта — из `GET /api/mr/:id/report`.

## 6. Правки задач (tasks/agent-inbox)

| Задача | Правка |
| --- | --- |
| TSK-106 | BDD/Target Files: generic action + report endpoint + мок BoardProviderPort. |
| TSK-107 | Модалка: OperatorQuestion + report. |
| TSK-111 | + `OutcomeClassifier`, `status`/`continue` в порте и моке; мок симулирует все классы исходов; SchemaRegistry узел→схема. BDD: лесенка (битый JSON → сигнал → исправлено; Terminated → continue; continueMax исчерпан → restart; restartMax → AWAITING_OPERATOR). |
| TSK-112 | + research-фаза: подтвердить в актуальном SDK `format: json_schema`, events, directory-байндинг сессии; реализация status/continue/format. |
| TSK-113 | Роли на узловой модели; reviewer-граф v1 = существующий конвейер; тест выразительности (§3); двойной постинг при restart — покрыт тестом. |
| TSK-116 | `buildSystemPrompt(role, ctx)` → per-node сборка (`buildNodePrompt(node, ctx)` или роль сама зовёт compile); role-map остаётся. |
| TSK-117 | + критерии: убить сессию среди узла → движок восстановил по лесенке; рестарт serve среди ревью → инстанс продолжил/пересоздался от артефактов. |

Порядок DAG не меняется. Verification-набор задач (type-check/test/format) не менять.

## 7. Мелкие долги из прошлого ревью — закрыть тем же заходом

1. `USE_MOCKS=true` (TSK-115) противоречит NFC-05 «ENV — только секрет» →
   заменить на флаг `--mocks` (или явное исключение в NFC-05 с обоснованием).
2. SV-09: механизм «оператор сделал POST → таймер сброшен» — записать конкретно
   (MrRouter пишет `operator_action` в audit; Escalator читает последний
   `operator_action` по MR из audit — или поле на RoleInstance; выбрать одно).
3. SV-11 vs SessionPool: лимит per-role × число ролей может превышать
   `maxSessions` пула → записать поведение (ожидание в порядке очереди, без
   дедлока) как инвариант.
4. Bootstrap #1–11 (npm-пакеты, vite entry, tailwind) — приписать к задачам
   (пакеты дашборда → TSK-107 P1; playwright/vite entry → TSK-107 P2; sdk → TSK-112).

## 8. Открытые решения — спросить оператора, не решать самостоятельно

1. **Эскалация прав по таймеру (SV-09/D74).** Конфликтует с NFC-01/NFC-07
   (автономный постинг/approve заблокирован до политики, независимой от текста MR).
   Варианты: (a) оставить как есть; (b) v1 эскалирует только нотификации
   (VK Teams-пинг), права — всегда явным действием оператора; (c) canPost по
   таймеру оставить, canApprove убрать. Рекомендация ревью: (b).
2. **Персистентность RoleInstance при рестарте serve.** Варианты: (a) состояние
   выводится из артефактов + audit при старте (сложнее, «доска переживает
   рестарт»); (b) честная эфемерность: рестарт = пересборка INBOX из registry,
   активные инстансы начинают граф заново от последнего валидного чекпоинта
   артефактов. Рекомендация: (b) для v1 — `AX_ARTIFACTS_ARE_CHECKPOINTS` делает
   это дёшево.

## 9. Критерий готовности переработки

- Спеки описывают узловую модель, классификацию исходов и recovery ladder так,
  что reviewer-конвейер v1 (D57/D70) выражается графом без обходных решений.
- Ни один контракт не полагается на то, что агент «сам вспомнит» шаг, вопрос
  оператору или формат — каждый такой пункт держится кодом (гейт, классификатор,
  effect-узел).
- Задачи TSK-106…117 согласованы с новыми контрактами; DAG цел; sdd-check проходит.
