# Module: inbox-queue (v2 — новый модуль)

> Parent scope: [`../agent-inbox.spec.md`](../agent-inbox.spec.md) · владеет решениями:
> D-307 (очередь/DAG), D-310 (enqueue/taskId), D-311 (TTL-паркинг), D-330 (реестр типов),
> D-331 (маршрутизация сессий)

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Исполнительное ядро agent-inbox. **Per-MR очередь задач + DAG** — вся работа любого MR
(пайплайн, события GitLab, действия оператора) выражена задачами в его очереди.
Между MR — полный параллелизм; **глобальных мьютексов не существует**, потому что
общего состояния между executors нет (контрольный инцидент 2026-07-28).

Классы реализации: `TaskRegistry` (§3), `Executor` (§2), `SessionRouter` (§4.2).

<!--/SECTION:MODULE_VISION-->

## 2. Сущности и поверхности

| Сущность        | Назначение                                                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `TaskInstance`  | `{taskId: '#N' (на MR), type, status: queued/running/waiting_dep/done/failed/cancelled, params, dependsOn[], dedupKey, priority, createdBy}` |
| `TaskType`      | запись реестра: `parallelWith[], exclusiveWith[], dependsOn[], sessionPolicy, priority` (supersede — только через dedupKey, §4.1)            |
| `Executor`      | per-MR цикл: выбирает ready-задачи по правилам, исполняет, пишет переходы в журнал                                                           |
| `SessionRouter` | маршрутизация задачи в сессию (та же / новая / operator)                                                                                     |
| `SessionPool`   | единый приоритетный пул сессий opencode (лимиты — конфиг)                                                                                    |

### Internal ports

