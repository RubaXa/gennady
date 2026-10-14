# ai/flow-eval

Код eval-харнесса (`cli.ts`, `runner.ts`, `provision.ts`, `dependency-store.ts`,
`sandbox-lifecycle.ts`, `observer.ts`, `judge.ts`, `quality-gate.ts`, `migration-grade.ts`,
`results-archive.ts` и др.) — прогоняет реальную модель через одну фазу SDD в одноразовой песочнице,
чтобы узнать, доводит ли флоу разработчика-агента до правильного артефакта.

## Документация (GAP-E-5, D-46) — два обязательных файла + именованные разборы

| Файл                                                                                                                                    | О чём                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[`docs/EVAL-SPEC.md`](./docs/EVAL-SPEC.md)**                                                                                          | Единая спека: что такое eval, объекты, жизненный цикл, архитектура пайплайна, единый словарь правил качества (`R1`/`MIGRATION`/`R-COMPLETE`), опциональная траектория/checkpoints — часть A для человека, часть B готовый бриф для агента.                                                                                                                                                                                                                      |
| **[`docs/RUNBOOK.md`](./docs/RUNBOOK.md)**                                                                                              | Процедуры: жёсткое правило модели, сборка, сервер OpenCode, env, бюджеты по фазам, живой прогон, цепочные прогоны, внешний репозиторий (round-trip/migration), host-setup SwiftLint-бенча.                                                                                                                                                                                                                                                                      |
| **[`docs/11-ANALYSIS-CHECKLIST.md`](./docs/11-ANALYSIS-CHECKLIST.md)**                                                                  | Именованный чеклист для разбора прогона (артефакт харнесса vs поведение флоу) и построения следующей гипотезы — держи рядом при разборе, см. отсылку в `EVAL-SPEC.md`.                                                                                                                                                                                                                                                                                          |
| **[`docs/journal/flow-verification-ledger.md`](./docs/journal/flow-verification-ledger.md)**                                            | Append-only реестр решений: CONFIRMED / REFUTED / ACCEPTED / LANDED, с обоснованием — почему сделано так, а не иначе, чтобы не переоткрывать закрытые вопросы.                                                                                                                                                                                                                                                                                                  |
| **[`docs/journal/EXPERIMENTS-LOG.md`](./docs/journal/EXPERIMENTS-LOG.md)** / **[`docs/journal/RESULTS.md`](./docs/journal/RESULTS.md)** | Живые журналы прогонов (GAP-E-6, D-62): `EXPERIMENTS-LOG.md` — заготовка на каждый прогон (дописывается автоматически), `RESULTS.md` — сгенерированная сводная таблица результатов из [`results/`](./results/README.md).                                                                                                                                                                                                                                        |
| **[`docs/journal/guard-verification.md`](./docs/journal/guard-verification.md)**                                                        | Именованный разбор: как проверялось, что регенерированный на round-trip cloud-ios bash-скрипт (без компиляции) действительно правильный — заморожен как разбор конкретного прогона.                                                                                                                                                                                                                                                                             |
| **[`docs/eval-history.html`](./docs/eval-history.html)**                                                                                | Самодостаточная визуальная хроника: каждое изменение инструмента/директивы/промпта между сессиями (before→после, решение и почему, дельты время/токены/траектория). Источник данных — [`docs/journal/eval-history.json`](./docs/journal/eval-history.json), сверка — [`docs/journal/eval-history-gaps.md`](./docs/journal/eval-history-gaps.md), генератор — [`scripts/build-history-report.ts`](./scripts/build-history-report.ts) (перегенерит HTML из JSON). |

Раньше здесь было 19+ документов (`00-INTRO.md`…`10-QUALITY-RULES.md`, `AGENT-BRIEF.ru.md`,
`PREREQUISITES.ru.md` и др. в нескольких переименованиях) с тремя разными наборами чисел и тремя
разными словарями правил качества. `EVAL-SPEC.md` и `RUNBOOK.md` — единственный источник истины для
концепций и процедур; исторические постмортемы и ресёрч-заметки (roadmap, progress-report,
redesign-план, p9-калибровка, swiftlint host-setup, round-trip wall-3 — свёрнут в ledger как finding A7,
обновление см. там же) свёрнуты сюда же или в ledger — их живые факты не потеряны, но больше не читаются
как отдельные документы. Именованные разборы одного прогона/механизма (analysis-checklist,
guard-verification, eval-history) остаются отдельными файлами — они не концепция и не процедура, а
конкретный кейс, — но перечислены здесь и в `EVAL-SPEC.md`, чтобы не потеряться. Сверка «каждая
команда/путь проверены, счётчик непроверенных = 0» — `npm run flow-eval:docs-check`
([`scripts/verify-eval-docs.ts`](./scripts/verify-eval-docs.ts)).

## Два контура проверки: модель и директивы

Флоу проверяется на двух уровнях — не путать:

| Контур                                                | Что проверяет                                    | Как                                                                       |
| ----------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| **flow-eval** (этот)                                  | Пройдёт ли живая **модель** фазу как разработчик | Реальный прогон в песочнице, observer + judge + механика.                 |
| **flow-sim** ([`ai/flow-sim`](../flow-sim/README.md)) | Правильно ли ведут себя сами **директивы**       | Сценарный прогон ролей Executor/Verifier/Arbiter по фиксированным картам. |

flow-eval отвечает «может ли модель пройти флоу», flow-sim — «делают ли директивы то, что должны»
(например, роутит ли `LOGIC_SWITCH` куда надо, держит ли `STOP`).

## Артефакты прогонов

- **[`results/`](./results/README.md)** (GAP-E-6, постоянно, в git) — одна директория на
  `(дата, сценарий)`: `summary.json` + `judge.md`. Источник таблицы в `docs/journal/RESULTS.md`.
- **`.results/`** (транзиентно, gitignore) — компактные доказательства всего батча; автоматически
  ограничены 10 последними каталогами и возрастом 7 дней. Постоянный `results/` lifecycle не трогает.

Каждый запуск проходит обязательный lifecycle `setup → run → compact evidence → cleanup`. По умолчанию
retention песочниц равен нулю; `--keep` — только bounded debug-retention (не более 2 каталогов и 24
часов). `SIGINT`/`SIGTERM` кооперативно останавливают runtime, сохраняют частичные доказательства,
чистят owned-пути и завершаются кодами 130/143. Зависимости сценариев не копируются: они доступны через
symlink из общего content-addressed store только после совпадения `package-lock.json`, installed-lock,
allowlist, Node ABI, platform и arch; несовпадение закрывает запуск без install/copy fallback.
Lease capability защищён exact owner token, host/PID+liveness и heartbeat (30 секунд; stale после 2 минут): dead/stale orphan
очищается до active-cap и retention, а повреждённый lease quarantined и требует операторского
разбора. Read-only отчёт: `node --import tsx ai/flow-eval/scripts/sandbox.ts dependencies --dry
--root <sandbox-root>`; `--clean` удаляет только inactive stores, никогда active/quarantined.
