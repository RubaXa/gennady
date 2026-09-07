# Бриф агенту: завести flow-eval под свой репозиторий

Copy-paste бриф. Разработчик отдаёт этот текст своему агенту, чтобы тот завёл round-trip/migration-eval
для КОНКРЕТНОГО внешнего репозитория. Не заменяет чтение остальных доков — только даёт исполнимую
последовательность и ссылки.

---

## Бриф (скопировать агенту)

> Заведи flow-eval-прогон харнесса `ai/flow-eval` из репозитория `gennady` для репозитория
> `<ИМЯ_РЕПО>`, путь `<ПУТЬ_К_РЕПО>`.
>
> Предпосылки, которые должны быть выполнены ДО начала (проверь, не считай данностью):
>
> 1. Целевой репозиторий лежит под `$HOME/Developer/<ИМЯ_РЕПО>` — клоном или git worktree. Если нет —
>    создай клон/worktree там или симлинкни: `ln -s <ПУТЬ_К_РЕПО> ~/Developer/<ИМЯ_РЕПО>`. Подробности
>    и почему это обязательно: `ai/flow-eval/docs/PREREQUISITES.ru.md`.
> 2. OpenCode HTTP-сервер уже запущен на свободном порту ≥4097 (не 4096, не порт Desktop-инстанса) и
>    отвечает на `/health`. Если не запущен — подними по `ai/flow-eval/RUNBOOK.ru.md` («Подготовка»).
> 3. Переменные `LLM_PROXY_BASE_URL` и `LLM_PROXY_API_KEY` заданы в окружении (не печатай значения).
> 4. В worktree `gennady`, из которого запускается харнесс: `git status --short` чистый,
>    `npm run build` прошёл, `npm run test:sdd-flow-eval` зелёный.
>
> Дальше:
>
> 1. Прочитай `ai/flow-eval/README.md` (что это и как устроено) и
>    `ai/flow-eval/docs/ARCHITECTURE.ru.md` (пайплайн, роли модулей, что детерминировано).
> 2. Реши: эвал использует встроенную фикстуру (`ai/flow-eval/WRITING-EVALS.ru.md`) или СВОЙ внешний
>    репозиторий (`ai/flow-eval/docs/WRITING-EVALS-EXTERNAL.ru.md`) — для round-trip/migration это
>    почти всегда внешний репозиторий.
> 3. Для внешнего репозитория заведи скрипт по образцу `ai/flow-eval/scripts/roundtrip-eval.sh` или
>    `migration-eval.sh`: переменные `REPO`/`GEN_ROOT` в начале, вызов
>    `ai/flow-eval/scripts/require-developer-repo.sh "$REPO"` в начале КАЖДОЙ подкоманды (prep/run/
>    execute), подкоманды `prep`/`execute`/`grade`/`status`.
> 4. Опиши сценарий: `phase`, `mode`, `directory` (путь prep-worktree), `intent`, `acceptance`, и, если
>    это execute-сценарий с проверяемым завершением, — `completion: {artifact, ticket, spec}`.
> 5. Прогони `npm run build` в `gennady`, затем сценарий через `npm run sdd-flow-eval -- ...`
>    (полная форма команды — в README «Canonical command» и в RUNBOOK «Живой прогон»).
> 6. После прогона проверь ДВА измерения, не только judge: `gennady sdd-check --all .` (R1) и, если
>    заявлен `completion`, `python3 ai/flow-eval/scripts/session-metrics.py gate --fixture <dir>`
>    (R-COMPLETE). Расхождение judge с механикой — это дефект харнесса/судьи, а не флоу
>    (`ai/flow-eval/RUNBOOK.ru.md`, раздел «Критерии результата»).
> 7. Не исправляй проверяемый flow во время живого прогона и не перезапускай автоматически после
>    `fail`/`inconclusive`.

---

## Чек-лист (для агента, который следует брифу)

- [ ] Целевой репозиторий под `~/Developer/<repo>` (клон, worktree или симлинк).
- [ ] `require-developer-repo.sh` подключён к каждому entry-point скрипта, работающему с этим репо.
- [ ] OpenCode сервер поднят, `/health` отвечает, LLM-proxy переменные заданы.
- [ ] `gennady`: чистый git-статус, `npm run build`, `npm run test:sdd-flow-eval` зелёный.
- [ ] Сценарий описан по форме `SddEvalScenario` (`ai/flow-eval/types.ts`), `completion` заполнен, если
      применимо.
- [ ] После прогона: judge-вердикт ЗАФИКСИРОВАН, R1/R-COMPLETE проверены отдельно.
- [ ] Долгоживущие артефакты (обоснование judge, `.results/`) не удалены до разбора.

## Ссылки

| Документ                                                         | Когда нужен                                    |
| ---------------------------------------------------------------- | ---------------------------------------------- |
| [`README.md`](../README.md)                                      | Общая карта, каноническая команда.             |
| [`ARCHITECTURE.ru.md`](./ARCHITECTURE.ru.md)                     | Устройство пайплайна, детерминизм vs judge.    |
| [`PREREQUISITES.ru.md`](./PREREQUISITES.ru.md)                   | Сервер/прокси/сборка, правило `~/Developer/`.  |
| [`WRITING-EVALS.ru.md`](../WRITING-EVALS.ru.md)                  | Свой eval на встроенной фикстуре.              |
| [`WRITING-EVALS-EXTERNAL.ru.md`](./WRITING-EVALS-EXTERNAL.ru.md) | Свой eval на внешнем репозитории (round-trip). |
| [`METRICS.ru.md`](./METRICS.ru.md)                               | Детерминированные метрики, non-regression.     |
| [`RUNBOOK.ru.md`](../RUNBOOK.ru.md)                              | Полная процедура запуска и чтения наблюдений.  |
| [`QUALITY-RULES.ru.md`](../QUALITY-RULES.ru.md)                  | Бэклог механических правил (R1…R6).            |
