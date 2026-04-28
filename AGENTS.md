# AGENTS — Router

## Project description

_(Обновляется по мере развития проекта; агент должен ориентироваться на этот блок.)_

- **Цель**: инструмент для агентов (удобный, максимально lazy). Чистая архитектура.
- **Стек**: TypeScript 5+, Node.js 22+. Зависимости только dev; всё бандлится в чанки (Vite).

---

## Структура и навигация

- **shared/** — общее: `common/` (logger, exec, files, style, xml, parse-args, language, tokens, think, unguard), `backend/` (git, rc).
- **services/** — сервисы (vcs-client).
- **cli/** — команды: `gennady.ts`, `cmd/*`, `utils/*` (commit-gen, review-gen, cat-gen, prompts, ai-legacy) в [cli/AGENTS.md](cli/AGENTS.md).

---

## MANDATORY HANDOFF PROTOCOL (`@Agent`)

Если пользователь вызывает конкретного агента через `@AgentName`:

1. Родительский процесс не выполняет pre-read/pre-check целевого артефакта.
2. Запрещено в родителе до ответа сабагента:

- `read_file`, `cat`, `sed`, `rg`, `ls` по целевому пути,
- запуск parser/validator (включая `xmllint`) по целевому пути,
- самостоятельный анализ содержимого, который должен делать сабагент.

3. Родитель делает только:

- нормализацию интента (без чтения файла),
- spawn нужного сабагента,
- wait результата,
- relay результата пользователю.

4. Исключение только одно: пользователь явно просит родителя прочитать файл в текущей сессии.

Цель: не засорять контекст главной сессии и не тратить токены на дублирующий анализ.

Для `@PromptAuditor` дополнительно обязательно:

- передавать в handoff требование `Runtime Proof` (core_loaded + loaded_files с абсолютными путями),
- если `Runtime Proof` не подтверждён, считать запуск невалидным и вернуть `BLOCKED`.

---

## Naming rules (review core)

- Для review-домена использовать именование сущностей и файлов в стиле `Review[(Context)?Name]`.
- Примеры сущностей: `ReviewIntent`, `ReviewContextGit`, `ReviewContextMr`, `ReviewArtifact`, `ReviewCommandResult`.
- Типы хранить только как отдельные файлы `*.type.ts` в `types/` (например: `review-intent.type.ts`, `review-context-git.type.ts`).
- Не использовать агрегирующие `types.ts` для review core.

---

## By trigger (quick lookup)

Открывай нужный файл и следуй инструкциям в зависимости от твоей задачи.

| Задача агента                                                    | Читать                                                                                                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Логирование в коде (console, logger)                             | [.ai/flow/code/logging.md](.ai/flow/code/logging.md)                                                                                         |
| Ошибки: throw, rethrow, формат Error                             | [.ai/flow/code/errors.md](.ai/flow/code/errors.md)                                                                                           |
| TypeScript: enum, private, конструктор                           | [.ai/flow/code/typescript.md](.ai/flow/code/typescript.md)                                                                                   |
| JSDoc-контракты (экспорт, `@implements`, `@see`, порядок тегов)  | [.ai/agents/agent-typescript-devgen.xml#AXIOM_JSDOC_AS_CONTRACTS](.ai/agents/agent-typescript-devgen.xml#AXIOM_JSDOC_AS_CONTRACTS)           |
| Добавление/изменение CLI-команды (help, switch, таблица команд)  | §4 ниже + [cli/AGENTS.md](cli/AGENTS.md)                                                                                                     |
| TypeScript native patterns (enum, namespace, constructor params) | [.ai/agents/agent-typescript-devgen.xml#AXIOM_TS_NATIVE_PATTERNS](.ai/agents/agent-typescript-devgen.xml#AXIOM_TS_NATIVE_PATTERNS)           |
| Teleological naming (intent over pattern)                        | [.ai/agents/agent-typescript-devgen.xml#AXIOM_TELEOLOGICAL_NAMING](.ai/agents/agent-typescript-devgen.xml#AXIOM_TELEOLOGICAL_NAMING)         |
| Error handling with anchors & cause chaining                     | [.ai/agents/agent-typescript-devgen.xml#AXIOM_ERROR_WITH_ANCHORS](.ai/agents/agent-typescript-devgen.xml#AXIOM_ERROR_WITH_ANCHORS)           |
| Structured logging (logger, state transitions)                   | [.ai/agents/agent-typescript-devgen.xml#AXIOM_LOG_DRIVEN_DEVELOPMENT](.ai/agents/agent-typescript-devgen.xml#AXIOM_LOG_DRIVEN_DEVELOPMENT)   |
| Structural anchors (START*/END* blocks)                          | [.ai/agents/agent-typescript-devgen.xml#AXIOM_STRUCTURAL_ANCHORS](.ai/agents/agent-typescript-devgen.xml#AXIOM_STRUCTURAL_ANCHORS)           |
| AI-to-AI comments (why over what)                                | [.ai/agents/agent-typescript-devgen.xml#AXIOM_AI_TO_AI_COMMENTS](.ai/agents/agent-typescript-devgen.xml#AXIOM_AI_TO_AI_COMMENTS)             |
| JSDoc contracts (tag order, purpose, consumer)                   | [.ai/agents/agent-typescript-devgen.xml#AXIOM_JSDOC_AS_CONTRACTS](.ai/agents/agent-typescript-devgen.xml#AXIOM_JSDOC_AS_CONTRACTS)           |
| Macro anchors & comments example                                 | [.ai/agents/agent-typescript-devgen.xml#EX_MACRO_ANCHORS_AND_COMMENTS](.ai/agents/agent-typescript-devgen.xml#EX_MACRO_ANCHORS_AND_COMMENTS) |
| JSDoc data type example                                          | [.ai/agents/agent-typescript-devgen.xml#EX_JSDOC_DATA_TYPE](.ai/agents/agent-typescript-devgen.xml#EX_JSDOC_DATA_TYPE)                       |
| JSDoc service contract example                                   | [.ai/agents/agent-typescript-devgen.xml#EX_JSDOC_SERVICE_CONTRACT](.ai/agents/agent-typescript-devgen.xml#EX_JSDOC_SERVICE_CONTRACT)         |
| JSDoc implementation example                                     | [.ai/agents/agent-typescript-devgen.xml#EX_JSDOC_IMPLEMENTATION](.ai/agents/agent-typescript-devgen.xml#EX_JSDOC_IMPLEMENTATION)             |
| Minimal logging example                                          | [.ai/agents/agent-typescript-devgen.xml#EX_LOGGING_MINIMAL](.ai/agents/agent-typescript-devgen.xml#EX_LOGGING_MINIMAL)                       |
| Logging branch decision example                                  | [.ai/agents/agent-typescript-devgen.xml#EX_LOGGING_BRANCH_DECISION](.ai/agents/agent-typescript-devgen.xml#EX_LOGGING_BRANCH_DECISION)       |
| Expressive terseness example                                     | [.ai/agents/agent-typescript-devgen.xml#EX_EXPRESSIVE_TERSENESS](.ai/agents/agent-typescript-devgen.xml#EX_EXPRESSIVE_TERSENESS)             |
| Trace prefix definition                                          | [.ai/agents/agent-typescript-devgen.xml#DEF_TRACE_PREFIX](.ai/agents/agent-typescript-devgen.xml#DEF_TRACE_PREFIX)                           |

---

## What exists (implementation pointers)

- **Логирование и ошибки**: правила в flow. Логгер — `#logger` (мапится на `service/logger/logger.ts`).
- **Контракты**: экспортируемые сущности и implementation-linking rules по `.ai/agents/agent-typescript-devgen.xml#AXIOM_JSDOC_AS_CONTRACTS`.
- **Сборка**: `npm run build` (Vite) → `dist/` с чанками.
- **Форматирование**: Prettier (2 пробела, singleQuote, trailingComma es5). `npm run format`, `npm run format:check`. Конфиг `.prettierrc.json`.
- **Аксиомы и примеры TypeScript**: правила и примеры в `.ai/agents/agent-typescript-devgen.xml` (AXIOM_TS_NATIVE_PATTERNS, AXIOM_TELEOLOGICAL_NAMING, AXIOM_ERROR_WITH_ANCHORS, AXIOM_LOG_DRIVEN_DEVELOPMENT, AXIOM_STRUCTURAL_ANCHORS, AXIOM_AI_TO_AI_COMMENTS, AXIOM_JSDOC_AS_CONTRACTS и др.).
- **Определения**: Trace-Prefix и другие определения — `.ai/agents/agent-typescript-devgen.xml#DEF_TRACE_PREFIX`.
