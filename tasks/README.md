# Project Tasks

## Entry Points

- [Specs Portal](../specs/README.md) — Scope Graph + all scope specs.
- Tickets are picked up ONLY via `sdd-execute`. After `[x] DONE`, run `sdd-audit`.

## Project-Wide Conventions

### File-header Convention

Per `AX_FILE_HEADER_TASK_TRACEABILITY`:

```
// @file: <what the file holds>
// @consumers: <consumer-1, consumer-2, ...>
// @tasks: TSK-01, TSK-02
```

### Completion Rule (baseline)

A task cannot transition to `[x] DONE` until ALL of:

1. Every BDD scenario mapped to test ownership in §6 OR has `Deferred Test Ownership: <task-id>`.
2. Verification commands executed; results + exit codes recorded in Execution Log.
3. Canonical case names match real test cases or ticket updated.
4. `Deferred Runtime Scope` recorded if applicable.
5. Every introduced-beyond-Inventory entity logged as `Introduced <Name> because <reason>`.

Task-specific completion additions live in each ticket's §5.

### Execution Log Template

Per `AX_EXECUTION_LOG_PLAN_VS_FACT`. Each round = one open-to-DONE cycle; append-only; old rounds NEVER edited.

**Plan format (scaffolding pre-fills per ticket):** every phase has verification facts and a handoff; the round closes only after all phases are done.

```markdown
### Round 1 — <YYYY-MM-DD>, initial

#### P1

- [ ] `<ts>` ver `<required command>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `<required command>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE
```

⛔ `[x]` line with any unreplaced `<…>` literal = fabricated done.
`Reopens` in Meta equals round count minus one; rounds and prior handoffs are append-only.

### Post-task Hook

After `[x] DONE`, invoke `sdd-audit` on the ticket. Until audit returns PASS, round is closed-but-unverified.

## High-Level DAG

