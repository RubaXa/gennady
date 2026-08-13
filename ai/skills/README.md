# ai/skills — AI-навыки для агентов

13 навыков (9 SDD + agent-inbox + opencode-get-session + prd-interview + workspace-permission-setup) для Specification-Driven Development и настройки автономной среды.

> `sdd-hooks-install` (хуки live-прогресса для `sdd-execute`) и `workspace-permission-setup` мигрированы в хранилище из `~/.claude/skills` — теперь под git и деплоятся через `sync-skills`.

---

## Типовые сценарии (Use Cases)

### 1. Спроектировать новый модуль с нуля

```bash
npx gennady sync-skills
```

Затем в агенте: «@sdd создай проект» → «@sdd спроектируй scope vcs-client» → «@sdd разбей vcs-client на модули» → «@sdd-scaffold сгенерируй таски» → «@sdd-critic проверь таски» → «@sdd-execute TSK-01»

`@sdd` — единственная входная дверь: роутер сам классифицирует intent (project-setup / new-scope / evolve-scope / module-decomposition / recover-from-code) и scope-type (infrastructure / interface / library / product), затем грузит нужную v2-директиву.

| Шаг | Навык | Что делает |
| --- | ----- | ---------- |
| 1 | `sdd` | Инициализирует портал, проектирует/эволюционирует scope, декомпозирует на модули — маршрутизация по intent + scope-type |
| 2 | `sdd-scaffold` | Генерирует DAG тасков из спек: Cascade Table, BDD, Phases Overview |
| 3 | `sdd-critic` | Многораундовая критика тасков: диспатчит критика, правит артефакт (до 5 раундов) |
| 4 | `sdd-execute` | Исполняет один таск или всю pickable-очередь: dispatch фаз → audit → code-review |

### 2. Выполнить задачу (одну или всю очередь)

```
@sdd-execute TSK-03
@sdd-execute всю очередь
```

Или: «выполни следующую», «execute pickable», «выбери что делать дальше», «выполни всю очередь».

Один навык на оба режима: LOGIC-SWITCH на intent (Task-ID / `next` / `batch`/`all`/`queue`) решает — одиночный таск или вся pickable-очередь (параллель по тасками с непересекающимися файлами). Навык читает таск(и), диспатчит фазы одну за другой, закрывает round, диспатчит fresh-eyes audit + code-review.

### 3. Проверить качество спеки / таска

```
@sdd-critic проверь спеку cli/cli.spec.md
@sdd-critic проверь таск TSK-03
```

Многораундовая критика (до 5 раундов): диспатчит изолированного критика, оценивает фидбек, правит артефакт.

### 4. Продолжить / доработать существующую спеку

```
@sdd добавь sync-skills в cli
@sdd измени архитектуру на event-driven
```

Через тот же роутер: intent = evolve-scope, режим (refine / pivot) автоопределяется из формулировки.

### 5. Проверить целостность SDD-воркфлоу

```
@sdd-check
```

Read-only: проверяет связность спек, синхронизацию трекеров, полноту execution-логов, консистентность DAG.

### 6. Аудит завершённой задачи

```
@sdd-audit TSK-05
```

Fresh-eyes: читает таск + спеку + git diff, механический линтинг, верификация правил. Фидинги роутятся в артефакты (правки спек, переоткрытие тасков).

### 7. Починить после ревью / sdd-check

```
@sdd-reconcile найди и исправь проблемы из sdd-check
```

Два авто-детектируемых режима: `fix` (фидинги/баг/ревью — код неверен) и `from-code` (код обогнал спеку). Классифицирует фидинги, согласовывает с оператором, исполняет фиксы, переоткрывает таски, back-sync спек/тасков, верифицирует.

### 8. Спроектировать инфраструктурный или интерфейсный скоуп

```
@sdd спроектируй infra-golang
```

Тот же роутер: scope-type=infrastructure/interface форсируется из intake, дальше — bootstrap tooling'а (package manager, type-checker, linter, formatter, test runner, git hooks, CI) или контрактов интерфейса.

---

## Execution-паттерны

| Паттерн | Как работает | Навыки |
| ------- | ----------- | ------ |
| **Directive activation** | Извлечь intent → загрузить v2-директиву → активироваться как она → выполнить план | sdd, sdd-scaffold, sdd-audit, sdd-critic, sdd-reconcile |
| **Orchestrator** | Прочитать таск(и) → dispatch фаз (typed Handoff) → dispatch audit + code-review. Сам код не пишет | sdd-execute |
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
