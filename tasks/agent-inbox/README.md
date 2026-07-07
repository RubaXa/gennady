# agent-inbox Cascade Table

## Tasks

| Task-ID | Status | Depends On             | Title                                                             |
| ------- | ------ | ---------------------- | ----------------------------------------------------------------- |
| TSK-80  | DONE   | —                      | Директивы agent-inbox (TYPO + suggestion + SKILL.md)              |
| TSK-90  | DONE   | —                      | Config-инфраструктура: файл + загрузка/сохранение/валидация       |
| TSK-91  | DONE   | TSK-90                 | Structured config signal в `inbox` и `inbox-context`              |
| TSK-92  | DONE   | TSK-90                 | Подкоманда `gennady inbox config`                                 |
| TSK-93  | DONE   | —                      | Worktree reuse + 7-дневный TTL (без явной очистки агентом)        |
| TSK-94  | DONE   | TSK-91                 | inbox-context format v2 + дельта коммитов                         |
| TSK-95  | DONE   | —                      | Unified `--url` interface + удаление legacy команд из SKILL.md    |
| TSK-96  | DONE   | TSK-95                 | `vcs-discussions` фильтры `--my` и `--with-drafts`                |
| TSK-97  | DONE   | TSK-95                 | `vcs-draft-note --delete-all`                                     |
| TSK-98  | DONE   | TSK-94, TSK-96         | Директива `update-review.directive.xml`                           |
| TSK-99  | DONE   | TSK-96, TSK-98         | Self-review author + ReactionMatrix                               |
| TSK-100 | DONE   | TSK-95                 | Валидация постинга в `vcs-reply`                                  |
| TSK-101 | DONE   | —                      | Защита от prompt injection + AX_UNTRUSTED_MR_CONTENT              |
| TSK-102 | DONE   | TSK-91, TSK-94, TSK-95 | `inbox-review-plan` command + `H_NO_REVIEW_PLAN` gate             |
| TSK-103 | DONE   | TSK-102                | `inbox-review-plan --scaffold`/`--validate`: документный конвейер |
| TSK-104 | TODO   | TSK-103                | Документный конвейер в скиллах + пивот «ничего на диск»           |

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
```
