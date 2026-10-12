## 🤖 Gennadyᵇᵉᵗᵃ 🗯️

<!-- Test comment: Security boundary test for Claude Code -->

**GEN**eral **E**xtensible **N**eural **N**etwork **A**daptive **D**ata **Y**ntelligence.

CLI-инструмент для работы с git-изменениями, merge-конфликтами и GitLab review-пайплайном.

---

## ⚡ Быстрый старт

```bash
# Справка
npx gennady help

# По умолчанию показывается справка
npx gennady

# Commit запускается только явно
npx gennady commit
```

---

## 🧩 Что нужно в окружении

- Node.js `22+`
- Git-репозиторий (для команд с git-контекстом)
- Для GitLab-команд: `GITLAB_PERSONAL_TOKEN`

```bash
# Обязательно для review-verify / review-issues / vcs-reply (live)
export GITLAB_PERSONAL_TOKEN="<token>"

# Опционально (default: /api/v4)
export GITLAB_API_PATH="/api/v4"
```

---

## 🧭 Команды CLI

### 📝 `commit`

Генерация commit message из staged-изменений.

```bash
npx gennady commit
npx gennady commit --mode=oneline
npx gennady commit --branch=develop
npx gennady commit --task=MAILCORE-123
npx gennady commit --apply
```

**Опции:**

- `--mode`, `-m`: `auto | oneline | detailed`
- `--oneline`, `--short`, `--one`, `-o`: форсировать one-line
- `--branch`, `-b`: target branch для diff
- `--task`, `-t`: добавить task id в subject
- `--model`: модель AI backend
- `--api`, `--apiUrl`: URL AI API
- `--apply`: сразу выполнить `git commit` с сгенерированным текстом

---

### 🐱 `cat`

Вывод файлов в `XML` или `Markdown`.

```bash
npx gennady cat ./src
npx gennady cat "./src/**/*.ts" --output=md
npx gennady cat ./src --plain
npx gennady cat --url="https://gitlab.com/.../-/merge_requests/123"
```

**Опции:**

- `--output`, `-o`: `xml` (по умолчанию) или `md`
- `--plain`: без ANSI-цветов
- `--exclude`, `-e`: исключить паттерны
- `--ext`: фильтр по расширениям
- `--url`: MR/PR URL для удалённого сбора файлов

---

### 🔍 `review`

AI-ревью staged изменений.

```bash
npx gennady review
npx gennady review --branch=develop
```

**Опции:**

- `--branch`, `-b`: target branch для diff (по умолчанию origin/main)

---

### ✅ `review-verify`

Собирает prompt для верификации discussion-тредов Merge Request (GitLab).

```bash
# Автоопределение MR по текущей ветке
npx gennady review-verify

# По URL
npx gennady review-verify "https://gitlab.example.com/group/project/-/merge_requests/123"
npx gennady review-verify --url="https://gitlab.example.com/group/project/-/merge_requests/123"

# По ref
npx gennady review-verify group/project!123
npx gennady review-verify --ref=group/project!123

# Явно project + iid
npx gennady review-verify --project=group/project --iid=123
```

**Опции:**

- `--branch`, `-b`: branch-режим
- `--url`: URL merge request
- `--ref`: `<project>!<iid>`
- `--project`: путь GitLab-проекта
- `--iid`: IID merge request
- `--all`: включать resolved discussions

Примечание: поддерживается GitLab-host (`*gitlab*` в host).

---

### 📄 `review-issues`

Как `review-verify`, но возвращает только XML-артефакт issues.

```bash
npx gennady review-issues
npx gennady review-issues --ref=group/project!123
```

**Опции:** те же, что у `review-verify`.

---

### 🧠 `resolve-conflicts`

Собирает prompt для AI-разрешения merge-конфликтов с ветвлением по confidence (auto-resolve или диалог с оператором).

```bash
# Нужно активное merge-состояние и конфликтующие файлы
npx gennady resolve-conflicts

# Опциональные override-метки веток
npx gennady resolve-conflicts --branch=main --incoming=feature/refactor-x
```

**Опции:**

- `--branch`, `-b`: override для current branch label
- `--incoming`: override для incoming branch label

Важно: команда **не делает** `git commit`, она печатает prompt.

---

### 💬 `vcs-reply`

Постинг ответов в GitLab MR discussions из JSON-массива через `stdin`.

```bash
echo '[{"discussionId":"123","body":"✅ Fixed"}]' | \
  npx gennady vcs-reply --project=group/project --iid=123

# Проверка без отправки
echo '[{"discussionId":"123","body":"✅ Fixed"}]' | \
  npx gennady vcs-reply --project=group/project --iid=123 --dry-run
```

**Опции:**

- `--project`: путь GitLab-проекта
- `--iid`: IID merge request
- `--dry-run`, `--dry`: не отправлять, только показать dry-run вывод

**Формат stdin:**

```json
[{ "discussionId": "<discussion-id>", "body": "<reply markdown>" }]
```

---

### 🧹 `lint`

