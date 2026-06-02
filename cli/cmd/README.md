# cli/cmd — Команды CLI

16 команд для AI-агентов: работа с git, генерация commit-сообщений, ревью, merge-конфликты, линтинг, навигация по коду, синхронизация, мониторинг.

---

## Типовые сценарии

### 1. Сделать коммит

```bash
# Сгенерировать commit message из staged-изменений
npx gennady commit

# One-line + сразу применить
npx gennady commit --mode=oneline --apply

# С указанием задачи
npx gennady commit --task=MAILCORE-123
```

### 2. Проверить качество кода

```bash
# Линтинг директории
npx gennady lint ./src

# Только staged .ts файлы
npx gennady lint --staged

# Автофикс DbC-контрактов
npx gennady lint ./src --autofix
```

### 3. Навигация по проекту

```bash
# Карта проекта (все файлы с аннотациями)
npx gennady orient

# Найти файлы по задаче
npx gennady orient --task=TSK-03

# Кто потребляет модуль
npx gennady orient --consumer=DbcTsLinter

# Граф зависимостей
npx gennady orient --graph

# Детальный просмотр файла
npx gennady orient --file=path/to/file.ts

# Встроить orient-инструкции в AGENTS.md
npx gennady agents-rules
```

### 4. Ревью MR/PR

```bash
# Верификация MR по текущей ветке
npx gennady review-verify

# По URL
npx gennady review-verify --url="https://gitlab.com/group/repo/-/merge_requests/42"

# По ref
npx gennady review-verify group/repo!42

# Только XML issues
npx gennady review-issues --ref=group/repo!42

# Ответить на discussion-треды
echo '[{"discussionId":"abc","body":"Fixed"}]' | \
  npx gennady vcs-reply --project=group/repo --iid=42
```

### 5. AI-ревью staged-изменений

```bash
npx gennady review
npx gennady review --branch=develop
```

### 6. Разрешить merge-конфликты

```bash
# После git merge с конфликтами
npx gennady resolve-conflicts
npx gennady resolve-conflicts --branch=main --incoming=feature/x
```

### 7. Собрать файлы для AI-контекста

```bash
# XML (по умолчанию)
npx gennady cat "./src/**/*.ts"

# Markdown, без цвета
npx gennady cat "./src/**/*.ts" --output=md --plain | pbcopy

# Из удалённого MR
npx gennady cat --url="https://gitlab.com/.../-/merge_requests/123"
```

### 8. Синхронизировать директивы и навыки

```bash
# Директивы
npx gennady sync
npx gennady sync --dry-run

# Навыки
npx gennady sync-skills
npx gennady sync-skills --dry-run
```

### 9. Мульти-модельный анализ

```bash
# Мнение двух моделей с синтезом
npx gennady alt-opinion \
  --model="llmproxy/kimi-k2.6" \
  --model="llmproxy/glm-5.1" \
  --synthModel="llmproxy/deepseek-v4-pro" \
  --file="./spec.md"
```

### 10. Мониторинг AI-агентов

```bash
# Live-дашборд
npx gennady agent-mon

# Одноразовый снапшот
npx gennady agent-mon --once
```

---

## Все команды

| Команда             | Назначение                                              |
| ------------------- | ------------------------------------------------------- |
| `commit`            | Генерация commit message из staged-изменений через AI   |
| `cat`               | Вывод файлов в XML/Markdown для AI-контекста            |
| `review`            | AI-ревью staged изменений                               |
| `review-verify`     | Сборка промпта для верификации MR/PR discussions        |
| `review-issues`     | XML-артефакт issues из MR/PR                            |
| `vcs-reply`         | Постинг ответов в GitLab MR discussions                 |
| `resolve-conflicts` | Промпт для AI-разрешения merge-конфликтов               |
| `remote-console`    | Зеркалирование браузерной консоли в stdout              |
| `lint`              | Валидация .ts файлов: headers, anchors, DbC, invariants |
| `alt-opinion`       | Мульти-модельные мнения с синтезом                      |
| `sync`              | Синхронизация `ai/directives/` из npm-пакета            |
| `sync-skills`       | Синхронизация SDD-навыков в `.claude/skills/`           |
| `agent-mon`         | Интерактивный дашборд мониторинга AI-агентов            |
| `orient`            | Навигация по file-header и DBC-контрактам               |
| `agents-rules`      | Инструкция по orient для AI-агентов                     |

---

## Структура команды

```
cli/cmd/<name>/
├── <name>.cmd.ts     # Исполняемая логика команды
├── index.ts          # Точка входа для динамического импорта
├── help.ts           # help-вывод (опционально)
└── README.md         # Документация (есть только у orient — канонический источник для agents-rules)
```

При добавлении команды обновить: `cli/cmd/README.md` (этот файл), `cli/AGENTS.md`, `cli/gennady.ts`.

---

## Связанные спеки

- `specs/cli/cli.spec.md` — общая спека CLI
- `specs/cli/lint/lint.spec.md` — линтинг
- `specs/cli/alt-opinion/alt-opinion.spec.md` — alt-opinion
- `specs/cli/cat/cat.spec.md` — cat
- `specs/cli/sync/sync.spec.md` — sync
- `specs/cli/sync-skills/sync-skills.spec.md` — sync-skills
- `specs/cli/agents-rules/agents-rules.spec.md` — agents-rules
- `specs/cli/e2e/e2e.spec.md` — e2e-тестирование
