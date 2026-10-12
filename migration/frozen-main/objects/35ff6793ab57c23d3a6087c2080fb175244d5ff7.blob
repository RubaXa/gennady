# ai/skills — AI-навыки для агентов

> 🧭 **Единый гайд по SDD-воркфлоу (сценарии по шагам, диаграммы): [docs/sdd-flow.md](../../docs/sdd-flow.md).**
> Здесь — справочник навыков: типовые сценарии вызова и паттерны исполнения.

Навыки для Specification-Driven Development, мульти-модельного анализа и настройки автономной среды: SDD-семейство (`sdd-*`) плюс agent-inbox, alt-opinion, prd-interview и workspace-permission-setup. Стековые специализации (например, `sdd-infra-golang`) живут в `plugins/<stack>/skills/` и синхронизируются тем же `sync-skills`.

> `workspace-permission-setup` мигрирован в хранилище из `~/.claude/skills` — теперь под git и деплоится через `sync-skills`.

---

## Типовые сценарии (Use Cases)

### 1. Спроектировать новый модуль с нуля

```bash
npx gennady sync          # директивы (обязательно первым)
npx gennady sync-skills   # навыки
```

Затем в агенте: «@sdd-setup создай проект» → «@sdd-discover спроектируй scope vcs-client» → «@sdd-module-decomposition разбей на модули» → «@sdd-scaffold сгенерируй таски» → «@sdd-critic проверь таски» → «@sdd-execute TSK-01»

| Шаг | Навык | Что делает |
| --- | ----- | ---------- |
| 1 | `sdd-setup` | Инициализирует `specs/README.md` (Vision, Scope Graph, таблица скоупов) |
| 2 | `sdd-discover` | Создаёт `specs/<scope>/<scope>.spec.md` — видение, требования, архитектура |
| 3 | `sdd-module-decomposition` | Декомпозирует product/library scope на модульные спеки с инвентарём сущностей |
| 4 | `sdd-scaffold` | Генерирует DAG тасков из спек: Cascade Table, BDD, Phases Overview |
| 5 | `sdd-critic` | Критика пробелов: baseline, затем узкая проверка принятых правок (до 5 раундов) |
| 6 | `sdd-execute` | Исполняет таск автономно: typed Handoff → terminal audit → точечный retry |

### 2. Выполнить задачу

```
@sdd-execute TSK-03
```

Или: «выполни следующую», «execute pickable», «выбери что делать дальше».

Навык диспатчит фазы последовательно и передаёт typed Handoff. Безопасно разрешимое
расхождение фиксируется обычным `decision`/`insight` и не останавливает execution. После
закрытия round fresh-eyes audit автономно доходит до terminal result и сохраняет его в таске.
При FAIL каждый finding сам называет владельца: phase, ticket, spec или project. Смешанные findings не
теряются; свежие аудиты продолжаются, пока исправления закрывают предыдущие блокирующие находки либо
дают новые доказательства и другой проверяемый путь. Эквивалентный результат без новых доказательств
или пути означает доказанный no-progress, а не запрос оператору разрешить ещё одну попытку. Runtime
PASS опирается на выполненную команду или probe с наблюдаемым результатом.

### 3. Выполнить пачку задач

```
@sdd-execute-batch выполни всю очередь
```

Планирует очередь по фактическим зависимостям и последовательно запускает для каждого готового
TODO/IN_PROGRESS тикета канонический `sdd-execute` lifecycle. В одном worktree таски не параллелятся:
так audit diff и tracker writes не смешиваются. BLOCKED/PAUSED lane не останавливает независимые
тикеты. Опциональный `epic-audit` добавляется после обязательных per-task audits.

### 4. Проверить качество спеки / таска

```
@sdd-critic проверь спеку cli/cli.spec.md
@sdd-critic проверь таск TSK-03
```

Критика пробелов (до 5 раундов): первый изолированный критик делает baseline-проверку, следующие проверяют только принятые правки и вызванные ими регрессии. Первый `CLEAN` завершает цикл.

### 5. Продолжить / доработать существующую спеку

```
@sdd-continue добавь sync-skills в cli
@sdd-continue измени архитектуру на event-driven
```

Автоопределение режима: refine (добавить) или pivot (заменить).

### 6. Проверить целостность SDD-воркфлоу

```
@sdd-check
```

Read-only: проверяет связность спек, синхронизацию трекеров, полноту execution-логов, консистентность DAG.

### 7. Аудит завершённой задачи

```
@sdd-audit TSK-05
```

Fresh-eyes: читает таск + спеку + git diff, перепроверяет execution decisions, тесты и правила. Один запуск
не паузится для оператора: terminal PASS/FAIL сохраняется в Audit Rounds, а findings называют route и phase-owner.

### 8. Починить после ревью / sdd-check

```
@sdd-fix найди и исправь проблемы из sdd-check
```

Классифицирует фидинги, согласовывает с оператором, исполняет фиксы, переоткрывает таски, верифицирует.

### 9. Спроектировать инфраструктурный скоуп

```
@sdd-infra спроектируй infra-golang
```

Для bootstrap'а tooling'а: package manager, type-checker, linter, formatter, test runner, git hooks, CI.

### 10. Получить мульти-модельное мнение

```
@alt-opinion оцени спеку cli/cli.spec.md
```

Запускает 2+ модели параллельно, синтезирует через третью. Без аргументов — автоаудит текущего контекста сессии.

---

## Execution-паттерны

| Паттерн | Как работает | Навыки |
| ------- | ----------- | ------ |
| **Directive activation** | Извлечь intent → загрузить директиву → активироваться как она → выполнить план | sdd-setup, sdd-discover, sdd-module-decomposition, sdd-scaffold, sdd-audit, sdd-continue, sdd-critic, sdd-fix, sdd-infra |
| **Orchestrator** | Dispatch фаз → typed Handoff → persisted audit → remediation по route/phase → свежий audit | sdd-execute, sdd-execute-batch |
| **CLI delegation** | Подготовить артефакт → вызвать `npx gennady alt-opinion` → показать результат | alt-opinion |
| **Read-only verifier** | Саморефлексия + механические проверки через `sdd scan`. Код не пишет | sdd-check |

---

## Структура навыка

```
ai/skills/<name>/
├── SKILL.md          # YAML frontmatter (name, description, compatibility) + markdown body
├── scripts/          # опционально: bash/js утилиты
└── *.prompt.md       # опционально: кастомные промпты
```

---

## Синхронизация в проекты

> ⚠️ **Порядок важен:** сначала директивы, потом навыки. Скиллы — тонкие клиенты над директивами из
> `ai/directives/`, поэтому `npx gennady sync-skills` без предварительного `npx gennady sync` развернёт
> навыки, которым нечего загружать.

```bash
# 1. Директивы: ai/directives/ (из npm-пакета в проект)
npx gennady sync

# 2. Навыки: ai/skills/ → .claude/skills/ проекта
npx gennady sync-skills

# Предпросмотр
npx gennady sync-skills --dry-run

# Конкретный навык
npx gennady sync-skills sdd-execute
```

Навыки деплоятся из `ai/skills/` → `.claude/skills/` проекта. Пути нормализуются: dev-пути (`~/Developer/gennady/...`) заменяются на продуктовые.

---

## Связанные спеки

- `specs/ai-skills/ai-skills.spec.md` — общая спека библиотеки
- `specs/ai-skills/skill-contract/skill-contract.spec.md` — контракт навыка
- `specs/ai-skills/sdd-skills/sdd-skills.spec.md` — SDD-навыки
- `specs/ai-skills/alt-opinion/alt-opinion.spec.md` — alt-opinion
