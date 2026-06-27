# AGENTS — cli (продолжение корневого)

**Точка входа:** [gennady.ts](gennady.ts) — разбор команды и динамический импорт из `cmd/`.

**Команды (cmd/):** каждая команда — папка `cmd/<name>/` с `index.ts`, `<name>.cmd.ts`. Единый `cmd/README.md` содержит use cases и таблицу команд. При добавлении/изменении команды синхронно обновить: `cmd/README.md`, help в [gennady.ts](gennady.ts) (блок Commands + switch) и эту таблицу.

| Команда           | Папка                                            | Назначение                                                                          |
| ----------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| commit            | [cmd/commit/](cmd/commit/)                       | Генерация commit из staged → cli/utils/commit-gen                                   |
| cat               | [cmd/cat/](cmd/cat/)                             | Вывод файлов XML/MD → cli/utils/cat-gen                                             |
| review            | [cmd/review/](cmd/review/)                       | Ревью staged изменений через AI-модели                                              |
| vcs-reply         | [cmd/vcs-reply/](cmd/vcs-reply/)                 | Постинг ответов в GitLab MR discussions                                             |
| vcs-draft-note         | [cmd/vcs-draft-note/](cmd/vcs-draft-note/)                 | Управление черновиками (draft notes) в GitLab MR                                    |
| vcs-approve       | [cmd/vcs-approve/](cmd/vcs-approve/)             | Approve GitLab MR через API                                                         |
| review-verify     | [cmd/review-verify/](cmd/review-verify/)         | Верификация по MR (общий core: [cmd/review/](cmd/review/))                          |
| review-issues     | [cmd/review-issues/](cmd/review-issues/)         | XML-артефакт issues по MR (общий core: [cmd/review/](cmd/review/))                  |
| resolve-conflicts | [cmd/resolve-conflicts/](cmd/resolve-conflicts/) | Генерация prompt для confidence-aware разрешения merge-конфликтов                   |
| remote-console    | [cmd/remote-console/](cmd/remote-console/)       | Проксирование browser console в локальный stdout через HTTP sink                    |
| lint              | [cmd/lint/](cmd/lint/)                           | Линтинг .ts файлов — file header, anchors, DbC контракты                            |
| alt-opinion       | [cmd/alt-opinion/](cmd/alt-opinion/)             | Получение альтернативных мнений от AI-моделей с опциональным синтезом               |
| sync              | [cmd/sync/](cmd/sync/)                           | Синхронизация ai/directives/ из npm-пакета в текущий проект                         |
| sync-skills       | [cmd/sync-skills/](cmd/sync-skills/)             | Sync SDD skills from ai/skills/ to .claude/skills/                                  |
| agent-mon         | [cmd/agent-mon/](cmd/agent-mon/)                 | Интерактивный терминальный дашборд для мониторинга AI-агентов                       |
| orient            | [cmd/orient/](cmd/orient/)                       | Навигация по file-header и DBC-контрактам — карта, поиск, граф зависимостей         |
| agents-rules      | [cmd/agents-rules/](cmd/agents-rules/)           | Вывод инструкции по orient для AI-агентов                                           |
| run               | [cmd/run/](cmd/run/)                             | Запуск задания через AI-движок (opencode) — тонкая обёртка над agent-run            |
| testcov           | [cmd/testcov/](cmd/testcov/)                     | Визуальное дерево покрытия тестами с авто-детекцией раннера (vitest/jest/node:test) |

**cli/utils/**: commit-gen, review-gen, cat-gen, prompts, ai-legacy, review-verifier (README.arch). Импорты из `shared/`, `services/`.

Вверх: [AGENTS.md](../AGENTS.md).
