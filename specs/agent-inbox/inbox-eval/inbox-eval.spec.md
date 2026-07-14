<!--SECTION:SCOPE_TYPE-->

## scope-type

module (eval harness for the agent-inbox reviewer pipeline)

<!--/SECTION:SCOPE_TYPE-->

<!--SECTION:VISION-->

## 1. Vision & Primary Goal

Детерминированный, **воспроизводимый и проверяемый** эвал reviewer-пайплайна agent-inbox на
зафиксированном реальном MR. Прогоняет весь путь ревью по стадиям и проверяет каждый **гейт**
булевой ассерцией с уликой (evidence). Итог — машинный отчёт `eval-report.json` + человекочитаемый
`eval-report.md`; ненулевой exit при любом красном гейте. Каждый реальный слом из
`SESSION-REFLECTION.md` (base SHA, cleanup при re-scaffold, WAF на теле, line_code вне diff-hunk,
`|` в таблице, имена секций) закодирован явным гейтом и ловится ДО постинга.

**Что проверяет предметно:** что пайплайн проходит все стадии и все гейты на реальных данных —
то есть «машинерия» ревью работает и не даёт агенту пропустить шаг.

<!--/SECTION:VISION-->

<!--SECTION:NON_GOALS-->

## 2. Coverage & Non-Coverage (честно)

**Проверяется детерминированно (гейты ниже):** контекст MR и корректный base SHA; scaffold +
cleanup; валидация enriched/filled/README; coverage ledger; tool-call сверка; mermaid-валидность;
точные имена секций; экранирование `|`; для каждого предложенного линейного замечания — что строка
реально в diff-hunk; размер общего комментария < WAF-порога; дедуп/идемпотентность постинга.

**НЕ проверяется этим эвалом (и почему):**

- **Качество самого ревью** (релевантность/полнота находок) — недетерминировано, это отдельный
  слой LLM-эвалов (см. EV-09, отдельная задача); здесь проверяется только валидность артефактов.
- **Реальный постинг в GitLab** — намеренно **dry-run**: эвал НЕ пишет в !1296. Реальный постинг
  верифицируется отдельным эвалом на заведомо тестовом MR.
- **Serve-режим (граф ролей)** — этот эвал гоняет CLI-пайплайн (то, что работает сегодня);
  serve-вариант — расширение после замыкания конвейера (EV-10).
- **Контент fan-out сессий** — агентно и недетерминировано по тексту; проверяется только валидность
  их артефактов (filled-стадия), не формулировки.

<!--/SECTION:NON_GOALS-->

<!--SECTION:STAGES-->

## 3. Стадии пайплайна (каждая → PASS-проверка)

| ID  | Стадия            | Команда/действие                                   | PASS-проверка (детерминированная)                                            |
| --- | ----------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| S0  | clean-slate       | `rm -rf reports/<mr>/`                             | папка отчёта MR пуста перед прогоном                                         |
| S1  | preflight         | `inbox --json`                                     | exit=0, `configured:true`, целевой MR присутствует                           |
| S2  | context           | `inbox-context --url <mr>`                         | exit=0, `worktree` существует, `diff_refs.base_sha` непуст, changeset непуст |
| S3  | scaffold          | `inbox-review-plan --scaffold --base <base> --ref` | PLAN.md + tasks/\*.task.md + README.md + HISTORY.md созданы                  |
| S4  | enrich            | наполнить `## Контекст` в task-файлах              | все task-файлы имеют непустой Контекст                                       |
| S5  | validate-enriched | `inbox-review-plan --validate --stage enriched`    | exit=0, `ok:true`                                                            |
| S6  | fan-out           | сабагенты заполняют дорожки                        | все task-файлы `status: filled`                                              |
| S7  | validate-filled   | `inbox-review-plan --validate --stage filled`      | exit=0, `ok:true`                                                            |
| S8  | synthesize        | написать README.md по эталону                      | README.md существует, секции по эталону                                      |
| S9  | validate-readme   | `inbox-review-plan --validate`                     | exit=0, `ok:true`                                                            |
| S10 | post-precheck     | проверка предложенных действий ДО постинга         | все линейные — в diff-hunk; тело общего < порога (см. гейты)                 |
| S11 | post (dry-run)    | EffectExecutor в dry-run                           | публикуемо только валидное; дедуп; в GitLab ничего не пишется                |

<!--/SECTION:STAGES-->

<!--SECTION:GATES-->

## 4. Гейты (булевые инварианты, из SESSION-REFLECTION)