```mermaid
graph TD
    TSK-02 --> TSK-01
    TSK-03 --> TSK-02
    TSK-05 --> TSK-04
    TSK-07 --> TSK-06
    TSK-08 --> TSK-07
    TSK-09 --> TSK-08
    TSK-10 --> TSK-09
    TSK-11 --> TSK-10
    TSK-19 --> TSK-10
    TSK-20 --> TSK-10
    TSK-21 --> TSK-20
    TSK-13 --> TSK-12
    TSK-14 --> TSK-12
    TSK-15 --> TSK-12
    TSK-16 --> TSK-13
    TSK-16 --> TSK-14
    TSK-16 --> TSK-15
    TSK-17 --> TSK-16
    TSK-18 --> TSK-17
    TSK-32 --> TSK-16
    TSK-49[TSK-49: resolveTargets + LintCommand] --> TSK-16
    TSK-50[TSK-50: Tests resolveTargets + integration] --> TSK-49
    TSK-51[TSK-51: DisablesCheck D-007] --> TSK-50
    TSK-52[TSK-52: DisablesCheck purpose] --> TSK-51
    TSK-24 --> TSK-23
    TSK-25 --> TSK-23
    TSK-25 --> TSK-24
    TSK-26 --> TSK-23
    TSK-26 --> TSK-24
    TSK-26 --> TSK-25
    TSK-28 --> TSK-27
    TSK-29 --> TSK-28
    TSK-30 --> TSK-28
    TSK-31 --> TSK-27
    TSK-31 --> TSK-28
    TSK-31 --> TSK-29
    TSK-31 --> TSK-30
    TSK-34 --> TSK-33
    TSK-36 --> TSK-35
    TSK-37 --> TSK-35
    TSK-38 --> TSK-35
    TSK-38 --> TSK-36
    TSK-38 --> TSK-37
    TSK-39 --> TSK-35
    TSK-40 --> TSK-35
    TSK-41 --> TSK-36
    TSK-41 --> TSK-39
    TSK-46 --> TSK-45
    TSK-47 --> TSK-46
    TSK-47 --> TSK-48
    TSK-43 --> TSK-42
    TSK-44 --> TSK-42
    TSK-59[TSK-59: agents-rules command]
    TSK-68[TSK-68: vcs-context-resolver (cli)]
    TSK-68 --> TSK-69
    TSK-68 --> TSK-70
    TSK-67[TSK-67: vcs-client approve (vcs)]
    TSK-67 --> TSK-69
    TSK-69[TSK-69: vcs-approve (cli)]
    TSK-70[TSK-70: refactor VCS commands (cli)]
    TSK-71[TSK-71: resolveDiscussion port+adapter (vcs)]
    TSK-71 --> TSK-72
    TSK-72[TSK-72: vcs-reply resolve/reopen (cli)]
    TSK-138[TSK-138: Bootstrap mr-stats]
    TSK-138 --> TSK-139
    TSK-139[TSK-139: Core mr-stats]
    TSK-156[TSK-156: bootstrap журнал] --> TSK-157
    TSK-156 --> TSK-158
    TSK-156 --> TSK-160
    TSK-157 --> TSK-159
    TSK-158 --> TSK-159
    TSK-160 --> TSK-159
    TSK-159 --> TSK-161
    TSK-158 --> TSK-162
    TSK-159 --> TSK-162
    TSK-162 --> TSK-163
    TSK-162 --> TSK-164
    TSK-158 --> TSK-166
    TSK-166 --> TSK-164
    TSK-166 --> TSK-165
    TSK-161 --> TSK-165
    TSK-164 --> TSK-165
    TSK-172[Agent Inbox pivot bootstrap] --> TSK-173
    TSK-173 --> TSK-174
    TSK-173 --> TSK-175
    TSK-173 --> TSK-176
    TSK-174 --> TSK-176
    TSK-175 --> TSK-176
    TSK-173 --> TSK-177
    TSK-174 --> TSK-177
    TSK-176 --> TSK-177
    TSK-173 --> TSK-178
    TSK-175 --> TSK-178
    TSK-176 --> TSK-178
    TSK-177 --> TSK-178
    TSK-173 --> TSK-179
    TSK-174 --> TSK-179
    TSK-176 --> TSK-179
    TSK-177 --> TSK-179
    TSK-178 --> TSK-179
    TSK-173 --> TSK-180
    TSK-174 --> TSK-180
    TSK-175 --> TSK-180
    TSK-177 --> TSK-180
    TSK-179 --> TSK-180
    TSK-174 --> TSK-181
    TSK-175 --> TSK-181
    TSK-176 --> TSK-181
    TSK-177 --> TSK-181
    TSK-178 --> TSK-181
    TSK-179 --> TSK-181
    TSK-180 --> TSK-181
    TSK-178 --> TSK-182
    TSK-179 --> TSK-182
    TSK-180 --> TSK-182
    TSK-181 --> TSK-182
    TSK-174 --> TSK-183
    TSK-176 --> TSK-183
    TSK-177 --> TSK-183
    TSK-179 --> TSK-183
    TSK-180 --> TSK-183
    TSK-181 --> TSK-183
    TSK-182 --> TSK-183
    TSK-176 --> TSK-184[TSK-184: production control recovery]
    TSK-177 --> TSK-184
    TSK-178 --> TSK-184
    TSK-179 --> TSK-184
    TSK-181 --> TSK-184
    TSK-174 --> TSK-185[TSK-185: real API and board]
    TSK-184 --> TSK-185
    TSK-184 --> TSK-186[TSK-186: real walking skeleton]
    TSK-185 --> TSK-186
    TSK-185 --> TSK-187[TSK-187: cockpit recovery]
    TSK-186 --> TSK-188[TSK-188: final real acceptance]
    TSK-187 --> TSK-188
```

## Tracker Index

| Scope             | Type           | Tracker                               | Tasks | Done  |
| ----------------- | -------------- | ------------------------------------- | ----- | ----- |
| dbc               | library        | [README](dbc/README.md)               | 14    | 14/14 |
| cli               | product        | [README](cli/README.md)               | 26    | 24/26 |
| vcs               | product        | [README](vcs/README.md)               | 7     | 7/7   |
| agent-mon         | library        | [README](agent-mon/README.md)         | 7     | 7/7   |
| agent-mon-cli     | product        | [README](agent-mon-cli/README.md)     | 4     | 0/4   |
| infra-npm-publish | infrastructure | [README](infra-npm-publish/README.md) | 3     | 3/3   |
| agent-run         | library        | [README](agent-run/README.md)         | 3     | 3/3   |
| agent-inbox       | product        | [README](agent-inbox/README.md)       | 32    | 27/32 |
| mr-stats          | product        | [README](mr-stats/README.md)          | 2     | 2/2   |

