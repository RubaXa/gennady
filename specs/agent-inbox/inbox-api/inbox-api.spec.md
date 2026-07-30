# Module: inbox-api (v2 — полный рерайт)

> Parent scope: [`../agent-inbox.spec.md`](../agent-inbox.spec.md) · владеет решениями:
> D-306 (проекции двух осей), D-309 (ошибка = видимое состояние), D-310 (транспорт)
> · **канонический дом таблиц §5 корневой спеки**

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

HTTP-сервер (zero-dep `node:http`) + SSE. Тонкая прослойка: **проекции** журнала и
VCS-sync в DTO для дашборда. Никакой бизнес-логики; доска и лента никогда не читаются
из летучей памяти executors — только из журнала + sync-снимка (D-306).

<!--/SECTION:MODULE_VISION-->

## 2. REST

| Метод | Путь                          | Ответ                                                                                                                                          |
| ----- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| GET   | `/api/boot`                   | `BootDto {phase, progress, ready, error?}`                                                                                                     |
| GET   | `/api/board`                  | `{groups: Record<AttentionState, MrRef[]>, cards: MrCard[], syncState: ok\|degraded}`                                                          |
| GET   | `/api/state?mr=<ref>`         | батч: `{card, queue: TaskDto[], widgets: FeedWidget[]}`                                                                                        |
| GET   | `/api/mr/:ref/feed?cursor=`   | `{widgets: FeedWidget[], nextCursor}`; выдача обновляет `lastReadAt` (read-cursor, inbox-core §3)                                              |
| POST  | `/api/mr/:ref/task`           | `{type, params, dedupKey?}` → `{taskId, position}` (дедуп: явный dedupKey клиента, иначе серверный `type + canonical(params)`)                 |
| GET   | `/api/mr/:ref/artifact?path=` | контент артефакта (traversal-guard)                                                                                                            |
| POST  | `/api/mr/:ref/chat`           | `{text, anchor?}` → `{taskId\|turnId}`                                                                                                         |
| POST  | `/api/mr/:ref/decision`       | `{proposalId, verdict: accept\|edit\|reject, payload?}` → accept/edit: `{taskId}` (effect в очередь); reject: `204` (запись decision в журнал) |
| GET   | `/api/mr/:ref/stream`         | SSE (§3)                                                                                                                                       |
| GET   | `/api/diagnostics?limit=`     | хвост серверного лога                                                                                                                          |

## 3. SSE-фреймы (один канал на MR для всего)

Топология: `:ref` = encodeURIComponent целиком (`mail%2Fmessenger!174`). Страница MR
держит один стрим; страница доски поллит `/api/board` 10–15 сек; `board_hint` и
`dryrun` дублируются во **все активные MR-каналы** (дополнительного глобального стрима
нет). При деградации sync — `board_hint` + `syncState: degraded` в board/state.

| Фрейм           | Payload                                                |
| --------------- | ------------------------------------------------------ |
| `task_update`   | `{taskId, status, progress?}`                          |
| `widget_update` | `{widgetId, bump?, resolved?, payload}`                |
| `board_hint`    | `{}` — инвалидация доски; клиент догоняет `/api/board` |
| `token`         | дельта текста хода чата (для стрим-пузыря)             |
| `turn_done`     | ход завершён + итоговое сообщение                      |
| `error`         | ход упал: `{code, message}`                            |
| `mutation`      | предложение мутации артефакта (превью)                 |
| `refresh`       | мутация применена/откачена — инвалидация артефакта     |
| `dryrun`        | подавленные эффекты (broadcast-all)                    |

## 4. DTO

| DTO          | Поля (ключевые)                                                                                                                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MrCard`     | ref, title, author, **myRole**, **attention**, counters `{approvals:'n/m', reviewers:[{user,voted}], ci, threads:'open/total', awaitingMe, newCommits, unread}` , **work**: `{state, label, taskId?, startedAt}` |
| `FeedWidget` | widgetId, type (`findings\|threads\|artifact\|gitlab\|plan\|progress\|action`), lastActivity, resolved, unread, payload*, anchors*                                                                               |
| `TaskDto`    | taskId, type, status, position, dependsOn, createdBy, startedAt                                                                                                                                                  |
| `BootDto`    | phase (`connect\|poll\|reconcile\|restore\|ready\|failed`), progress `{done,total,label}`, error?                                                                                                                |

\* `payload` — per-type схема: findings `{items:[{id,severity,file,line,summary,state}]}`, threads `{items:[{threadId,author,quote,factcheck,reactions[]}]}`,
artifact `{path,title,attachments[]}`, gitlab `{event,data,taskId?}`, plan `{stage,tracksDone,tracksTotal,queuePosition}`, progress `{events[]}`, action `{effect,result}`.
`anchors` — мета-якоря по схеме inbox-chat §2.

Ошибки домена — structured `{error: {code, message, anchor?}}`; UI показывает как
состояние виджета, не глотает (D-309).

## 5. Раздача статики

SPA из `dist/inbox-serve` (сборка `npm run inbox-serve:build`). Сервер не собирает;
устаревший бандл — операционная дисциплина (урок 2026-07-22/28).

## 6. Приёмка

1. После `ready` доска никогда не мерцает «пусто → без роли → роли» (контрольный
   сценарий инцидента).
2. `POST /task` возвращает taskId синхронно; повтор с тем же dedupKey — тот же taskId.
3. SSE: `task_update` прилетают без поллинга; разрыв → клиент реконсилирует `/api/state`.
4. Все DTO соответствуют §4 (контракт-тесты).

## Critic Rounds

### Round 1 — 2026-07-29

- Verdict: NEEDS_WORK (6 MAJOR)
- Accepted: 8 — тип элементов groups (Record<Attention, MrRef[]>), источник dedupKey (явный клиентский или серверный type+canonical(params)), ответ POST /decision ({taskId} / 204), топология SSE для board-фреймов, degraded-канал (syncState), кодирование :ref (encodeURIComponent целиком), семантика фреймов раскрыта, payload per-type + anchors → inbox-chat §2
- Rejected: 0
- Reconcile: anchors → REUSE схема inbox-chat §2; progress BootDto → {done,total,label} как в inbox-core
- Changes: §2 board/task/decision; §3 топология + фреймы; §4 DTO payload

### Round 2 — 2026-07-29

- Stop: лимит оператора (2 раунда)

## Handoff Rules Additions

- [typescript-rules](../../../ai/directives/coding/typescript-rules.xml) — impl-фазы (\*.ts)
- [node-test](../../../ai/directives/testing/node-test.xml) (+ testing-common) — test-фазы
