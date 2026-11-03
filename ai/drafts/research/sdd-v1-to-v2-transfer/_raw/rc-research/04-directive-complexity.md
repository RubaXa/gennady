# Критика SDD v2 authoring-flow (worktree `sdd-v2-rc52-followup`, текущее состояние с незакоммиченными правками)

## 1. Измерения authoring-пути vs execute

Собранные директивы (`ai/directives/sdd-v2/`, ~3.7 байт/токен для смеси RU/EN):

| Файл | Строк | Байт | ≈Токенов | STEP_* | Аксиом | Ленивых READ_AND_USE | STOP |
|---|---|---|---|---|---|---|---|
| `scope.directive.xml` | 735 | 55 386 | ~15 000 | 11 (0,1,2,3,4,4B,5,6,7,8,9) | 27 | 5 | 3 |
| `module.directive.xml` | 870 | 69 876 | ~19 000 | 8 + ScalePath | 39 | 11 | 6 |
| `router.directive.xml` (вход) | 405 | 32 810 | ~9 000 | — | 14 | — | — |
| `interview-protocol.directive.xml` | 447 | 32 821 | ~9 000 | — | — | — | — |
| **execute.directive.xml** | **269** | **19 010** | **~5 000** | **8** | **7** | **0** | 0 |
| `phase-execution-protocol.directive.xml` | 25 | 4 008 | ~1 100 | (шаги в подкаталоге) | — | — | — |

**Обязательные чтения до первого байта артефакта** (greenfield product, полный путь): router (33KB) → scope (55KB) → условно interview-protocol (33KB) → выход `sdd-orient` → при STEP_9 ещё `product-spec-structure.xml` (154 стр.) + `preflight-protocol` + `review-lifecycle` (168 стр.) + `diagram-vocabulary.xml` (247 стр.). Итого **~90–150KB (25–40k токенов) и 9 шагов протокола до первой записи спеки** (первый write — placeholder-строка портала на STEP_4B, первый содержательный — STEP_9, шаг 10 из 11). Модульная фаза добавляет ещё 70KB директивы + до 11 ленивых форматов (dbc-contracts 186 стр., module-spec-structure 174 стр. и др.).

**Execute для сравнения**: 19KB директивы, 0 ленивых форматов — весь контекст выдаёт `sdd-task <ticket> --phase <ID>` (канонический phaseContext), verify — receipt от `sdd-verify`, закрытие — атомарный `sdd-log complete`. Соотношение объёма «прочитай прежде чем действовать»: **authoring ≈ 6.5–8× execute**.

## 2. Скелеты (`shared/sdd/templates.ts`, 2054 строки)

`gennady sdd-new <kind>` уже генерирует скелеты со встроенными инструкциями: каждая `<!--SECTION:*-->` содержит bracket-инструкцию «что и как заполнять», worked example (mermaid-заготовка, пример REQ-записи с «нештатной», готовые `<details>`-фолды), а после создания печатается section manifest (name / REQUIRED / fill) + nextSteps. Скелеты **уже ~70% самодокументированы**.

Незакоммиченный diff движется ровно в гипотезу оператора:
- добавлена секция `MODULE_MAP` в product/library-скелеты с placeholder-инструкцией;
- правило «module Requirements не копируют scope-IDs» перенесено из директивы **внутрь** `MODULE_SKELETON`;
- уточнён fill `PUBLIC_API_SURFACE`;
- параллельно `scope.directive.hbs` худеет: rule registry отложен до STEP_7, interview-protocol стал условным, research-gate ослаблен для `function`.

## 3. Оценка диагноза и гипотезы

**Диагноз «монолитный directive-owner» подтверждается структурно**, но неполон. Два отягчающих фактора:

1. **Диалоговый протокол вшит в owner.** Значительная доля scope/module-текста — не «что произвести», а «как разговаривать с оператором»: Approval Check + STOP (3 и 6 раз), ASCII-диаграммы в чате ДО записи (`AX_CHAT_BEFORE_SPEC`), `H_ASK_BEFORE_FORMAT`, breadcrumbs, side-dive-format, стек вложенных фреймов (`AX_STACK_BASED_FLOW`). В ночном eval оператора нет — дешёвая модель тратит контекст на симуляцию церемонии.
2. **Отсутствует механический цикл execute-типа.** Execute проходит не потому, что директива короткая, а потому что цикл «CLI выдал контекст → сделал → CLI выдал receipt → CLI атомарно закрыл» не требует держать протокол в голове. В authoring: контекст — 150KB прозы, receipt — «семантическое ревью + Approval #1» (тоже LLM), закрытие — нигде не фиксируется.

**Гипотеза «инструкции в шаблон» подтверждается**: почти всё содержимое `AX_SPEC_MANDATORY_DIAGRAM` (38 строк в scope, 47 в module), формата требований, фолдинга, Decision Log и Bootstrap-таблицы уже существует внутри скелетов и/или проверяется `sdd-check`. Директива может деградировать до маршрута.