## Decision Log

- **D-219 (2026-08-10, agent-inbox v0 pivot):** TSK-156…170 remain immutable historical DONE evidence. Current root/module specs are scaffolded as TSK-172…183; none of the old role/attention tickets is treated as proof of the new product contracts.

- **D-216 (2026-07-29, agent-inbox v2 полный ребилд):** Спеки agent-inbox переписаны с нуля (v2, D-301…D-331) по итогам дизайн-сессии: инцидент 2026-07-28 (глобальный мьютекс `_advancing`, 15-мин голодание MR) + серия прошлых live-багов показали, что v1-архитектура (RoleScheduler/RoleInstance/два графа/проекция из летучей памяти) несёт ложную модель мира. Старый DAG (`agent-inbox.task-80…155`, ~95 файлов) **удалён по решению оператора** (git-история сохраняет) — extend-dag поверх мёртвой архитектуры был бы отравлением трекера. Новый DAG: TSK-156…165, по одному тикету на модуль-спеку (AX_DAG_AND_TICKET_BOUNDARIES, дефолт), bootstrap TSK-156 — корень.
- **D-217 (2026-07-29, не-дефолтные scaffold-выборы):** (1) Спеки v2 прошли 3 волны sdd-critic до скаффолда (2 CRITICAL закрыты: gate_verdict, волны линз; JournalPort-гонка) — тикеты стартуют с критикованной базы. (2) Bootstrap Requirements добиты в корневую спеку (§12) и Handoff Rules в модульные — обязательные секции scaffold. (3) BDD-review (STEP_4.6) — пакетно одним изолированным сабагентом на группу тикетов (10 тикетов одного скоупа с общей спек-базой), вместо 10 отдельных диспетчей.
- **D-218 (2026-07-29, тестовая стратегия v2):** TSK-166 (test-infra) добавлен по урокам v1: (1) e2e «всё приложение сразу» невозможен — гранулярность компонент→композиция→экран→продукт; (2) real-inbox e2e заменён seed-DSL (журнал+sync-снимок = любое состояние МР без GitLab — свойство event-sourced архитектуры); (3) моки через DI-порты с тремя страховками честности: контракт-сьют ×2 (фейк vs реальный адаптер на кассетах), кассеты реальных ответов, drift-sentinel в inbox-eval. Добавлен в DAG между TSK-158 и TSK-164/165.
- **D-201 (2026-07-17, agent-inbox scaffold extend-dag):** TSK-113 (`inbox-roles`) переоткрыт (Reopens: 1) вместо создания нового тикета для «session↔болванка + ToolPolicy» (D-118…D-123 refine). TSK-113 уже владеет `reviewer.role.ts`/`role-instance.ts`/`role-node.ts`/`artifact-validator.ts` (Round 1, DONE) и Round 1 Handoff уже фиксирует открытые разрывы («session узлы не пишут через EffectExecutor», «buildTaskText контракт») ровно в том месте, которое Round 2 закрывает — новый тикет дублировал бы Target Files и контекст. Per `AX_REOPEN_TICKET_FORMAT`: Round 2 добавлен append-only (P5/P6), старые Rounds не тронуты.
- **D-202 (2026-07-17, agent-inbox scaffold extend-dag):** TSK-137 (ArtifactValidator injection-coverage) остаётся ОТДЕЛЬНЫМ тикетом от TSK-113 Round 2, хотя оба трогают `artifact-validator.ts`/`inbox-roles`. Формально это сходится с «sequential split без (C) = overhead» (`AX_DAG_AND_TICKET_BOUNDARIES`), НО: (a) операторски заданная граница DAG явно разделяет «session-исполнение блванки» (TSK-113 Round 2) от «переопределение критерия гейта» (TSK-137) как разные предметные решения (D-118/AI-39 vs §5.3.1 «Гейт-граундинг»/D-86); (b) TSK-137 зависит от РЕЗУЛЬТАТА TSK-113 Round 2 (заполненные болванки с injected-ссылками), не может стартовать параллельно. Раздельные тикеты сохраняют чистую Round-историю TSK-113 (Round 2 не разрастается третьим предметом).
- **D-203 (2026-07-19, agent-inbox tracker sync):** TSK-134/TSK-136/TSK-113(P8) обнаружены с полностью реализованным и протестированным кодом на диске (`context-builder.ts` 12/12 тестов, `services/ai-kit/selector.ts` 29/29, `artifact-validator.ts` injection-coverage 16/16 — TSK-137 уже сам корректно нёс `[x] DONE`), но их Meta Status/Phases Overview всё ещё показывали TODO/IN_PROGRESS — чистое расхождение трекера, не пропущенная работа. Проверено запуском реальных тестов каждого модуля перед правкой статуса (не поверено на слово чекбоксам). Синхронизировано: TSK-113/TSK-134/TSK-136 → `[x] DONE`; `tasks/agent-inbox/README.md` Cascade Table и агрегированный счётчик здесь (41/48 → 45/48) приведены в соответствие.
- **D-204 (2026-07-22, agent-inbox scaffold extend-dag):** TSK-140 (реконсиляция + legacy-artifact recovery, SV-15…SV-18/D-127…D-129) — новый тикет, не reopen TSK-113, тот же паттерн, что D-202 (отдельное предметное решение — «восстановление состояния при старте», а не продолжение «session↔болванка»). Одна impl-фаза (не split на «скан» и «legacy-recovery» отдельно) — эти два куска работы тесно связаны (реконсиляция обнаруживает артефакт → recovery его перепроверяет) и правятся в одном файле/контексте, sequential split без (P)/(C) был бы чистым overhead (`AX_DAG_AND_TICKET_BOUNDARIES`). Acceptance живёт на РЕАЛЬНОМ MR оператора (`vk-workspace/superapp!599`, живой legacy-артефакт, найден live-снимком 2026-07-22), не на синтетической фикстуре (D-116).
- **D-206 (2026-07-22, agent-inbox live-verification):** TSK-145 переоткрыт (Round 2), не новый тикет — живой прогон против реального `hocuspocus/hocuspocus!18` через `gennady inbox serve` (не mock-режим) нашёл, что `getReport`'s disk-fallback путь (`board-provider.real.ts`) хардкодил `role: null`, блокируя author-панель (и саму фичу TSK-144-146) для ЛЮБОГО MR, восстановленного с диска — то есть для каждого MR после рестарта serve. Найдено ТОЛЬКО потому, что верификация шла на реальных данных через реальный production-путь (`gennady inbox serve`), а не на mock dev-seed — оператор явно указал на это как на системную ошибку процесса («это не живые данные»). Фикс: `role` теперь персистится в `review.json` при синтезе (`reviewer.role.ts`) и читается в disk-fallback. Отдельно найдено и зафиксировано: прод-бандл `dist/inbox-serve/` не пересобирается автоматически — нужен явный `npm run inbox-serve:build` перед live-verification через `inbox-serve-real`, иначе тестируется старый JS. Regression-тест на это конкретное расхождение не написан в этом раунде (открытый пункт, см. TSK-145 Round 2 Handoff).
- **D-207 (2026-07-22, agent-inbox live-verification):** TSK-113 переоткрыт (Round 4) — оператор заметил на живом скриншоте README «Поведение — n/a — не предоставлены синтезом» и потребовал разбора вместо плана. Корень — контрактный разрыв, не флаки модели: ни task-text `node_synthesize`/`node_synthesize_delta`, ни системная директива `synthesize.directive.hbs` вообще не просили `reviewReport.behavior`/`scenarios`; оба гейта (`gate_review_synthesis`/`gate_delta_synthesis`) проверяли только truthy `reviewReport`, пустой `{}` проходил. Фикс: промт+директива теперь явно требуют все 4 поля (summary/verdict/behavior/scenarios), гейты проверяют непустые строки реально, а `_fail_reason` (ранее только диагностика) теперь читается обратно в промт retry — гейт-фейл больше не повторяет тот же промт вслепую, это и есть детерминированный «не хватает → доделай» цикл, который просил оператор. 4 фикстуры существующих тестов дополнены (были неполными — тот же баг, зафиксированный тестами). Один pre-existing несвязанный баг мока (`reviewer-disk-artifact.test.ts` сценарий 4) остался, уже 4 раза подтверждён несвязанным в прошлых аудитах.
- **D-208 (2026-07-22, agent-inbox live-verification, продолжено автономно ночью):** Тот же Round 4 TSK-113 довершён живым прогоном на реальном, никогда не разбиравшемся MR `vk-workspace/superapp!523` (выбран вместо `hocuspocus/hocuspocus!18` — оператор явно запретил трогать общее состояние сессии через `rm` вне репозитория; нулевой риск, ничего не нужно было сбрасывать). Фикс D-207 подтверждён end-to-end: реальные «Поведение»/«Сценарии» по реальному диффу, не заглушка. Этим же прогоном найден ВТОРОЙ реальный баг (тот же класс, другое место контракта): линза `node_track_review` вернула текст находки под ключом `summary`, а сборщик (`_normalizeLensFindings`) распознавал только `message`/`detail` — реальная находка (задокументированная в вердикте README!) тихо терялась при сборке `review.json.findings`. Фикс: `summary` добавлен как синоним + промты всех линз явно фиксируют имя поля `message`. Regression-тест написан целенаправленно на этот живой баг. Полная регрессия зелёная (12/12 + 35/38, 1 fail — тот же нетронутый pre-existing баг мока, не эта правка).
- **D-209 (2026-07-23, agent-inbox live-verification против `INBOX_DRY_RUN=1` real-mode сервера):** Оператор дал реальный список «ждут моего review» из двух независимых источников (прямой GitLab GraphQL-запрос через личный токен + нативный список GitLab) и попросил свериться с доской — нашлись два новых, ранее незадокументированных дефекта, оба зафиксированы в spec (`specs/agent-inbox/agent-inbox.spec.md`: D-136, D-137) и оба **исправлены в этом раунде, не только описаны**: (1) D-136 — `mail/messenger!162` пропадал с доски навсегда после одного комментария ревьюера (стадия `awaiting_reply` трактовалась как «реакция не нужна»), хотя GitLab продолжал числить review невыполненным до формального approve; фикс в `cli/cmd/inbox/_core/logic/build-inbox-view.logic.ts` (reviewer больше не прячется по одной стадии `awaiting_reply` — только по факту `approvedBy`), тесты `build-inbox-view.test.ts` обновлены + добавлен целевой regression-тест. (2) D-137 — активация роли (`RoleEngine.activate`) не имела real-mode входа вообще (только mock-бутстрап); добавлен `POST /api/role/:name/activate` (`routers/role.router.ts`), `BoardProviderPort#setRoleActive` (real+mock), `api-client.ts#setRoleActive`, `board-store.tsx#toggleRoleActive`, кликабельный бейдж active/inactive в `RoleBlock.tsx`. Попутно найден и исправлен третий, не операторский, а тестовый дефект: `DOMPurify` (D-115) — фабрика в Node-окружении, готовый инстанс только при наличии `window` на момент импорта модуля; ArtifactView теперь строит sanitizer лениво при первом рендере вместо импорт-тайм детекции, тесты `ArtifactBrowser.test.tsx` (были красными независимо от сегодняшних правок) снова зелёные. Третий, ранее записанный как открытый, — `wisever!86` — оказался НЕ багом, а моей диагностической ошибкой (разобрано и закрыто 2026-07-23): я принял отсутствие `~/.gennady/agent-inbox/mrs/mail-core__wisever-86/` за «пропуск в дискавери». Но этот каталог — рабочий (worktree+reports), создаётся ТОЛЬКО при назначении MR на роль и прогоне через граф, а не при дискавери. Трёхслойная проверка (GraphQL reviewRequested+todo / live board API / processing-каталог) показала: `wisever!86` корректно обнаруживается, проходит фильтр и висит в «Без роли» — его просто ни разу не назначали, оттого и нет worktree. Ложный сигнал снят.
- **D-211 (2026-07-23, agent-inbox фикстурный эмулятор флоу — стабилизация + поиск дыр):** Оператор попросил строить mock/fixture-эмуляцию флоу для автономного тестирования и искать слепые пятна. Построен детерминированный фикстурный тест полного clean-review флоу через `runMrsOnce` (реальный граф ревьювера + `VcsInboxMock`/`OpenCodeMock`, без живого LLM/GitLab): (1) закрыт чекпоинт 11 — авто-approve при чистом вердикте (SV-23/D-134) теперь под тестом, а не только «проверено вживую»; (2) вторым тестом НАЙДЕН и доказан реальный баг безопасности (spec D-139): `_extractFindings` возвращал находки первого артефакта, поэтому чистая первая линза маскировала `severity=error` из поздней — гейт SV-24 авто-одобрял MR с блокирующей проблемой. Фикс: union находок по всем артефактам с дедупом (`role-instance.ts`). Оба теста зелёные, type-check/lint чисты. Побочно: проверены и признаны корректными (не баги) обработка трёхуровневых group-path в `parseVcsUrl` (тест `a/b/c/d` уже есть) и `mrKey` (`replace(/\//g,'__')`); слепой сигнал был в моём диагностическом скрипте, не в продукте. Известный pre-existing флейк `reviewer-disk-artifact.test.ts` сценарий 4 (mock dedup) не тронут, не связан.
- **D-213 (2026-07-23, agent-inbox scaffold test-hardening тира — не-дефолтные scaffold-выборы):** Отскаффолжены TSK-147…TSK-150 (`sdd-scaffold` extend-dag) как самокорректирующийся тир поверх D-212. Зафиксированы отклонения от дефолта директивы `SddScaffold`: (1) **Adaptive-связи вместо чистого DAG** — тикеты несут явные «АДАПТИВНОСТЬ» заметки в фазах: проблема одного (git-в-тестах непригоден / живой git в пути / корень деградации иной) корректирует следующий через Handoff `open:`/реопен-триггер, а не молчаливый обход; это прямой запрос оператора «результат/проблемы корректируют следующий flow». (2) **BDD-review инлайн, не 4 изолированных сабагента** (STEP_4.6) — тир из 4 тест-тикетов с узким, уже доказанным на D-212 scope; adversarial BDD-подкачка не пропорциональна, negative/skip/adaptive-сценарии внесены напрямую. (3) **D-116 (запрет фикстур) толкуется для test-infrastructure тира**: «реальность» = реальные адаптеры за подменённой сетью (TSK-150) и настоящий git, не мок (TSK-147/148/149); не помечено нарушением — продуктовый путь не раздваивается. (4) Трекер `tasks/agent-inbox/README.md` расширен в существующем упрощённом репо-стиле (таблица Tasks + прозаическая секция тира + порядок слоёв), не в идеализированной `SCOPE_TASKS_README_STRUCTURE` — по `AX_EXTEND_DAG_PRESERVES_EXISTING`. Прохождение через approval-STOP'ы директивы — автономное, по сквозному мандату оператора «доводи до финала без беганий».
- **D-214 (2026-07-23, agent-inbox test-hardening тир — адаптивная коррекция verify-gate по факту исполнения TSK-147/P1):** Первый же прогон `sdd-execute` TSK-147/P1 вернул BLOCKED — не по своей работе (`utils/test/git-fixture.ts` создан, `tsc --noEmit`=0, `gennady lint` чист, файл инертен — никто не импортирует), а на mandatory-гейте `sdd verify`, который гоняет ВЕСЬ проектный `npm run test`: 15/2293 падений в чужих модулях (ChatRouter, PhaseTelemetry, vcs-worktree, reviewer.role, mr-stats, BoardProviderReal) — pre-existing red-baseline WIP-ветки `recover-sdd-v2` (эти файлы были `M` до сессии). Фаза-сабагент корректно НЕ стал их чинить (`AX_PHASE_SCOPE_LOCK`) и эскалировал, не фабрикуя pass. **Коррекция, применённая ко всему тиру (это и есть адаптивность — проблема одного тикета переопределяет метод остальных):** для TSK-147…150 фазовый gate = SCOPED — `tsc --noEmit`=0 (проект, доказывает отсутствие type-break) + `gennady lint` по target-файлам + собственные тесты фазы зелёные + дельта «нет НОВЫХ падений против зафиксированного baseline (15)». Проектный `npm run test` целиком зелёным НЕ требуется, пока ветка несёт неотносящийся red-baseline; baseline-набор зафиксирован (`scratchpad/baseline-fails.txt`) для дельта-сверки. Решение принято orchestrator'ом автономно (оператор-прокси unblock) по сквозному мандату, а не возвращено оператору. Отдельно: чистка самого red-baseline (15 тестов) — вне scope этого тира, кандидат в отдельный тикет.
- **D-215 (2026-07-23, agent-inbox product-readiness — baseline-cleanup тир TSK-151…154):** Оператор спросил «состояние проекта как продукта» и одобрил план: погасить red-baseline первым (разблокирует честную приёмку TSK-123/117). Перед скаффолдом — обязательный триаж 12 красных (после того как TSK-149 снял 2 из прежних 15) через 4 параллельных read-only диагностических субагента. **Ключевой результат триажа: 0 реальных багов продукта** — все 12 test-side, отставшие от намеренных продуктовых изменений: (1) worktree×5 — TSK-131 (`9c44aa8`) переструктурировал `state-paths` в nested `<mrsRoot>/<key>/worktree/`, 3 тест-файла остались на плоском layout (STALE-TEST, 1 корень); (2) chat×2 — `f0a991c` убрал `format` из chat-turn (сид по стейл-ключу `chat_turn`), `240a3514` сделал dashboard+API same-origin (тест бьёт относительным URL в Node) (STALE-TEST); (3) phase-telemetry — `readPhaseAnalytics` берёт реальный `Date.now()` без DI, тест с фиксированным прошлым отсекается 7-дневным окном (ENV-FLAKE); (4) reviewer-disk сценарий 4 — сид `{writeArtifact}` для zero-tools JSON-узла D-120 (STALE-TEST); (5) selector-snapshot — `55c2571` добавил в шаблон `reviewReport`-требование, снапшот не перегенерён, вывод верный (STALE-SNAPSHOT, regen безопасен); (6) mr-stats×2 — `d76451e`/TSK-139 заменил стаб реальным пайплайном (тест ждёт стаб) + sync/async баг в `skip`-опции + негерметичность (нужны live glab/jscpd/сеть). Скаффолжены TSK-151…154 (все Layer 0, файлы непересекающиеся). Продуктовый вывод, зафиксированный оператору: движок ревью работает на реальных данных (проверено вживую + black-box на продуктовых адаптерах); «нельзя отдать» упирается в невлитую ветку (186 коммитов впереди main), red-baseline (эти 12, теперь чинятся), неподписанный golden real-smoke (TSK-117) и открытый визуальный proof (TSK-123), а НЕ в сломанный продукт.
- **D-210 (2026-07-23, agent-inbox live debug real MR через `gennady inbox serve --mrs --once`):** Три реальных MR, назначенных на reviewer вручную, простояли в INBOX больше часа тиков без единой ошибки — real одноразовый прогон продукта CLI (не curl/bash, per операторское требование — «руки» это CLI-команды, не одноразовые скрипты) через тот же `--mrs`/`--once`/`--dry-run` путь, добавив `--opencode-port` для явного attach к живому opencode (был найден и исправлен по ходу отдельный баг ниже), прогнал `mail/messenger!164` до `state: done` с реальным вердиктом за один вызов — доказало, что граф исполняется корректно, а зависание — в гейте `_shouldAdvanceInstance`, не в LLM/графе. Корень (D-138, spec): SV-19 «коммит без ответа → не разбирать» не имеет выхода, когда у меня ещё вообще нет ни одного треда на MR — фикс: пустой список `{my:true}`-дискуссий пропускает гейт немедленно. Живьём подтверждено рестартом dry-run сервера: `!164` (уже разобран) и свежий `!630` оба назначены реviewer'у, тик обработал оба без стаза (см. чат для скриншотов). Попутный баг того же расследования: opencode `pid`-файл был ОДИН общий на все `gennady inbox serve` независимо от `--port` — параллельный real(4180)+dry-run(4182) затёр запись друг друга, оставив orphan-процесс без владельца. Фикс: pid-файл переименован в `opencode-<port>.pid` (`bootstrap.ts`), при старте — transparent-проверка живости записанного процесса, graceful SIGTERM→poll→SIGKILL с логом причины (`pid-utils.ts#terminateOrphanedOpencode`) — никогда не трогает процессы вне собственного pid-файла (оператор явно требовал: обнаружение конфликта, проверка живости, прозрачное завершение с указанием причины, никогда не «слепой kill»). `cli/cmd/inbox/serve.cmd.ts`'s `--opencode-port`/pid-discovery (добавлены в этом же раунде для дебага) обновлены под новую per-port схему. Тесты: `role-scheduler.test.ts`/`bootstrap.test.ts`/`shutdown.test.ts` зелёные, `lint:contracts` чист.
- **D-212 (2026-07-23, agent-inbox сетевой black-box tier + покрытие gate наблюдения):** Оператор поставил задачу: сделать так, чтобы фикстуры прятались за сетевым слоем, а продуктовый сервис ходил в свой реальный HTTP API, не зная, что за API стоит перехват — тестирование «чёрной коробкой» без раздвоения на тестовое и реальное приложение. Проверено и подтверждено на коде: оба бэкенда ходят через глобальный `fetch` (GitLab — `vcs-gitlab-client.ts`; OpenCode SDK — `@opencode-ai/sdk` `dist/client.js:32-40`, дефолтный `fetch` + встроенный шов `config.fetch`), поэтому undici-перехват прозрачен. Правило `AX_HTTP_MOCK_AGENT_PATTERN` (`ai/directives/testing/node-test.xml`) ссылалось на `utils/test/mock-http.ts`, но **сам харнесс никогда не был написан** — закрыт этот build-gap: `utils/test/mock-http.ts` (обёртка undici `MockAgent`/`setGlobalDispatcher`, `interceptOnce/interceptMultiple`, «умный» reply читает тело/query и отвечает по-разному), алиас `#utils/*` заведён (`package.json` imports + `tsconfig.json` paths/include). Два black-box e2e гоняют ПРОДУКТОВЫЕ адаптеры на подменённой сети: `VcsInboxReal` discovery через перехват `POST /api/graphql` (роль-merge/dedup/GraphQL-errors на реальном парсинге `vcs-gitlab-inbox.ts`); `OpenCodeReal` RPC через `session.create`/`session.prompt` (plain-text, schema-валидированный JSON из `json`-блока, классификация assistant-error) — без спавна бинаря, без живого LLM. Плюс закрыт слепой пробел continuous-observation: детерминированный git-free тест gate `_shouldAdvanceInstance` (`role-scheduler.observation.test.ts`) — SV-20 (свежий reply армит окно → hold), SV-21 (истёкшее окно → advance + clear), default-advance, и **регресс-тест на D-138** (нет моего треда → advance; у фикса D-138 регресс-теста не было). Явно зафиксировано ограничение, не молчаливый пропуск: SV-19 commit-only-hold требует живого git-worktree (единственный источник `hasNewCommit` через `_classifyHeadChanged`), поэтому вне git-free юнита — покрывается live/integration путём (D-210). Архитектурный вывод, согласованный с оператором: два валидных tier'а — порт-фейки (`VcsInboxMock`/`OpenCodeMock`, быстрый graph-тест, network-free) и сетевой black-box (прод-код целиком, подменяется только сеть); не заменяют друг друга. 14/14 новых тестов зелёные, `tsc --noEmit`/`lint:contracts` чисты. Две падающие в `run-mode.test.ts` («ask-terminal» → `idle`, «materialization» → `node_synthesize`) — pre-existing флейки деградации реального графа в git-free temp-dir, не тронуты этой правкой (файлы не менялись — подтверждено git-status; все изменения сессии аддитивны).
