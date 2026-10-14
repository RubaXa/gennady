# Миграция v1 → v2 — план

Слой сгенерирован `sdd-migrate plan`. Один файл плана — на одну спеку (её секции + её задачи).
Статусы юнитов живут в самих unit-файлах; `sdd-migrate plan --verify` проверяет весь слой.

## Порядок исполнения

- [x] G1 ✍️ Заполнить unit-файлы (Section Map / Ticket Map / Diagram Plan) и полную карту ID
- [x] G2 ✅ `sdd-migrate plan --verify` — весь слой полон, слаги без коллизий, расхождений нет
- [x] G3 🛑 Понятное подтверждение оператора по всему плану (STEP_4 ACK)
- [x] G4 🤖 После ACK: anchors материализованы для 127 тикетов; после 19 evidence-based repairs refused=0
- [x] G5 🤖 После ACK: 127 canonical Task-ID записаны из утверждённых Ticket Map
- [x] G6 🤖 После ACK: 12 scope перенесены; финальный move выполнен только после E-22 proof
- [x] G7 ✍️ 68 specs реструктурированы по утверждённым Section Map
- [x] G8 ✅ E-14 acceptance: MIGRATION grade PASS, executable bar PASS, mixed-state grandfathering сохранён и 12/12 повторных dry-run = no-op
- [x] G9 ✅ E-20 acceptance: `tasks/` удалён штатным move, `FLOW_VERSION=v2`, frozen E-22 layer сохранён

Порядок fail-closed: plan/maps/verify → operator ACK → anchors/IDs/move. До ACK записи разрешены
только в `migration/**`; задачи, спеки, код и directives остаются побайтово неизменными.

После execution исходные unit-карты остаются versioned audit input до миграции. `plan --verify`
— это pre-write gate и после move ожидаемо видит исторические `tasks/**` как inventory drift. Post-write
идемпотентность доказана повторным `move` dry-run для всех 12 scope, а не перегенерацией
утверждённого плана из уже мигрированного дерева.

Финальное evidence: [`E14-E20-ACCEPTANCE.md`](./E14-E20-ACCEPTANCE.md).

## Юниты

