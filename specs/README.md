# Gennady

## Vision

CLI-инструмент для AI-агентов: работа с git-изменениями, merge-конфликтами и GitLab review-пайплайном. Чистая архитектура, zero runtime deps, бандлится в чанки (Vite).

## Scope Graph

```mermaid
graph TD
    cli --> dbc
    cli --> infra-base
    cli --> vcs
    cli --> shared
    dbc --> infra-base
    vcs --> infra-base
    agent-mon --> infra-base
    agent-mon-cli --> infra-base
    agent-mon-cli --> agent-mon
    agent-run --> infra-base
    cli --> agent-run
    ai-skills --> infra-base
    ai-skills --> cli
    infra-npm-publish --> infra-base
    agent-inbox --> infra-base
    agent-inbox --> vcs
    agent-inbox --> cli
    agent-inbox --> ai-skills
    shared --> infra-base
```

## Scopes

| Scope                                                                | Type           | Spec | Description                                                                                     |
| -------------------------------------------------------------------- | -------------- | ---- | ----------------------------------------------------------------------------------------------- |
| [`infra-base`](./infra-base/infra-base.spec.md)                      | infrastructure | ✅   | Node.js 22+, npm, tsc, prettier, git-hooks (pre-commit), node:test, vite                        |
| [`shared`](./shared/shared.spec.md)                                   | infrastructure | ✅   | Фундаментальный слой: logger, parse-args, exec, files, style, xml, tokens, think, git-core      |
| [`cli`](./cli/cli.spec.md)                                           | product        | ✅   | CLI-модуль: lint, alt-opinion, cat, review, run, help, orient, sync, e2e, agents-rules           |
| [`vcs`](./vcs/vcs.spec.md)                                           | product        | ✅   | VCS-клиент (GitLab + GitHub): Merge Requests, Discussions, Repository Files, Inbox (GraphQL). CLI: vcs-approve, vcs-diff, vcs-draft-note, vcs-job, vcs-job-log, vcs-pipeline, vcs-reply, vcs-todo, vcs-worktree |
| [`dbc`](./dbc/dbc.spec.md)                                           | library        | ✅   | DBC-фреймворк: парсинг и валидация текстовых контрактов                                         |
| [`agent-mon`](./agent-mon/agent-mon.spec.md)                         | library        | ✅   | Пассивный мониторинг активных сессий AI-агентов через провайдеры                                |
| [`agent-mon-cli`](./agent-mon-cli/agent-mon-cli.spec.md)             | product        | ✅   | TUI-дашборд для мониторинга сессий агентов (ink + React)                                        |
| [`infra-npm-publish`](./infra-npm-publish/infra-npm-publish.spec.md) | infrastructure | ✅   | Автоматизированная публикация npm-пакета через release-it                                       |
| [`ai-skills`](./ai-skills/ai-skills.spec.md)                         | library        | ✅   | AI-навыки для агентов: SDD-воркфлоу + alt-opinion                                               |
| [`agent-run`](./agent-run/agent-run.spec.md)                         | library        | ✅   | Запуск внешнего AI-движка (opencode первым) с заданием и директориями, readonly                 |
| [`agent-inbox`](./agent-inbox/agent-inbox.spec.md)                   | product        | 🚧   | Ассистент входящих GitLab MR: actionable-инбокс, стадии, факт-чек, ответ/ревью (research-спайк) |