| ID  | Гейт                 | Инвариант                                                                         | Улика (как проверяем)                                                | Слом в рефлексии |
| --- | -------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------- |
| G1  | base-sha-source      | base = `diff_refs.base_sha` из `inbox-context`, НЕ пересчитанный `git merge-base` | использованный base == `context.diff_refs.base_sha`                  | Шаг 3            |
| G2  | scaffold-cleanup     | повторный `--scaffold` не оставляет stale task-файлов                             | после re-scaffold в tasks/ только актуальные дорожки                 | Шаг 4            |
| G3  | validate-enriched-ok | enriched-стадия валидна                                                           | `--validate --stage enriched` → `ok:true`                            | Шаг 6            |
| G4  | table-pipe-escaped   | нет незаэкранированного `\|` внутри ячеек Markdown-таблиц                         | валидатор не падает на token; либо линт таблиц                       | Шаг 8            |
| G5  | validate-filled-ok   | filled-стадия валидна (+ coverage ledger + tool-call сверка)                      | `--validate --stage filled` → `ok:true`                              | Шаг 8            |
| G6  | section-name-exact   | системные заголовки README точны (`## Архитектура`, без `(C4)`)                   | `--validate` (README) → `ok:true`                                    | Шаг 9            |
| G7  | mermaid-valid        | все mermaid-блоки синтаксически валидны                                           | ArtifactValidator mermaid-парсер → без ошибок                        | (новый)          |
| G8  | line-in-diff-hunk    | каждое линейное замечание — на строке, реально входящей в diff-hunk               | `git diff --unified=0 base..HEAD -- <file>` содержит целевой newLine | Шаг 15c,g        |
| G9  | body-size-under-waf  | тело общего комментария < порога (по умолчанию 8KB)                               | `len(body) < threshold`                                              | Шаг 15c          |
| G10 | post-idempotent      | повторный dry-run постинг не даёт дублей (`effect_applied`)                       | второй прогон S11 → 0 новых действий                                 | Шаг 15c (дубли)  |

**«Все гейты пройдены» = G1..G10 зелёные И S0..S11 завершены без обрыва.**

<!--/SECTION:GATES-->

<!--SECTION:SURFACE-->

## 5. Surface (что строим)

- `services/agent-inbox/modules/inbox-eval/eval-driver.ts` — тонкий драйвер: гоняет РЕАЛЬНЫЙ граф
  через `runMrsOnce` (serve run-mode, TSK-121) на списке MR + seed-состоянии, прогоняет гейты
  G1–G10 (TSK-118) по произведённым артефактам, собирает `eval-report.json` + `.md`, exit≠0 при
  любом красном гейте. НЕ переоркестрирует пайплайн (прежняя форма `eval-harness.ts` отменена).
- `services/agent-inbox/modules/inbox-eval/gates.ts` — реализация G1..G10 (чистые проверки:
  вход — артефакты/контекст/diff, выход — `{gate, pass, evidence}`).
- `services/agent-inbox/modules/inbox-eval/diff-hunk.ts` — парсер `git diff --unified=0` → карта
  файл→диапазоны newLine (для G8).
- `services/agent-inbox/modules/inbox-eval/eval-report.ts` — типы + сериализация отчёта.
- e2e-обёртка: `e2e/inbox-serve/reviewer-eval.spec.ts` — гоняет harness на fixture MR, снимает
  скрины дашборда на значимых стадиях (по выбранной событийной модели), ассертит `eval-report`.
- CLI: `gennady inbox-eval --url <mr> [--live|--fixture]` — запуск эвала.

**Fixture MR (по умолчанию):** `vk-workspace/superapp!571` или `calendar/board!1296` — параметризуемо.
Пререквизиты среды (у оператора уже есть под скилл): токен к `gitlab.corp.mail.ru`, opencode+KLM.

<!--/SECTION:SURFACE-->

<!--SECTION:BDD-->

## 6. BDD (ключевые)

- GIVEN fixture MR WHEN эвал S2 THEN base == diff_refs.base_sha (G1), не пересчитанный merge-base
- GIVEN повторный scaffold WHEN S3 THEN нет stale task-файлов (G2)
- GIVEN filled-артефакты с `|` в ячейке WHEN S7 THEN G4 краснеет с указанием файла/строки
- GIVEN README с `## Архитектура (C4)` WHEN S9 THEN G6 краснеет
- GIVEN линейное замечание на строке вне diff-hunk WHEN S10 THEN G8 краснеет ДО постинга
- GIVEN тело общего комментария > 8KB WHEN S10 THEN G9 краснеет
- GIVEN два прогона S11 подряд WHEN dry-run THEN второй даёт 0 новых действий (G10)
- GIVEN все гейты зелёные WHEN эвал завершён THEN `eval-report.json.status == "PASS"`, exit=0

<!--/SECTION:BDD-->

<!--SECTION:REAL_PROOF-->

## 7. Обязательный артефакт: реальные скрины реального прогона

Эвал считается верифицированным ТОЛЬКО когда предъявлен **живой прогон на реальном MR**
(`EVAL_MR_URL`, напр. `vk-workspace/superapp!571` / `calendar/board!1296`), а не только моки/фикстуры.
Обязательные скрины (в gitignored `e2e/inbox-serve/test-results/screenshots/eval-real-*`):

- `01-plan` — настоящий PLAN.md этого MR (дорожки fan_out).
- `02-report-diagram` — REPORT.md с **реально отрисованной** mermaid-диаграммой: в DOM
  `svg[id^="mmd-"]` с узлами/рёбрами. НЕ допускается кадр с меткой «отрисовка…» или raw-source —
  это провал требования (диаграмма должна быть НАРИСОВАНА, а не в процессе).
- `03-track` — артефакт реальной дорожки (находки/кандидаты/вердикт).
- `04-actionpanel` — предложенные действия (линейные замечания + общий комментарий).
- `05-eval-report` — итог: `status` + таблица гейтов G1–G10.

**Инвариант R-01:** скрин `02-report-diagram` невалиден, если mermaid не дорисован (placeholder/raw).
E2e ждёт настоящий `<svg>` (helper `wait-render`) с генеровым таймаутом, иначе падает — не снимает
недорисованное. Моки/фикстуры остаются как быстрый регресс-чек, но НЕ заменяют живой прогон.

<!--/SECTION:REAL_PROOF-->