| План                                                                          | Спека                                                           | Тикетов |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------- | ------- |
| `migration/agent-inbox/agent-inbox.spec.migration.md`                         | `specs/agent-inbox/agent-inbox.spec.md`                         | 5       |
| `migration/agent-inbox/inbox-api/inbox-api.spec.migration.md`                 | `specs/agent-inbox/inbox-api/inbox-api.spec.md`                 | 3       |
| `migration/agent-inbox/inbox-chat/inbox-chat.spec.migration.md`               | `specs/agent-inbox/inbox-chat/inbox-chat.spec.md`               | 2       |
| `migration/agent-inbox/inbox-core/inbox-core.spec.migration.md`               | `specs/agent-inbox/inbox-core/inbox-core.spec.md`               | 3       |
| `migration/agent-inbox/inbox-dashboard/inbox-dashboard.spec.migration.md`     | `specs/agent-inbox/inbox-dashboard/inbox-dashboard.spec.md`     | 3       |
| `migration/agent-inbox/inbox-eval/inbox-eval.spec.migration.md`               | `specs/agent-inbox/inbox-eval/inbox-eval.spec.md`               | 2       |
| `migration/agent-inbox/inbox-mocks/inbox-mocks.spec.migration.md`             | `specs/agent-inbox/inbox-mocks/inbox-mocks.spec.md`             | 1       |
| `migration/agent-inbox/inbox-opencode/inbox-opencode.spec.migration.md`       | `specs/agent-inbox/inbox-opencode/inbox-opencode.spec.md`       | 2       |
| `migration/agent-inbox/inbox-pipeline/inbox-pipeline.spec.migration.md`       | `specs/agent-inbox/inbox-pipeline/inbox-pipeline.spec.md`       | 2       |
| `migration/agent-inbox/inbox-queue/inbox-queue.spec.migration.md`             | `specs/agent-inbox/inbox-queue/inbox-queue.spec.md`             | 2       |
| `migration/agent-inbox/inbox-vcs/inbox-vcs.spec.migration.md`                 | `specs/agent-inbox/inbox-vcs/inbox-vcs.spec.md`                 | 2       |
| `migration/agent-mon-cli/agent-mon-cli.spec.migration.md`                     | `specs/agent-mon-cli/agent-mon-cli.spec.md`                     | 1       |
| `migration/agent-mon-cli/cmd/cmd.spec.migration.md`                           | `specs/agent-mon-cli/cmd/cmd.spec.md`                           | 1       |
| `migration/agent-mon-cli/state/state.spec.migration.md`                       | `specs/agent-mon-cli/state/state.spec.md`                       | 1       |
| `migration/agent-mon-cli/ui/ui.spec.migration.md`                             | `specs/agent-mon-cli/ui/ui.spec.md`                             | 1       |
| `migration/agent-mon/agent-mon.spec.migration.md`                             | `specs/agent-mon/agent-mon.spec.md`                             | 3       |
| `migration/agent-mon/diff/diff.spec.migration.md`                             | `specs/agent-mon/diff/diff.spec.md`                             | 1       |
| `migration/agent-mon/model/model.spec.migration.md`                           | `specs/agent-mon/model/model.spec.md`                           | 1       |
| `migration/agent-mon/monitor/monitor.spec.migration.md`                       | `specs/agent-mon/monitor/monitor.spec.md`                       | 1       |
| `migration/agent-mon/observe/observe.spec.migration.md`                       | `specs/agent-mon/observe/observe.spec.md`                       | 1       |
| `migration/agent-mon/providers/claude/claude.spec.migration.md`               | `specs/agent-mon/providers/claude/claude.spec.md`               | 0       |
| `migration/agent-mon/providers/opencode/opencode.spec.migration.md`           | `specs/agent-mon/providers/opencode/opencode.spec.md`           | 0       |
| `migration/agent-run/agent-run.spec.migration.md`                             | `specs/agent-run/agent-run.spec.md`                             | 0       |
| `migration/agent-run/core/core.spec.migration.md`                             | `specs/agent-run/core/core.spec.md`                             | 2       |
| `migration/agent-run/opencode/opencode.spec.migration.md`                     | `specs/agent-run/opencode/opencode.spec.md`                     | 1       |
| `migration/ai-skills/ai-skills.spec.migration.md`                             | `specs/ai-skills/ai-skills.spec.md`                             | 0       |
| `migration/ai-skills/directive-assembly/directive-assembly.spec.migration.md` | `specs/ai-skills/directive-assembly/directive-assembly.spec.md` | 0       |
| `migration/ai-skills/sdd-skills/sdd-skills.spec.migration.md`                 | `specs/ai-skills/sdd-skills/sdd-skills.spec.md`                 | 1       |
| `migration/ai-skills/skill-contract/skill-contract.spec.migration.md`         | `specs/ai-skills/skill-contract/skill-contract.spec.md`         | 0       |
| `migration/cli/agents-rules/agents-rules.spec.migration.md`                   | `specs/cli/agents-rules/agents-rules.spec.md`                   | 1       |
| `migration/cli/cat/cat.spec.migration.md`                                     | `specs/cli/cat/cat.spec.md`                                     | 1       |
| `migration/cli/cli.spec.migration.md`                                         | `specs/cli/cli.spec.md`                                         | 22      |
| `migration/cli/e2e/e2e.spec.migration.md`                                     | `specs/cli/e2e/e2e.spec.md`                                     | 1       |
| `migration/cli/help/help.spec.migration.md`                                   | `specs/cli/help/help.spec.md`                                   | 0       |
| `migration/cli/lint/lint.spec.migration.md`                                   | `specs/cli/lint/lint.spec.md`                                   | 12      |
| `migration/cli/orient/orient.spec.migration.md`                               | `specs/cli/orient/orient.spec.md`                               | 1       |
| `migration/cli/review/review.spec.migration.md`                               | `specs/cli/review/review.spec.md`                               | 0       |
| `migration/cli/run/run.spec.migration.md`                                     | `specs/cli/run/run.spec.md`                                     | 1       |
| `migration/cli/sdd-check/sdd-check.spec.migration.md`                         | `specs/cli/sdd-check/sdd-check.spec.md`                         | 0       |
| `migration/cli/sdd-extract/sdd-extract.spec.migration.md`                     | `specs/cli/sdd-extract/sdd-extract.spec.md`                     | 0       |
| `migration/cli/sdd-log/sdd-log.spec.migration.md`                             | `specs/cli/sdd-log/sdd-log.spec.md`                             | 0       |
| `migration/cli/sdd-migrate/sdd-migrate.spec.migration.md`                     | `specs/cli/sdd-migrate/sdd-migrate.spec.md`                     | 0       |
| `migration/cli/sdd-new/sdd-new.spec.migration.md`                             | `specs/cli/sdd-new/sdd-new.spec.md`                             | 0       |
| `migration/cli/sdd-orient/sdd-orient.spec.migration.md`                       | `specs/cli/sdd-orient/sdd-orient.spec.md`                       | 0       |
| `migration/cli/sdd-state/sdd-state.spec.migration.md`                         | `specs/cli/sdd-state/sdd-state.spec.md`                         | 0       |
| `migration/cli/sdd-step/sdd-step.spec.migration.md`                           | `specs/cli/sdd-step/sdd-step.spec.md`                           | 0       |
| `migration/cli/sdd-sync/sdd-sync.spec.migration.md`                           | `specs/cli/sdd-sync/sdd-sync.spec.md`                           | 0       |
| `migration/cli/sdd-task/sdd-task.spec.migration.md`                           | `specs/cli/sdd-task/sdd-task.spec.md`                           | 0       |
| `migration/cli/sdd-verify/sdd-verify.spec.migration.md`                       | `specs/cli/sdd-verify/sdd-verify.spec.md`                       | 0       |
| `migration/cli/sync-skills/sync-skills.spec.migration.md`                     | `specs/cli/sync-skills/sync-skills.spec.md`                     | 2       |
| `migration/cli/sync/sync.spec.migration.md`                                   | `specs/cli/sync/sync.spec.md`                                   | 3       |
| `migration/cli/testcov/testcov.spec.migration.md`                             | `specs/cli/testcov/testcov.spec.md`                             | 1       |
| `migration/cli/update-check/update-check.spec.migration.md`                   | `specs/cli/update-check/update-check.spec.md`                   | 3       |
| `migration/cli/verify/verify.spec.migration.md`                               | `specs/cli/verify/verify.spec.md`                               | 0       |
| `migration/cli/yagni/yagni.spec.migration.md`                                 | `specs/cli/yagni/yagni.spec.md`                                 | 0       |
| `migration/dbc/dbc-linter/dbc-linter.spec.migration.md`                       | `specs/dbc/dbc-linter/dbc-linter.spec.md`                       | 12      |
| `migration/dbc/dbc-parser/dbc-parser.spec.migration.md`                       | `specs/dbc/dbc-parser/dbc-parser.spec.md`                       | 3       |
| `migration/dbc/dbc.spec.migration.md`                                         | `specs/dbc/dbc.spec.md`                                         | 0       |
| `migration/infra-base/infra-base.spec.migration.md`                           | `specs/infra-base/infra-base.spec.md`                           | 0       |
| `migration/infra-npm-publish/infra-npm-publish.spec.migration.md`             | `specs/infra-npm-publish/infra-npm-publish.spec.md`             | 4       |
| `migration/mr-stats/mr-stats.spec.migration.md`                               | `specs/mr-stats/mr-stats.spec.md`                               | 2       |
| `migration/shared/shared.spec.migration.md`                                   | `specs/shared/shared.spec.md`                                   | 0       |
| `migration/vcs/vcs-cli/vcs-cli.spec.migration.md`                             | `specs/vcs/vcs-cli/vcs-cli.spec.md`                             | 0       |
| `migration/vcs/vcs-client/vcs-client.spec.migration.md`                       | `specs/vcs/vcs-client/vcs-client.spec.md`                       | 13      |
| `migration/vcs/vcs-github-cli/vcs-github-cli.spec.migration.md`               | `specs/vcs/vcs-github-cli/vcs-github-cli.spec.md`               | 0       |
| `migration/vcs/vcs-mr-management/vcs-mr-management.spec.migration.md`         | `specs/vcs/vcs-mr-management/vcs-mr-management.spec.md`         | 3       |
| `migration/vcs/vcs-reactions/vcs-reactions.spec.migration.md`                 | `specs/vcs/vcs-reactions/vcs-reactions.spec.md`                 | 0       |
| `migration/vcs/vcs.spec.migration.md`                                         | `specs/vcs/vcs.spec.md`                                         | 0       |

## Operator ACK

- Дата: 2026-09-21.
- Принято: три `Critic Rounds` удаляются из актуального дерева; история остаётся в Git.
- Принято: 19 `PHASES_OVERVIEW` восстанавливаются только из headings/Deps/Inputs/status/DONE evidence.
- Принято: generated directives/fixtures после ID write пересобираются from sources; XML validation запрещена.
