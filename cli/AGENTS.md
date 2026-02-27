# AGENTS — cli (продолжение корневого)

Роутер по точкам входа и командам. CLI только вызывает код из `src/`; доменная логика не здесь.

**Точка входа:** [gennady.js](gennady.js) — разбор команды и динамический импорт из `cmd/`.

**Команды (cmd/):** каждая команда — папка `cmd/<name>/` с `index.js` и при необходимости `<name>.cmd.js` и др. При добавлении/изменении команды синхронно обновить: help в [gennady.js](gennady.js) (блок Commands + switch) и эту таблицу.

| Команда | Папка | Назначение |
|---------|-------|------------|
| commit (default) | [cmd/commit/](cmd/commit/) | Генерация commit из staged → CommitGen (src/commit-gen) |
| review | [cmd/review/](cmd/review/) | Ревью staged → review-gen |
| cat | [cmd/cat/](cmd/cat/) | Вывод файлов XML/MD → cat-gen |
| agent | [cmd/agent/](cmd/agent/) | AI agent request |
| vcs-reply | [cmd/vcs-reply/](cmd/vcs-reply/) | Постинг ответов в GitLab MR discussions |
| review-verify | [cmd/review-verify/](cmd/review-verify/) | Верификация по открытому MR (архитектура в src/review-verifier/README.arch.md) |

В подпапках cmd при необходимости могут быть свои AGENTS.md (глубина любая).

Вернуться: [корневой AGENTS.md](../AGENTS.md).
