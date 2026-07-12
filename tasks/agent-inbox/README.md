# agent-inbox Cascade Table

## Tasks

| Task-ID | Status | Depends On              | Title                                                                                      |
| ------- | ------ | ----------------------- | ------------------------------------------------------------------------------------------ |
| TSK-80  | DONE   | —                       | Директивы agent-inbox (TYPO + suggestion + SKILL.md)                                       |
| TSK-90  | DONE   | —                       | Config-инфраструктура: файл + загрузка/сохранение/валидация                                |
| TSK-91  | DONE   | TSK-90                  | Structured config signal в `inbox` и `inbox-context`                                       |
| TSK-92  | DONE   | TSK-90                  | Подкоманда `gennady inbox config`                                                          |
| TSK-93  | DONE   | —                       | Worktree reuse + 7-дневный TTL (без явной очистки агентом)                                 |
| TSK-94  | DONE   | TSK-91                  | inbox-context format v2 + дельта коммитов                                                  |
| TSK-95  | DONE   | —                       | Unified `--url` interface + удаление legacy команд из SKILL.md                             |
| TSK-96  | DONE   | TSK-95                  | `vcs-discussions` фильтры `--my` и `--with-drafts`                                         |
| TSK-97  | DONE   | TSK-95                  | `vcs-draft-note --delete-all`                                                              |
| TSK-98  | DONE   | TSK-94, TSK-96          | Директива `update-review.directive.xml`                                                    |
| TSK-99  | DONE   | TSK-96, TSK-98          | Self-review author + ReactionMatrix                                                        |
| TSK-100 | DONE   | TSK-95                  | Валидация постинга в `vcs-reply`                                                           |
| TSK-101 | DONE   | —                       | Защита от prompt injection + AX_UNTRUSTED_MR_CONTENT                                       |
| TSK-102 | DONE   | TSK-91, TSK-94, TSK-95  | `inbox-review-plan` command + `H_NO_REVIEW_PLAN` gate                                      |
| TSK-103 | DONE   | TSK-102                 | `inbox-review-plan --scaffold`/`--validate`: документный конвейер                          |
| TSK-104 | DONE   | TSK-103                 | Документный конвейер в скиллах + пивот «ничего на диск»                                    |
| TSK-105 | DONE   | TSK-109                 | inbox-mocks: фабрики мок-данных                                                            |
| TSK-106 | REOPEN | TSK-105                 | inbox-api: + artifact endpoints, generic action (пивот D-86)                               |
| TSK-107 | REOPEN | TSK-105, TSK-106        | inbox-dashboard: + браузер артефактов, ActionPanel (пивот D-86)                            |
| TSK-108 | DONE   | TSK-107, TSK-114        | inbox-dashboard: e2e тесты (Playwright)                                                    |
| TSK-109 | DONE   | TSK-90–TSK-94 (DONE)    | inbox-core: перенос CLI-логики состояния в модуль + AuditLog                               |
| TSK-110 | DONE   | TSK-109                 | inbox-core: VcsInboxPort + Mock + Real                                                     |
| TSK-111 | REOPEN | TSK-105                 | inbox-opencode: + агентный режим (tools, toolCalls, минуты)                                |
| TSK-112 | REOPEN | TSK-111                 | inbox-opencode: OpenCodeReal агентная сессия + tool-call лог                               |
| TSK-113 | REOPEN | TSK-109,110,111,116     | inbox-roles: reviewer-граф (3 ветки), thread-механика, дедуп, effect-executor (пивот D-86) |
| TSK-114 | DONE   | TSK-105, TSK-107        | inbox-visual-testing: ARIA snapshots + layout helpers                                      |
| TSK-115 | DONE   | TSK-106,109,110,111,113 | inbox-serve: entry point + DI bootstrap + OpenCode spawn                                   |
| TSK-116 | DONE   | —                       | services/ai-kit: компиляция system prompt из AIKit-директив                                |
| TSK-117 | TODO   | TSK-115                 | inbox-serve: real-smoke (ручной golden-прогон)                                             |

> **Пивот D-86 (reviewer-флоу = паритет с CLI).** Спеки — канон. REOPEN-задачи выполняются
> заново по обновлённым спекам: inbox-roles (три ветки графа, prep-узел, ArtifactValidator,
> EffectExecutor, agent-proposes-engine-acts), inbox-opencode (агентная сессия + tool-call лог),
> inbox-api (artifact endpoints), inbox-dashboard (браузер артефактов + ActionPanel).
> Порядок: 111→112, 116→113, 106→107; TSK-117 (golden-прогон) — финал.

## Dependency Graph

```
TSK-80 ───────────────────────── DONE
TSK-90 ──┬── TSK-91 ── TSK-94 ──┬── TSK-98 ── TSK-99
         └── TSK-92             │              │
TSK-93 ─────────────────────────┤              │
TSK-95 ──┬── TSK-96 ────────────┤              │
         ├── TSK-97             │              │
         └── TSK-100            │              │
TSK-101 ────────────────────────┘              │
TSK-102 ── (TSK-91, TSK-94, TSK-95) ──────────┘
TSK-102 ── TSK-103 ── TSK-104 (документный конвейер)

=== Serve Mode (new) ===
TSK-109 (core state — перенос CLI) ── TSK-105 (mocks) ──┬── TSK-106 (api) ── TSK-107 (dashboard + harness) ── TSK-108 (e2e)
                                                         ├── TSK-111 (opencode mock) ── TSK-112 (opencode real)
                                                         └── TSK-114 (visual-testing) ────────────────┘
TSK-109 ── TSK-110 (VCS)

TSK-116 (ai-kit) ── TSK-113 (roles) ← TSK-109, TSK-110, TSK-111

TSK-115 (serve bootstrap) ← TSK-106,109,110,111,113
TSK-117 (real-smoke) ← TSK-115
```
