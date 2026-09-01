# ai/skills — навыки агентов

12 навыков: 8 SDD-навыков, agent-inbox, opencode-get-session, prd-interview и
workspace-permission-setup.

## SDD Flow v2

SDD v2 stateless: новый запуск восстанавливает состояние из спецификаций, тикетов, их Execution
Log, Git и текущего вывода механических инструментов. `specs/.sdd-session.md`, план в JSON,
долговечная сессия критика и worker checkpoint не являются частью потока.

```text
спецификации
  → структурная проверка
  → одно независимое смысловое ревью фактических спецификаций
  → решение оператора №1: утвердить спецификации
  → создание фактических тикетов
  → механическая authoring-проверка
  → одно независимое ревью фактических тикетов
  → решение оператора №2: утвердить разбиение и тест-план вместе
  → исполнение по тикету / Execution Log / Git
  → реальные команды проверки
  → аудит и code-review
```

Автор может мысленно проверить собственный план до записи. Независимая модель нужна только в двух
точках выше и проверяет смысл; она не сохраняет план в JSON, не редактирует артефакты и не обязана
продолжать прежнюю сессию.

## Основные навыки

| Навык | Назначение |
|---|---|
| `sdd` | Один read-only `sdd-state`, классификация intent, ленивый переход к владельцу |
| `sdd-scaffold` | Создание реальных тикетов, механическая проверка, ревью тикетов, решение №2 |
| `sdd-execute` | Исполнение одного тикета или очереди по `sdd-task`; реальные gates, audit, code-review |
| `sdd-critic` | Одно on-demand независимое смысловое ревью bounded target-set; без автоправок |
| `sdd-reconcile` | Восстановление треугольника spec ↔ task ↔ code по текущим артефактам |
| `sdd-check` | Read-only механическая проверка |
| `sdd-audit` | Проверка соответствия spec/task/diff/Execution Log |
| `sdd-code-review` | Независимый поиск поведенческих ошибок после аудита |

Прямые входы `sdd-scaffold`, `sdd-execute`, `sdd-critic`, `sdd-reconcile` передают router один
read-only snapshot и forced intent. Router не открывает и не закрывает сессию.

## Механика и смысл

Механические проверки отвечают за форму и трассировку:

- обязательные секции, anchors, разрешимые spec references;
- уникальные Task-ID, разрешимые и ацикличные зависимости, синхронизацию tracker;
- Requirement-ID → BDD scenario → planned/implemented test;
- наличие применимого негативного/failure scenario: happy-path-only — ошибка;
- присутствие Requirement-ID в реализованном тесте после execute.

Модель отвечает за семантику: действительно ли сценарий отражает требование, доказателен ли тест,
не конфликтуют ли границы и зависимости. Реальная команда тестов остаётся окончательным runtime
доказательством.

## Выполнение

`/sdd-execute` без аргумента показывает выбор и ждёт. `next` выбирает только единственную pickable
задачу. `all`/`batch` исполняет DAG-порядок. Параллель разрешён лишь для задач без dependency relation
и с непересекающимися Target Files; идентичность worker session не участвует в решении.

Каждый phase worker получает bounded phase context и возвращает typed Handoff. Оркестратор сверяет
его с Git и записывает факты в Execution Log. Потерянного worker можно заменить свежим: корректность
не зависит от памяти агента.

## Миграция

Единственный migration flow — V1→V2. Невалидная или устаревшая V2-спека возвращается в обычный V2
authoring flow; V2→V2/V3 migration route не существует.

## Синхронизация

```bash
npx gennady sync-skills
npx gennady sync-skills --dry-run
npx gennady sync-skills sdd-execute
```

Навыки деплоятся из `ai/skills/` в `.claude/skills/` проекта.

## Связанные спецификации

- `specs/ai-skills/ai-skills.spec.md`
- `specs/ai-skills/skill-contract/skill-contract.spec.md`
- `specs/ai-skills/sdd-skills/sdd-skills.spec.md`