**Где нет механического гейта и каким он мог бы быть.** `sdd-check` уже умеет 80+ кодов, включая спековые (`SDD_SPEC_SECTION_MISSING`, `SDD_NO_DIAGRAM_BLOCK`, `SDD_DIAGRAM_CAPTION_MISSING`, `SDD_REQ_MISSING_UNHAPPY`, `SDD_REQ_ID_GRAMMAR`, `SDD_SECTION_NOT_FOLDED`, `SDD_SCOPE_NO_DATA_FLOW`, `SDD_MODULE_NO_CALL_CHAIN`) — но:
- для тикетов есть режим `sdd-check --task --authoring`, а **для спек authoring-режима нет**: nextSteps спек-скелетов говорят «Заполни… Согласуй…» без команды проверки;
- `sdd-check --all specs/<scope>` на границе scope→module **запрещён самой директивой** (Module Map указывает на ещё не существующие файлы);
- нет аналога receipt/атомарного закрытия: прогресс заполнения живёт только в чате.

Гейт напрашивается: `sdd-check --spec <path> --authoring` (required-секции заполнены, placeholder-скан по SECTION-якорям, диаграммы/капшены/REQ-грамматика; терпимый к пустому Module Map на драфте) + `sdd-new`-манифест как «список фаз». Это ровно тот замкнутый цикл, который сделал execute проходимым.

## 4. Явный перегруз (конкретика)

**Дублирование одного и того же в 3–4 местах:**
- Диаграммная лестница: `AX_SPEC_MANDATORY_DIAGRAM` в scope И module (по ~40 строк) + fills скелетов + `formats/diagram-vocabulary.xml` (247 стр.) + машинные коды `sdd-check`. Четыре копии.
- Формат требований: `requirement-entry-format.xml` (107 стр.) + worked example прямо в скелете + fill-тексты + `SDD_REQ_*`-коды.
- Правило module-Requirements: после ночного diff — в скелете, в STEP_6 module-директивы И в ScalePath. Три копии; две можно стереть.
- Фолдинг/Decision Log/Bootstrap: скелет уже содержит готовые `<details>` и заголовки таблиц; директива держит ещё и прозу.
- Дисклеймер «спеки до появления rung не сломаны ретроактивно» повторён 3 раза в двух директивах.

**Аксиомы, которые вряд ли активируются в типовом greenfield-прогоне, но читаются всегда:** весь pivot/rewrite-аппарат (supersession, Pivot Invalidation List, Delta rung, `H_REWRITE_WITH_DOWNSTREAM`), `AX_STACK_BASED_FLOW`, breadcrumb/side-dive/сервисная строка с эмодзи, `AX_RESEARCH_PERSISTED` на scale=function, портальный placeholder-ритуал, историческое обоснование research-решения 2026-08-20 (повторено ≥4 раз).

**Стейт в голове агента:** mode (4) × scale (4) × scope-type × confidence × карта покрытия интервью × флаг «диаграмма уже показана в чате» на каждый rung × порядок «формат прочитан до Ask» × «placeholder уже добавлен на STEP_4B» × «sdd-check здесь запрещён/обязателен». В execute весь эквивалентный стейт лежит в тикете и receipt'ах.

## 5. Вердикт

**Направление ночных правок — правильный вектор для V2 в целом, но в текущем объёме это локальный фикс.** Перенос инструкций в скелеты и условная загрузка interview-protocol снижают time-to-first-write, но не устраняют главное отличие authoring от проходящих фаз: отсутствие замкнутого механического цикла CLI-контекст → заполнение → CLI-receipt.

**Минимальный короткий путь authoring (~5 минут для дешёвой модели):**
1. **Первая команда — `sdd-new`**: `sdd-new product|library --scope <s>` на STEP_1, а не STEP_9. Скелет + манифест = рабочий план; директива сокращается до маршрута «создай → заполняй по манифесту → проверяй».
2. **`sdd-check --spec --authoring`** (draft-режим, терпимый к пустому Module Map): placeholder-скан + required-секции + существующие диаграммные/REQ-коды. Итерация «заполнил секцию → прогнал → чинишь по кодам» вместо удержания 27 аксиом.
3. **Вырезать из директив всё, что скелет/чекер уже держит** (~35–40% объёма scope+module).
4. **Вынести диалоговый протокол в отдельный interactive-профиль**: Approval/STOP/ASCII-в-чате/breadcrumbs — только при живом операторе; автономный прогон идёт skeleton→check→review без церемонии.
5. **`sdd-orient` — единственное обязательное чтение чужого контекста**; rule registry, research-gate и interview-protocol — только по триггеру от scale/брифа.
6. **Атомарное закрытие authoring-раунда** (аналог `sdd-log`): одна CLI-команда фиксирует «scope draft complete / module draft complete».
7. Объединить scope+module для scale=function в один проход с одним манифестом.

Ключевые файлы: `ai/kit/templates/sdd-v2/{scope,module,execute}.directive.hbs`, `ai/directives/sdd-v2/*.xml`, `shared/sdd/templates.ts`, `shared/sdd/check.ts`, `cli/cmd/sdd-new/`.