| Порт                | Методы                                                                                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TaskQueuePort`     | `enqueue(mr, type, params, dedupKey?) → {taskId, position}` (дедуп: явный ключ или `type + canonical(params)`, атомарно) · `next(mr) → ready задачи` (executor pulls) · `state(mr)` · `supersede(mr, dedupKey)` |
| `SessionRouterPort` | `route(task, anchor?) → session` (таблица §4.2)                                                                                                                                                                 |

## 3. Реестр типов задач

**Грамматика ссылок** (dependsOn/parallelWith/exclusiveWith): `type-name` ·
`glob (track_*)` · `allOf(glob)` (все задачи группы done; фильтр по маркеру плана: `allOf(track_*: mandatory)` — advisory-задачи слоя 3 не держат гейт) · `producerOf(artifactRef)` ·
`external(precondition)` (напр. решение оператора). Pipeline-стадии — тоже типы задач
(первые 5 строк реестра).

| Тип                                          | parallelWith             | exclusiveWith            | dependsOn                                  | sessionPolicy      | priority |
| -------------------------------------------- | ------------------------ | ------------------------ | ------------------------------------------ | ------------------ | -------- |
| `prepare_env`                                | —                        | —                        | —                                          | — (движок)         | 🏗       |
| `plan`                                       | —                        | —                        | prepare_env                                | — (движок)         | 🏗       |
| `enrich`                                     | —                        | —                        | plan                                       | task               | 🏗       |
| `gate_coverage`                              | —                        | —                        | allOf(track*\*, lens*\*)                   | — (движок)         | 🏗       |
| `gate_verdict`                               | —                        | —                        | synthesize                                 | — (движок)         | 🏗       |
| `track_*`                                    | track*\*, lens*\*        | —                        | enrich                                     | task               | 🏗       |
| `lens_*`                                     | track*\*, lens*\*        | —                        | enrich (+ inputs-волны, inbox-pipeline §4) | task               | 🏗       |
| `synthesize`                                 | —                        | delta_review             | allOf(track*\*, lens*\*)                   | task               | 🏗       |
| `delta_review`                               | дорожки старого SHA      | synthesize               | —                                          | task               | 🦊       |
| `verify_fix`                                 | —                        | —                        | —                                          | task               | 🦊       |
| `thread_triage`                              | —                        | —                        | —                                          | task               | 🦊       |
| `fact_check(f)`                              | всё, кроме producerOf(f) | —                        | producerOf(f) done                         | **new_fresh**      | 👤       |
| `deepen(f)`                                  | всё                      | —                        | producerOf(f) done                         | **reuse_producer** | 👤       |
| `widen_search(p)`                            | всё                      | —                        | —                                          | new_fresh          | 👤       |
| `mutate_artifact(a)`                         | —                        | producerOf(a), mutate(a) | —                                          | reuse_producer     | 👤       |
| `chat_question`                              | всё (read-only)          | —                        | —                                          | operator_chat      | 👤       |
| `effect_*` (post/react/resolve/approve/edit) | —                        | другие effect\_\*        | external(решение оператора)                | — (движок)         | 👤       |
| `tail_author`                                | —                        | —                        | gate_verdict                               | task               | 🏗       |
| `tail_reviewer`                              | —                        | —                        | gate_verdict                               | task               | 🏗       |

## 4. Правила исполнения

### 4.1 Очередь

- Приоритеты: 👤 пользовательские > 🦊 событийные > 🏗 фоновые пайплайна.
- Supersede: новая задача с тем же `dedupKey` замещает ожидающую (не исполняющуюся).
- Новые коммиты **не убивают** идущие задачи: дорожки дорабатывают на старом SHA,
  дельта-задача закрывает разрыв.
- Каждый переход статуса = запись в журнал MR (inbox-core) → лента и восстановление
  бесплатны. Статусы: enqueue с незакрытым dependsOn → `waiting_dep` (→ `queued` при
  закрытии); supersede/оператор → `cancelled`.
- Ошибка задачи = статус `failed` + видимое состояние в ленте с retry; retry — по
  лесенке continue/restart (каноника — inbox-opencode §5), терминал — `escalated`;
  инстанс/карточка не «забывают» (смерть амнезии, D-309).
- Задача в статусе `queued` — **видимое состояние ленты**: «⏳ ждёт очередь (#N)»,
  включая ожидание освобождения пула сессий (контроль голодания инцидента 2026-07-28).
- Порядок внутри класса приоритета — FIFO по createdAt; `priority` инстанса переопределяет
  дефолт типа. Пул сессий: без вытеснения идущих сессий; ожидание — в порядке
  приоритета со старением (aging против голодания 🏗).
- Восстановление после краха: `running` → `queued` (идемпотентный re-run), кроме
  `effect_*` — сначала проверка маркера идемпотентности: эффект уже применён → `done`
  (дублей в GitLab нет).

### 4.2 Маршрутизация сессий (D-331)

| Ситуация                            | Сессия                                    |
| ----------------------------------- | ----------------------------------------- |
| валидация/gate недочит, повтор узла | та же (continue)                          |
| `deepen`                            | та же, если жива (иначе новая + артефакт) |
| `fact_check`, `widen_search`        | новая свежая (adversarial)                |
| `mutate_artifact`                   | та же (или новая с артефактом)            |
| `chat_question`                     | operator-сессия MR (inbox-chat)           |

Таск-сессии паркуются с idle-TTL 30–60 мин (D-311); паркинг/резюм — через
inbox-opencode. Артефакты несут `producedBy{sessionId,taskId,model}` — вопрос
разрешается в сессию-продюсера.

> **Стыки (каноника — inbox-opencode):** один opencode-сервер на весь agent-inbox
> (D-311), session registry `sessionId ↔ {taskId, mr, artifacts[], model}`,
> outcome-классификация + лесенка continue/restart, `telemetry/tool-trace.jsonl`.

## 5. Хранилище

Очередь не персистится отдельно: состояние = проекция журнала `events.jsonl`
(inbox-core). После краша executor перечитывает журнал и продолжает с последнего
непрерывного префикса.

## 6. Приёмка

1. **Контрольный сценарий инцидента:** два MR в работе — LLM-задача одного не
   останавливает задачи другого (по журналам виден параллельный прогресс).
2. Дедуп: повторный enqueue с тем же dedupKey возвращает существующий taskId.
3. Supersede: две enqueue с одним dedupKey **до старта исполнения первой** →
   исполняется одна (последняя).
4. Краш-сервера → рестарт → очереди восстановлены из журналов, ни одна карточка не
   «откатилась»; running-задачи перезапущены, применённые эффекты не продублированы.
5. Эффекты строго последовательны и идемпотентны (повторный effect не постит дважды).

## 7. Non-goals

Планирование и гейты (inbox-pipeline) · жизненный цикл сессий и TTL (inbox-opencode) ·
журнал (inbox-core) · вычисление внимания/стадии (inbox-vcs).

## Critic Rounds

### Round 1 — 2026-07-29 (добивочная волна)

- Verdict: CRITICAL (1 CRITICAL, 6 MAJOR, 5 MINOR)
- Accepted: 11 — CRITICAL: pipeline-узлы не были типами задач (висячий dependsOn `enrich`) + грамматика ссылок не определена → реестр расширен (prepare*env/plan/enrich/gates/lens*\*) + формальный язык ссылок (type-name/glob/allOf/producerOf/external); порты: `next(mr)` добавлен, dedupKey в сигнатуре enqueue, supersede единый механизм (dedupKey); восстановление running-задач (→queued, эффекты по маркеру); retry→лесенка opencode; пул без вытеснения + aging; переходы waiting_dep/cancelled; FIFO внутри класса + priority override; Non-goals; приёмка supersede уточнена
- Rejected: 0
- Reconcile: dedupKey-правило → как в inbox-api (type + canonical(params))
- Changes: §2 порты/сущности; §3 реестр полный (16 типов) + грамматика; §4.1 правила; §6 приёмка; §7 Non-goals

## Handoff Rules Additions

- [typescript-rules](../../../ai/directives/coding/typescript-rules.xml) — impl-фазы (\*.ts)
- [node-test](../../../ai/directives/testing/node-test.xml) (+ testing-common) — test-фазы
