# agent-inbox Cascade Table

## Tasks

| Task-ID | Status | Depends On     | Title                                                          |
| ------- | ------ | -------------- | -------------------------------------------------------------- |
| TSK-80  | DONE   | —              | Директивы agent-inbox (TYPO + suggestion + SKILL.md)           |
| TSK-90  | DONE   | —              | Config-инфраструктура: файл + загрузка/сохранение/валидация    |
| TSK-91  | TODO   | TSK-90         | Structured config signal в `inbox` и `inbox-context`           |
| TSK-92  | TODO   | TSK-90         | Подкоманда `gennady inbox config`                              |
| TSK-93  | TODO   | —              | Worktree reuse + 7-дневный TTL (без явной очистки агентом)     |
| TSK-94  | TODO   | TSK-91         | inbox-context format v2 + дельта коммитов                      |
| TSK-95  | TODO   | —              | Unified `--url` interface + удаление legacy команд из SKILL.md |
| TSK-96  | TODO   | TSK-95         | `vcs-discussions` фильтры `--my` и `--with-drafts`             |
| TSK-97  | TODO   | TSK-95         | `vcs-draft-note --delete-all`                                  |
| TSK-98  | TODO   | TSK-94, TSK-96 | Директива `update-review.directive.xml`                        |
| TSK-99  | TODO   | TSK-96, TSK-98 | Self-review author + ReactionMatrix                            |
| TSK-100 | TODO   | TSK-95         | Валидация постинга в `vcs-reply`                               |
| TSK-101 | DONE   | —              | Защита от prompt injection + AX_UNTRUSTED_MR_CONTENT           |

## Dependency Graph

```
TSK-80 ───────────────────────── DONE
TSK-90 ──┬── TSK-91 ── TSK-94 ──┬── TSK-98 ── TSK-99
         └── TSK-92             │
TSK-93 ─────────────────────────┤
TSK-95 ──┬── TSK-96 ────────────┤
         ├── TSK-97             │
         └── TSK-100            │
TSK-101 ────────────────────────┘
```

## Execution Order (topological)

1. **Batch 1** (no deps): TSK-90, TSK-93, TSK-95
2. **Batch 2** (deps on batch 1): TSK-91, TSK-92, TSK-96, TSK-97, TSK-100
3. **Batch 3** (deps on batch 2): TSK-94, TSK-98
4. **Batch 4** (deps on batch 3): TSK-99
