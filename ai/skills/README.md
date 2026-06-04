# ai/skills — AI-навыки для агентов

15 навыков (13 SDD + alt-opinion + workspace-permission-setup) для Specification-Driven Development, мульти-модельного анализа и настройки автономной среды.

> `sdd-hooks-install` (хуки live-прогресса для `sdd-execute`) и `workspace-permission-setup` мигрированы в хранилище из `~/.claude/skills` — теперь под git и деплоятся через `sync-skills`.

---

## Типовые сценарии (Use Cases)

### 1. Спроектировать новый модуль с нуля

```bash
npx gennady sync-skills
```

Затем в агенте: «@sdd-setup создай проект» → «@sdd-discover спроектируй scope vcs-client» → «@sdd-module-decomposition разбей на модули» → «@sdd-scaffold сгенерируй таски» → «@sdd-critic проверь таски» → «@sdd-execute TSK-01»

| Шаг | Навык | Что делает |
| --- | ----- | ---------- |
| 1 | `sdd-setup` | Инициализирует `specs/README.md` (Vision, Scope Graph, таблица скоупов) |
| 2 | `sdd-discover` | Создаёт `specs/<scope>/<scope>.spec.md` — видение, требования, архитектура |
| 3 | `sdd-module-decomposition` | Декомпозирует product/library scope на модульные спеки с инвентарём сущностей |
| 4 | `sdd-scaffold` | Генерирует DAG тасков из спек: Cascade Table, BDD, Phases Overview |
| 5 | `sdd-critic` | Многораундовая критика тасков: диспатчит критика, правит артефакт (до 5 раундов) |
| 6 | `sdd-execute` | Исполняет один таск от начала до конца: dispatch фаз → audit |

### 2. Выполнить задачу

```
@sdd-execute TSK-03
```

Или: «выполни следующую», «execute pickable», «выбери что делать дальше».

Навык читает таск, диспатчит фазы одну за другой, закрывает round, диспатчит fresh-eyes audit.

### 3. Выполнить пачку задач

```
@sdd-execute-batch выполни всю очередь
```

Параллелит таски с непересекающимися файлами. Опциональный epic-level audit.

### 4. Проверить качество спеки / таска

```
@sdd-critic проверь спеку cli/cli.spec.md
@sdd-critic проверь таск TSK-03
```

Многораундовая критика (до 5 раундов): диспатчит изолированного критика, оценивает фидбек, правит артефакт.

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

Fresh-eyes: читает таск + спеку + git diff, механический линтинг, верификация правил. Фидинги роутятся в артефакты (правки спек, переоткрытие тасков).

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
| **Orchestrator** | Прочитать таск → dispatch фаз (typed Handoff) → dispatch audit. Сам код не пишет | sdd-execute, sdd-execute-batch |
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

```bash
# Синхронизировать все навыки
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
