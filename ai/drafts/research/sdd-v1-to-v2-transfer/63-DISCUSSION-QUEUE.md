# Очередь обсуждений с оператором (D-63)

> **Current UV-34:** fresh37/37 capture on reviewed source `c9d578c1` + independently checked local
> installed package ready for evidence review. No architecture question or per-PR operator «да».
> After reviewer merge, NEW exact scope-bound candidate ACK for #25 remains mandatory; native
> Swift is still UNVERIFIED/E18 DEFERRED and npm publication forbidden.

> **Earlier UV-34 causal corrective (historical):** stale live migration-map references after #119, not a new design
> choice. Correct only one deleted-helper row and two renamed parser paths; no weakening preflight,
> no frozen-history/baseline/currentProof changes. Independent reviewer before merge, then fresh
> immutable capture. Exact #25 ACK remains separate; no operator decision or npm publication inferred.

> **Earlier submission (historical):** UV-30..33 submitted for independent review in [#119](https://github.com/RubaXa/gennady/pull/119),
> plan #118. No new operator decision requested; UV-34 waits reviewed merges, not per-PR operator ACK.
> Exact corrected candidate ACK and npm-publication prohibition remain unchanged.

> **2026-10-13 corrective task уже разрешена оператором:** V1-only active behavior убрать,
> migration/grandfathering/A13 сохранить; UV-30..33 идут автономно с тестами и external review.
> Это не новый архитектурный checkpoint и не повод просить per-PR «да». Unexpected authority
> expansion/constraint weakening — stop/report; final exact #25 ACK остаётся отдельным.
> UV-34/fresh UV-25 ждёт LAST reviewed product merge. См. `64 §12.3.3`, `60 §2.3`.

> Правило D-63: сначала доводим все автономные волны, затем независимый аудит работы против плана и целей, затем обсуждаем эти темы — каждую с вариантами, плюсами и минусами. Сюда попадает всё, что по ходу пачек получило токен `pending-operator` или стоп «решение оператора». Порядок ниже — предварительный. Аудит 2026-09-10 §6.2 предлагает порядок по разблокировке: 4 (@spec/IDN) → 2 (реестр правил) → 1 (verify не-Node) → 5 → 10 → 3 → 8 → 6 → 7; темы 0 и 13 — в начало как короткие подтверждения.

> Current decision 2026-10-13 ниже принят оператором, не новый открытый вопрос и не exact candidate
> ACK. Старые исторические темы не пересматриваются этой bounded правкой. Runtime edits требуют
> отдельных reviewed release PR; npm publication по-прежнему запрещена.

| № | Тема простыми словами | Откуда | Что зависит от ответа | Статус |
|---|---|---|---|---|
| 14 | **Swift — UNVERIFIED prototype, real E18/UV-26 deferred post-main-cutover, не bar.** Scope waiver только release validation: selected Swift consumer gates остаются blocking, phase PASS не global verified. Strict future E18 tools не ослабляются | operator 2026-10-13; `64 §12.3.2`, `60 §2.2` | plan PR → UV-28 source-owned guard → UV-29 selected-step/mode diagnostics → NEW UV-25 after LAST reviewed product/currentProof change → independent candidate + exact scope-bound ACK → #25. Не instant eligibility от трёх PR | **РЕШЕНО оператором; implementation/recapture/review/ACK pending.** Missing optional E18 DEFERRED/no checker PASS; present invalid/unsafe proof INVALID/fail-closed; no project/YAML/env bypass, publication forbidden |
| 0 | **Подтверждение решений Lead, которые задевают цель или приёмку** (аудит §3.1): L-25 и L-27 (исключения из дословности переноса), L-23 (бюджеты монолитов — предупреждение), L-21 (Usage Waiver как постоянный механизм послаблений). L-24 в части детекта только при `stack.use` отменён оператором и замещён D-64: детект безусловный, config только сужает/приоритизирует реально обнаруженное. Остальные решения по-прежнему отменяемы. | AUDIT-WAVES-2026-09-10 §3.1, D-64 | тема 3; приёмка T-B6-10 | ждёт по оставшимся решениям |
| 12 | **Объём T-B6-13 (D-48, русский как язык спек):** «всё, что улучшает ясность» — не список; задача без границы приёмки. Нужен список источников v1 и критерий «сделано». | AUDIT §3.2, 62 §3.5 | A5/A8 частично | ждёт |
| 13 | **Правило завершённости эвала (R-COMPLETE):** принимало самозаверенные квитанции и предустановленную заглушку как «артефакт собран». Ужесточается в правках пачки 22; если после ужесточения живой прогон станет красным — это честный результат. Обсудить: что считается доказательством завершённости. | V-BATCH-22 B-3, AUDIT §7.3 | A10, A2, пачки 23–24 | правки идут; к разговору с фактами прогонов |
| 1 | **Единый Verify, presets, фазы и remote CI.** Переходное D-64 исполнено, затем архитектура пересмотрена целиком: один `gennady verify`, preset-DAG, phase slices, встроенный repair/selective recheck, per-phase readiness, scope-aware blocking всех затронутых стеков, exact-SHA remote watcher. | 30-TRACK-VERIFY, `64-VERIFY-RULES-UNIFICATION.md`, **D-65..D-69** | UV-01..17, UV-22..26 | **решено; реализация волнами U1..U8** |
| 2 | **Судьба реестра правил и `knowledge.xml`.** Central registry удаляется после эквивалентной миграции в colocated `*.rule.yaml`; общий `RuleResolver` собирает snapshot по phase/files/stack/framework/task/spec. | 33-TRACK-RULES.md, 33a/33b, `64-VERIFY-RULES-UNIFICATION.md`, **D-70** | UV-18..21, UV-24..25 | **решено; реализация волна U6** |
| 3 | **Разрезание четырёх монолитных директив** (`infra`, `root`, `migration-v1-v2`, `router`) — зона T-B6-10a, требует карты сущностей (D-55). | L-23, PR #41 | гейт бюджетов из warn → error | ждёт |
| 4 | **Оставшиеся частности @spec / идентификаторов (IDN)** после решений O-10..O-17. | 61-TASK-BOARD.md §IDN, 01 D-4x | миграционные задачи волны 4 | ждёт |
| 5 | **Порог предупреждений sdd-check.** Пачка 15 честно поднимает число предупреждений (431 → ~1034) новыми проверками по данным v1. Нужен ли порог/базовая линия по предупреждениям, как для ошибок (D-38)? | R-BATCH-15, V-BATCH-15 (в работе) | гейт pre-push, D-38, D-39 | вердикт V-15 получен: из 374 новых предупреждений 88 — честные нарушения словаря, 286 — таймстамп без обратных кавычек (получают отдельный код); порога нет вовсе |
| 6 | **Тесты харнеса эвала вне `npm test`** (GAP-E-7): включать в общий прогон или держать отдельным слоем? | 06-ADEQUACY-GAP.md, пачка 7 | топология тестов, время прогона | ждёт |
| 7 | **Релизность регресса синхронизации S2** (SO-8). | 32-TRACK-SYNC-OWNERSHIP.md | релиз 2.0.0 | ждёт |
| 8 | **Долговечный носитель счётчика раундов ревью** (в v1 — секция `## Critic Rounds`; в v2 счётчик противоречит правилу «поток без состояния»). | V-BATCH-20 N-3, PR #45 | review-lifecycle | ждёт |
| 10 | **Три тикета с реальным долгом Reopens** (`agent-inbox.task-162`, `agent-inbox.task-166`, `vcs-client.task-71`): чинить точечно или ждать самомиграции (E-14)? Плюс severity `SDD_REOPENS_MISMATCH`: очередь говорила «ошибка», исполнитель поставил warn по L-3 — нужен явный ОК. | V-BATCH-15 J | B2-15/B2-20 (флип warn → error) | ждёт |
| 11 | **Флейк тестов под нагрузкой (REL-15):** решено Lead как инфраструктурное — L-26 (слой `local` отдельной партицией на конкурентности 4). Оператор может отменить. | R-REL-15, V-BATCH-03 | REL-7, REL-13 | решено L-26, к сведению |
| 9 | **Python-стек** — после релиза (O-12 подтверждено), напоминание для порядка волн. | O-12 | — | решено, напоминание |

Закрытые здесь темы переносятся в `01-INTERVIEW-DECISIONS.md` как D-N.
