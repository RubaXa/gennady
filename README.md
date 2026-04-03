## 🤖 Gennadyᵇᵉᵗᵃ 🗯️

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
```

**Опции:**

- `--output`, `-o`: `xml` (по умолчанию) или `md`
- `--plain`: без ANSI-цветов
- `--exclude`, `-e`: исключить паттерны
- `--ext`: фильтр по расширениям

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

## 🛠️ Типовые сценарии

### 1. Верификация MR

```bash
export GITLAB_PERSONAL_TOKEN="<token>"
npx gennady review-verify --ref=group/project!123
```

### 2. Разрешение merge-конфликтов

```bash
git merge feature/some-branch
# если есть конфликты
npx gennady resolve-conflicts
```
