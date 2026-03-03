# AGENTS — Router

## 1. Project description

_(Обновляется по мере развития проекта; агент должен ориентироваться на этот блок.)_

- **Цель**: инструмент для агентов (удобный, максимально lazy). Чистая архитектура.
- **Стек**: TypeScript 5+, Node.js 22+. Зависимости только dev; всё бандлится в чанки (Vite).
- **Документация правил**: по задаче агент идёт по дереву ниже и открывает нужный flow-файл в `.ai/flow/`.

---

## 2. Table of contents (flow tree)

```
AGENTS.md (ты здесь)
│
├── code
│   ├── Логирование (logger, формат сообщений, message vs detail, time)
│   │   → .ai/flow/code/logging.md
│   ├── Ошибки (throw, rethrow, anchor, cause)
│   │   → .ai/flow/code/errors.md
│   ├── TypeScript (enum, private, конструктор, protected _field)
│   │   → .ai/flow/code/typescript.md
│   └── JSDoc-контракты (экспорт, теги, порядок)
│       → .ai/fw-draft/rules/dev/typescript/contacts.xml
│
└── (далее: flow при появлении правил)
```

---

## 3. By trigger (quick lookup)

| Задача агента                                                        | Читать                                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Логирование в коде (console, logger)                                 | [.ai/flow/code/logging.md](.ai/flow/code/logging.md)                                             |
| Ошибки: throw, rethrow, формат Error                                 | [.ai/flow/code/errors.md](.ai/flow/code/errors.md)                                               |
| TypeScript: enum, private, конструктор                               | [.ai/flow/code/typescript.md](.ai/flow/code/typescript.md)                                       |
| JSDoc-контракты (экспорт, @purpose, @param, @returns, порядок тегов) | [.ai/fw-draft/rules/dev/typescript/contacts.xml](.ai/fw-draft/rules/dev/typescript/contacts.xml) |
| Добавление/изменение CLI-команды (help, switch, таблица команд)      | §4 ниже + [cli/AGENTS.md](cli/AGENTS.md)                                                         |

---

## 4. Структура и навигация

- **shared/** — общее: `common/` (logger, exec, files, style, xml, parse-args, language, tokens, think, unguard), `backend/` (git, rc).
- **services/** — сервисы (vcs-client).
- **cli/** — команды: `gennady.ts`, `cmd/*`, `utils/*` (commit-gen, review-gen, cat-gen, prompts, ai-legacy).

**Точки входа**: `cli/gennady.ts` + `cli/cmd/*`. CLI вызывает `cli/utils/*`, `shared/*`, `services/*`. Старт: [shared/AGENTS.md](shared/AGENTS.md), [cli/AGENTS.md](cli/AGENTS.md).

**Help и список команд**: при добавлении/удалении/переименовании команды обновить: (1) блок `Commands:` в `cli/gennady.ts`, (2) switch, (3) таблицу в [cli/AGENTS.md](cli/AGENTS.md).

**review-verifier**: реализация в `cli/cmd/review-verify/`; архитектура в `cli/utils/review-verifier/README.arch.md`.

---

## 5. What exists (implementation pointers)

- **Логирование и ошибки**: правила в flow. Логгер — `shared/common/logger.ts`.
- **Контракты**: экспортируемые сущности по `.ai/fw-draft/rules/dev/typescript/contacts.xml`.
- **Сборка**: `npm run build` (Vite) → `dist/` с чанками.
- **Форматирование**: Prettier (2 пробела, singleQuote, trailingComma es5). `npm run format`, `npm run format:check`. Конфиг `.prettierrc.json`.
