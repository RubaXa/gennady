# SDD v2 RC — расследование Codex-сессии «SDD v2 // RC v3»

Дата: 2026-09-02. Оператор: k.lebedev. Ведущий: Claude Code (session-context-recover + независимые критики).

## Предмет

Codex-сессия `01a05dac-c717-7f31-a4a7-ee17ccdda131` («SDD v2 // RC v3»), transcript 65+ МБ,
всю ночь 01→02.09 автономно итерирует «правка → eval-прогон → провал» (10+ итераций authoring-эвала).
Рабочее место сессии: worktree `.claude/worktrees/sdd-v2-rc52-followup`, ветка `codex/sdd-v2-rc52-followup`,
HEAD `c84aff31` + 79 незакоммиченных файлов.

## Отчёты

| Файл | Роль | Ключевой вывод |
|---|---|---|
| [01-intent-timeline.md](01-intent-timeline.md) | Intent & Timeline | 3 смены миссии; ~19 прогонов эвала; критерия останова нет; отчёт по исходной делегации не выдан |
| [02-adversarial-audit.md](02-adversarial-audit.md) | Adversarial Audit | Подтверждены обе гипотезы оператора + третья: сам эвал-стенд врал в обе стороны (ложные FAIL и PASS) |
| [03-execution-state.md](03-execution-state.md) | Execution & State | Execute/scaffold сошлись (final9/10/11 pass); authoring — 9 итераций без чистого прохода, ≥4 провала ложные (дефекты стенда) |
| [04-directive-complexity.md](04-directive-complexity.md) | Критика директив | Authoring требует 25–40k токенов чтения до первой записи (6.5–8× execute); в authoring нет механического цикла CLI-контекст→receipt; скелеты уже ~70% самодокументированы |
| [05-diff-triage.md](05-diff-triage.md) | Триаж dirty diff | Подгонки под toy-задачи нет; 330/330 тестов зелёные; WIP безопасно коммитить (кроме tmp-файла; обязательно включить untracked dbc-service-format.xml) |
| [06-format-read-trace.md](06-format-read-trace.md) | Эмпирика чтений | (трейс чтений worker-агентов в песочницах final16–20 — проверка гипотезы «агент тонет в форматах») |
| [07-templates-as-instructions-prior-art.md](07-templates-as-instructions-prior-art.md) | Prior art | Гипотеза «шаблон = формат» подтверждена для section-level guidance (BMAD, Spec Kit, GitHub/ADR/RFC-шаблоны); execution flow остаётся в короткой команде; инструкции — удаляемые при заполнении |
| [08-session-final-report.md](08-session-final-report.md) | Финальный отчёт сессии | После стоп-кадра: WIP закоммичен (61ecb330), RC отклонён, causal chain draft.61, вердикты по a77fbcf1, план до RC из 8 пунктов |
| [09-rc-plan-handoff.md](09-rc-plan-handoff.md) | **План-handoff до RC** | Синтез: северная звезда (автономный flow, дешёвая модель, журнал отклонений), 7 принципов дизайна, решения по пивотам, пакеты P0–P7, анти-цикл правила. Передаётся новой рабочей сессии |
| [10-orchestration-setup.md](10-orchestration-setup.md) | **Оркестрация исполнения** | Роли (оператор / оркестратор / runner-подагент / analyst-подагент), права, петля выполнения пакета, анти-цикл для всех ролей |
| [11-authoring-generation-plan.md](11-authoring-generation-plan.md) | **P8: генерация целиком + структурный чекер** | Причина P7.1 fail (точечные edit, выверка ####); генерация документа одним Write; структурный адаптивный чекер с auto-fix; корпус фикстур; калибровка по прогонам |
| [12-P9-understandable-tools.md](12-P9-understandable-tools.md) | **P9: понятные инструменты вместо запретов** | Ресёрч (промпт-запреты не работают, enforcement на уровне tool ≠ запрет модели); задачи P9.1–P9.6: корпус тестов, объясняющий sdd-new, честный выход вместо shell-workaround, structured errors, signifiers идеи |

## Гипотеза оператора на верификации

«Шаблон и есть формат»: инструкции по заполнению живут внутри генерируемого скелета
(как образец заполненного бланка в ведомстве); CLI говорит лишь «прочитай файл и заполни по образцу»;
отдельные format-файлы поглощаются шаблоном или на них ссылается сам шаблон точечно.
Дополнение: проверки инструментов — мягкие/адаптивные (маркеры и заполненность секций, подсказка вместо
побайтовой придирки), потому что исполнитель — LLM, а не механический парсер.
