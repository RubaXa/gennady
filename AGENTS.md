# AGENTS — Router

## Project description

_(Обновляется по мере развития проекта; агент должен ориентироваться на этот блок.)_

- **Цель**: инструмент для агентов (удобный, максимально lazy). Чистая архитектура.
- **Стек**: TypeScript 5+, Node.js 22+. Зависимости только dev; всё бандлится в чанки (Vite).

---

## By trigger (quick lookup)

Открывай нужный файл и следуй инструкциям в зависимости от твоей задачи.

| Задача агента                                                        | Читать                                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Логирование в коде (console, logger)                                 | [.ai/flow/code/logging.md](.ai/flow/code/logging.md)                                             |
| Ошибки: throw, rethrow, формат Error                                 | [.ai/flow/code/errors.md](.ai/flow/code/errors.md)                                               |
| TypeScript: enum, private, конструктор                               | [.ai/flow/code/typescript.md](.ai/flow/code/typescript.md)                                       |
| JSDoc-контракты (экспорт, @purpose, @param, @returns, порядок тегов) | [.ai/fw-draft/rules/dev/typescript/contacts.xml](.ai/fw-draft/rules/dev/typescript/contacts.xml) |
| Добавление/изменение CLI-команды (help, switch, таблица команд)      | §4 ниже + [cli/AGENTS.md](cli/AGENTS.md)                                                         |
| TypeScript native patterns (enum, namespace, constructor params)      | [.ai/components/axiom/ts-native-patterns.xml](.ai/components/axiom/ts-native-patterns.xml)       |
| Teleological naming (intent over pattern)                             | [.ai/components/axiom/teleological-naming.xml](.ai/components/axiom/teleological-naming.xml)     |
| Error handling with anchors & cause chaining                          | [.ai/components/axiom/error-with-anchors.xml](.ai/components/axiom/error-with-anchors.xml)       |
| Structured logging (logger, state transitions)                       | [.ai/components/axiom/log-driven-development.xml](.ai/components/axiom/log-driven-development.xml) |
| Structural anchors (START_/END_ blocks)                                | [.ai/components/axiom/structural-anchors.xml](.ai/components/axiom/structural-anchors.xml)         |
| AI-to-AI comments (why over what)                                    | [.ai/components/axiom/ai-to-ai-comments.xml](.ai/components/axiom/ai-to-ai-comments.xml)           |
| JSDoc contracts (tag order, purpose, consumer)                       | [.ai/components/axiom/jsdoc-as-contracts.xml](.ai/components/axiom/jsdoc-as-contracts.xml)         |
| Macro anchors & comments example                                      | [.ai/components/examples/macro-anchors-and-comments.xml](.ai/components/examples/macro-anchors-and-comments.xml) |
| JSDoc data type example                                               | [.ai/components/examples/jsdoc-data-type.xml](.ai/components/examples/jsdoc-data-type.xml)         |
| JSDoc service contract example                                        | [.ai/components/examples/jsdoc-service-contract.xml](.ai/components/examples/jsdoc-service-contract.xml) |
| JSDoc implementation example                                          | [.ai/components/examples/jsdoc-implementation.xml](.ai/components/examples/jsdoc-implementation.xml) |
| Minimal logging example                                               | [.ai/components/examples/logging-minimal.xml](.ai/components/examples/logging-minimal.xml)           |
| Logging branch decision example                                       | [.ai/components/examples/logging-branch-decision.xml](.ai/components/examples/logging-branch-decision.xml) |
| Expressive terseness example                                          | [.ai/components/examples/expressive-terseness.xml](.ai/components/examples/expressive-terseness.xml) |
| Trace prefix definition                                               | [.ai/components/definitions/trace-prefix.xml](.ai/components/definitions/trace-prefix.xml)           |

---

## Структура и навигация

- **shared/** — общее: `common/` (logger, exec, files, style, xml, parse-args, language, tokens, think, unguard), `backend/` (git, rc).
- **services/** — сервисы (vcs-client).
- **cli/** — команды: `gennady.ts`, `cmd/*`, `utils/*` (commit-gen, review-gen, cat-gen, prompts, ai-legacy).

**Точки входа**: `cli/gennady.ts` + `cli/cmd/*`. CLI вызывает `cli/utils/*`, `shared/*`, `services/*`. Старт: [shared/AGENTS.md](shared/AGENTS.md), [cli/AGENTS.md](cli/AGENTS.md).

**Help и список команд**: при добавлении/удалении/переименовании команды обновить: (1) блок `Commands:` в `cli/gennady.ts`, (2) switch, (3) таблицу в [cli/AGENTS.md](cli/AGENTS.md).

**review-verifier**: реализация в `cli/cmd/review-verify/`; архитектура в `cli/utils/review-verifier/README.arch.md`.

---

## What exists (implementation pointers)

- **Логирование и ошибки**: правила в flow. Логгер — `shared/common/logger.ts`.
- **Контракты**: экспортируемые сущности по `.ai/fw-draft/rules/dev/typescript/contacts.xml`.
- **Сборка**: `npm run build` (Vite) → `dist/` с чанками.
- **Форматирование**: Prettier (2 пробела, singleQuote, trailingComma es5). `npm run format`, `npm run format:check`. Конфиг `.prettierrc.json`.
- **Аксиомы и примеры TypeScript**: правила и примеры в `.ai/components/axiom/` и `.ai/components/examples/` (ts-native-patterns, teleological-naming, error-with-anchors, log-driven-development, structural-anchors, ai-to-ai-comments, jsdoc-as-contracts и др.).
- **Определения**: Trace-Prefix и другие определения — `.ai/components/definitions/trace-prefix.xml`.
