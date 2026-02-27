# AGENTS — Router

## 1. Project description

*(Обновляется по мере развития проекта; агент должен ориентироваться на этот блок.)*

- **Цель**: инструмент для агентов (удобный, максимально lazy). Код в `src`, чистая архитектура.
- **Стек**: JavaScript 2025+, Node.js 22+. Зависимости только dev; подключение через утилиту вида `npmImport("name")` (проверка `node_modules` → установка при отсутствии → импорт).
- **Документация правил**: по задаче агент идёт по дереву ниже и открывает нужный flow-файл в `.ai/flow/`.

---

## 2. Table of contents (flow tree)

Дерево от задачи к документу. Выполняешь задачу — открой указанный flow и следуй ему.

```
AGENTS.md (ты здесь)
│
├── code
│   ├── Логирование (logger, формат сообщений, message vs detail, time)
│   │   → .ai/flow/code/logging.md
│   ├── Ошибки (throw, rethrow, anchor, cause)
│   │   → .ai/flow/code/errors.md
│   └── JSDoc-контракты (экспорт, теги, порядок)
│       → .ai/fw-draft/rules/dev/typescript/contacts.xml
│
└── (далее: deps flow при появлении правил)
```

---

## 3. By trigger (quick lookup)

| Задача агента | Читать |
|---------------|--------|
| Логирование в коде (console, logger) | [.ai/flow/code/logging.md](.ai/flow/code/logging.md) |
| Ошибки: throw, rethrow, формат Error | [.ai/flow/code/errors.md](.ai/flow/code/errors.md) |
| JSDoc-контракты (экспорт, @purpose, @param, @returns, порядок тегов) | [.ai/fw-draft/rules/dev/typescript/contacts.xml](.ai/fw-draft/rules/dev/typescript/contacts.xml) |
| Добавление/изменение CLI-команды (help, switch, таблица команд) | §4 ниже + [cli/AGENTS.md](cli/AGENTS.md) |

---

## 4. Структура и навигация

Как устроен проект и как по нему двигаться — одно: код в `src/` (домены) и `cli/` (команды); навигация по нему — дерево AGENTS.md в папках (продолжение этого документа, глубина любая). Зашёл в папку → открывай её AGENTS.md.

- **Точки входа**: `cli/gennady.js` + `cli/cmd/*` (commit, review, cat, agent, vcs-reply, review-verify). Код доменов в `src/`, CLI только вызывает их. Старт: [src/AGENTS.md](src/AGENTS.md), [cli/AGENTS.md](cli/AGENTS.md).
- **Help и список команд**: при добавлении/удалении/переименовании команды обновить в одном заходе: (1) блок `Commands:` и при необходимости `Examples:` в `cli/gennady.js`, (2) switch в том же файле, (3) таблицу команд в [cli/AGENTS.md](cli/AGENTS.md). Иначе help и реальный роутинг разъедутся.
- **Домены в `src/`**: каждый домен — отдельная папка; в ней свой AGENTS.md. Именование: одно слово (`ai`, `git`, `rc`) или kebab (`commit-gen`, `review-gen`, `cat-gen`). Новый домен — отдельная папка, тот же стиль.
- **review-verifier**: реализация команды в `cli/cmd/review-verify/`; в `src/review-verifier/` только `README.arch.md` (архитектура/требования). Не искать код домена в src.
- **utils** (`src/utils/`): общие хелперы (exec, files, logger, parse-args, style, xml, language, tokens, think, unguard). Доменная логика — в доменах (ai, git, commit-gen, …), не в utils.

---

## 5. What exists (implementation pointers)

*(Ссылки на реализацию; дополняем по мере развития.)*

- **Логирование и ошибки**: правила в flow (см. таблицу выше). Логгер — один на проект: `src/utils/logger.js`; импортировать его, не объявлять `const logger = console` в модулях.
- **Deps (ленивый импорт)**: `src/deps/npm-import.js` (фасад `npmImport`), `find-package-root.js`, `npm-install.js`. Установка пакета — только в `node_modules`, **без изменения package.json**: `npm install <specifier> --no-save`.
- **Контракты**: экспортируемые сущности оформлять по `.ai/fw-draft/rules/dev/typescript/contacts.xml` (порядок: @purpose → @consumer → @pre → @param → @throws → @returns → @sideEffect).