Валидация TypeScript-файлов: file-header, anchors, DbC-контракты, invariant-count.

```bash
npx gennady lint ./src
npx gennady lint --staged
npx gennady lint ./src --autofix --verbose
```

**Опции:**

- `--autofix`: автоисправление DbC-контрактов
- `--staged`: только staged и untracked `.ts` (взаимоисключающий с путями)
- `--verbose`, `-v`: debug-логи
- `--max-invariants`: макс. инвариантов на сущность (по умолчанию 3)
- `--exclude`: исключить файлы по glob (повторяемый)

---

### 🗯️ `alt-opinion`

Мульти-модельные мнения с опциональным синтезом.

```bash
# Мнение двух моделей с синтезом
npx gennady alt-opinion \
  --model="llmproxy/kimi-k2.6" \
  --model="llmproxy/glm-5.1" \
  --synthModel="llmproxy/deepseek-v4-pro" \
  --file="./spec.md"

# Через stdin
cat spec.md | npx gennady alt-opinion \
  --model="llmproxy/gpt-4o" \
  --model="openrouter/claude-sonnet"
```

**Опции:**

- `--model`: дескриптор модели `provider/model[::prompt.md]` (повторяемый)
- `--synthModel`: модель-синтезатор
- `--file`: путь к входному файлу
- `--modelPrompt`: промпт для всех моделей
- `--synthPrompt`: промпт для синтезатора
- `--strict`: exit 1 при ошибке любой модели

---

### 🔄 `sync`

Синхронизация `ai/directives/` из npm-пакета в текущий проект.

```bash
npx gennady sync
npx gennady sync --dry-run
npx gennady sync ts-patterns typescript --dry-run
```

**Опции:**

- `--dry-run`: предпросмотр без записи

---

### 🔄 `sync-skills`

Синхронизация SDD-навыков из `ai/skills/` в `.claude/skills/` проекта.

```bash
npx gennady sync-skills
npx gennady sync-skills --dry-run
npx gennady sync-skills sdd-execute
```

**Опции:**

- `--dry-run`: предпросмотр без записи

---

### 🧭 `orient`

Навигация по проекту: file-header разметка, DBC-контракты, граф зависимостей.

```bash
npx gennady orient                          # карта проекта
npx gennady orient --task=TSK-03            # файлы задачи
npx gennady orient --consumer=DbcTsLinter   # кто потребляет модуль
npx gennady orient --file=path/to/file.ts   # детальный просмотр
npx gennady orient --graph                  # граф зависимостей
npx gennady orient --specs                  # обзор спек
```

**Опции:**

- `--file`, `--task`, `--consumer`, `--entity`: поиск по атрибутам
- `--graph`, `--specs`: обзорные режимы
- `--fuzzy`, `--detail`, `--depth`, `--max-results`: настройки вывода

---

### 📋 `agents-rules`

Выводит инструкцию по `orient` для AI-агентов.

```bash
npx gennady agents-rules
```

---

### 🖥️ `remote-console`

Зеркалирование браузерной консоли в локальный stdout.

```bash
npx gennady remote-console
npx gennady remote-console --port=8080
npx gennady remote-console --url="https://example.com"
```

**Опции:**

- `--port`, `-p`: порт (по умолчанию 43001)
- `--host`: хост (по умолчанию localhost)
- `--url`: URL страницы для открытия с активацией

---

Подробнее: [`cli/cmd/README.md`](cli/cmd/README.md).

---

## 🛠️ Типовые сценарии

### 1. Сделать коммит

```bash
npx gennady commit
npx gennady commit --mode=oneline --apply --task=TSK-42
```

### 2. Проверить качество кода

```bash
npx gennady lint ./src
npx gennady lint --staged --autofix
```

### 3. Навигация по проекту

```bash
npx gennady orient                    # карта
npx gennady orient --task=TSK-03      # файлы задачи
npx gennady orient --graph            # граф зависимостей
npx gennady agents-rules              # инструкция для AGENTS.md
```

### 4. Верификация MR

```bash
export GITLAB_PERSONAL_TOKEN="<token>"
npx gennady review-verify --ref=group/project!123
```

### 5. AI-ревью изменений

```bash
npx gennady review
npx gennady review --branch=develop
```

### 6. Разрешение merge-конфликтов

```bash
git merge feature/some-branch
# если есть конфликты
npx gennady resolve-conflicts
```

### 7. Собрать файлы для AI

```bash
npx gennady cat "./src/**/*.ts" --output=md --plain | pbcopy
```

### 8. Синхронизация директив и навыков

```bash
npx gennady sync
npx gennady sync-skills
```

### 9. Мульти-модельный анализ

```bash
npx gennady alt-opinion \
  --model="llmproxy/kimi-k2.6" \
  --model="llmproxy/glm-5.1" \
  --synthModel="llmproxy/deepseek-v4-pro" \
  --file="./spec.md"
```

### 10. Зеркалирование консоли браузера

```bash
npx gennady remote-console
```
