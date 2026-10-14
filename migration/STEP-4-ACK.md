# E-14 / E-20 — STEP_4 operator ACK packet

## Граница подтверждения

- Frozen input/release: `130f8091836216e5259786d61eaa996dd709d0e3`.
- Сейчас изменён только `migration/**`; `tasks/**`, `specs/**`, код и directives не менялись.
- Фактический порядок: plan/maps/verify → этот ACK → anchors/ID repairs/IDs/move.
- E-14 и E-20 идут одной execution-волной, но имеют отдельные acceptance-блоки.
- Последний scope move разрешён только после повторного E-22 frozen-golden proof.

## Before → after proposal

| Метрика                |                          Before |                          После утверждённой execution-волны |
| ---------------------- | ------------------------------: | ----------------------------------------------------------: |
| Scope                  |                              12 |                                                          12 |
| Migration units        |                              68 |                                           68 migrated specs |
| Legacy tickets         |                             127 |                                   127 co-located V2 tickets |
| Legacy `tasks/` roots  |                               1 |                                         0 (E-20 acceptance) |
| `FLOW_VERSION`         |                              v1 |                                                          v2 |
| Unmapped plan findings |                              25 |                                                           0 |
| Anchor dry-run         | 102 would / 6 skip / 19 refused | 127 anchored or already canonical after 19 evidence repairs |
| Canonical ID map       |                               0 |                                                         127 |

## Scopes

| Scope             | Type           |  Units | Tickets |
| ----------------- | -------------- | -----: | ------: |
| agent-inbox       | product        |     11 |      27 |
| agent-mon         | library        |      7 |       7 |
| agent-mon-cli     | product        |      4 |       4 |
| agent-run         | library        |      3 |       3 |
| ai-skills         | library        |      4 |       1 |
| cli               | product        |     26 |      48 |
| dbc               | library        |      3 |      15 |
| infra-base        | infrastructure |      1 |       0 |
| infra-npm-publish | infrastructure |      1 |       4 |
| mr-stats          | product        |      1 |       2 |
| shared            | infrastructure |      1 |       0 |
| vcs               | product        |      6 |      16 |
| **Итого**         |                | **68** | **127** |

## Карты и repair evidence

- Полная карта 127 ID/destination/purpose: [`ID-MAP.md`](./ID-MAP.md); machine map: [`ids.tsv`](./ids.tsv).
- Полный dry-run 745 файлов: [`ID-DRY-RUN.md`](./ID-DRY-RUN.md).
- Все 19 evidence-based PHASES_OVERVIEW proposals: [`PHASES-OVERVIEW-REPAIRS.md`](./PHASES-OVERVIEW-REPAIRS.md).
- Все 68 Section/Ticket/Diagram maps: unit-файлы, перечисленные в [`README.md`](./README.md).

### Критерий canonical Task-ID

- ACR сохранён от owning unit; slug вручную сверён с `Meta.Purpose` каждого из 127 тикетов.
- Slug — законченное grep-friendly имя сущности/действия, не механическое первое слово и не
  числовой collision suffix; длина не больше 8 символов.
- `ids.tsv`: ровно 127 строк без header, 127 unique old и 127 unique new; prefix collisions — 0.

## Решения Section/Diagram Map

- `create`: 112
- `drop`: 3
- `keep`: 618
- `merge`: 4
- `rename`: 4
- Overview diagram: 34 unit используют существующий mermaid evidence; 34 строят минимальный graph только из существующих inventory/structure/module-map фактов.
- `Critic Rounds` → `drop`: это исторический рабочий журнал, не каноническая V2 spec-секция.
- Functional/Non-Functional → единый `REQUIREMENTS_AND_CONSTRAINTS`.
- Usage/UX examples → канонический `GOLDEN_DX`; устойчивые Execution Insights → `DECISION_LOG`.

## Аномалии, включённые в proposal

1. `tasks/cli/sync-skills/cli-sync-skills.task-57.md`: META anchor закрывается до реального Task-ID. Карта предлагает old=`TSK-57`; до ACK тикет не меняется.
2. Frozen input содержит два разных `TSK-168`. VCS-worktree сохраняет old=`TSK-168`; inbox-ticket получает scoped pre-ID repair old=`TSK-168A`. Этот repair должен быть применён адресно вместе с его inbox references до глобального `ids --write`, иначе глобальная замена перепутает два тикета.
3. 19 tickets не имеют PHASES_OVERVIEW. Их proposals используют только существующие phase headings, буквальные Inputs и execution-log DONE; никаких новых фаз migrator не синтезирует.
4. `ids --from-plan` затрагивает generated directive text и test fixtures как обычный text replacement. Generated artifacts после execution должны быть пересобраны из sources; XML validation к directives запрещена.

## Что будет записано только после ACK

- 19 PHASES_OVERVIEW repairs и scoped duplicate-ID repair;
- anchors в допустимые legacy tickets;
- 127 ID replacements по полному file list;
- 127 ticket moves, 68 spec restructures, Spec-ID/source-header materialization и 12 scope indexes;
- удаление последнего `tasks/` штатным final move только после E-22 proof.

## Запрашиваемое решение

Подтвердить или вернуть конкретные строки Section Map / ID Map / repair proposals. Подтверждение разрешает только описанную execution-волну; оно не ослабляет L-28, ownership fail-closed, V1 grandfathering или E-22.
