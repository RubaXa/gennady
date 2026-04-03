# AGENTS — cli (продолжение корневого)

**Точка входа:** [gennady.ts](gennady.ts) — разбор команды и динамический импорт из `cmd/`.

**Команды (cmd/):** каждая команда — папка `cmd/<name>/` с `index.ts` и `<name>.cmd.ts`. При добавлении/изменении команды синхронно обновить: help в [gennady.ts](gennady.ts) (блок Commands + switch) и эту таблицу.

| Команда           | Папка                                            | Назначение                                                         |
| ----------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| commit            | [cmd/commit/](cmd/commit/)                       | Генерация commit из staged → cli/utils/commit-gen                  |
| cat               | [cmd/cat/](cmd/cat/)                             | Вывод файлов XML/MD → cli/utils/cat-gen                            |
| agent             | [cmd/agent/](cmd/agent/)                         | AI agent request → cli/utils/ai-legacy                             |
| vcs-reply         | [cmd/vcs-reply/](cmd/vcs-reply/)                 | Постинг ответов в GitLab MR discussions                            |
| review-verify     | [cmd/review-verify/](cmd/review-verify/)         | Верификация по MR (общий core: [cmd/review/](cmd/review/))         |
| review-issues     | [cmd/review-issues/](cmd/review-issues/)         | XML-артефакт issues по MR (общий core: [cmd/review/](cmd/review/)) |
| resolve-conflicts | [cmd/resolve-conflicts/](cmd/resolve-conflicts/) | Генерация prompt для confidence-aware разрешения merge-конфликтов  |

**cli/utils/**: commit-gen, review-gen, cat-gen, prompts, ai-legacy, review-verifier (README.arch). Импорты из `shared/`, `services/`.

Вверх: [AGENTS.md](../AGENTS.md).
