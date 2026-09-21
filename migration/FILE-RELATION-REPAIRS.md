# E-14 — proposal по восстановлению file relations

Статус: **proposal only**. Этот документ не разрешает `move`, не меняет blocked corpus и не
ослабляет fail-closed preflight. Frozen input: `130f8091836216e5259786d61eaa996dd709d0e3`.

Источники аудита:

- 12 отчётов `/private/tmp/e14-move-*.json`; blocked scopes дали ровно 763 строки;
- текущие `tasks/**`, `specs/**`, `migration/ID-MAP.md` и `migration/ids.tsv`;
- локальная Git-история, включая `03acc91a` (удалённые завершённые V1 tickets), `df200f2d`
  (коллизия CLI `TSK-169`), `165697d6`/`08608b55` (pipeline `TSK-176`) и `cbd03b68`
  (`AI-16`/`inbox-context`).

## 1. Дедупликация

| Raw class                          |     Raw |                            Unique files |                                  Unique tickets/relations | Root cause / verdict                                                                                                         |
| ---------------------------------- | ------: | --------------------------------------: | --------------------------------------------------------: | ---------------------------------------------------------------------------------------------------------------------------- |
| missing exact Target/Deleted claim |     430 |                                     282 |                    70 tickets / 372 file-ticket relations | Data/evidence reconciliation; preflight не умеет отличать historical relation от owner claim                                 |
| unresolved legacy `@tasks`         |      98 |                                      78 |                  38 real IDs плюс 3 prose false positives | 34 удалённых historical tickets, 2 Git-only IDs, 2 current IDs с неверным delimiter; также parser defect                     |
| ambiguous leading header comments  |      86 |                                      84 |                                         84 header regions | **Parser defect**: region продолжается через blank line в следующий JSDoc/comment                                            |
| ambiguous semantic owner           |      51 |                                      47 |                                                  47 files | 46 однозначно разрешаются module/path/task evidence; один также разрешается exact purpose evidence; operator choice не нужен |
| malformed/unverifiable target      |      84 |                                      65 |              10 tickets / 71 unique file-ticket relations | Data debt в 10 V1 tickets: 8 malformed phase layouts и 2 prose/glob targets                                                  |
| unparseable ownership evidence     |      11 |                                      11 |                                          те же 10 tickets | Та же data debt, но ticket-level preflight finding                                                                           |
| empty canonical header             |       3 |                                       3 |                                          3 source headers | Data debt                                                                                                                    |
| **Total**                          | **763** | **414 distinct affected files overall** | **690 unique finding lines; 80 distinct current tickets** | Findings разных классов пересекаются на одних файлах                                                                         |

Логическая единица repair после дедупликации: 3 code fixes, 80 current-ticket repairs,
38 historical-ID dispositions, 47 owner assignments и 6 direct header data repairs. Это 174
действия, а не 763 независимых решения.

## 2. Дефекты FO-6 parser/preflight

### P1 — `parseTasksHeader` читает всё тело файла

`shared/sdd/tasks-append-only.ts:13-19` использует первый `/@tasks:\s*(.+)/` без ограничения
canonical leading header. Поэтому prose из трёх orient-файлов превращается в fake IDs:

- `cli/cmd/orient/__tests__/extract-header.test.ts` → `@consumers: from source content.`;
- `cli/cmd/orient/core/extract-header.ts` → `@consumers:) from source content.`;
- `cli/cmd/orient/render/render-file-list.ts` → `... | @consumers: ... | @exports: N`.

Минимальный repro: source без header `@tasks`, но со строкой
`// parser reads @tasks: ... | @consumers: ...`; `parseTasksHeader` возвращает prose-token.
Правильный фикс: один canonical leading-header parser для `//`/`#`, shebang/license-aware;
body/prose tags не являются legacy evidence. Ожидаемое снятие: 3 raw findings.

### P2 — leading region захватывает следующий JSDoc

`shared/sdd/migration-file-headers.ts:346-370` продолжает `headerEnd` через пустые строки и любые
block comments, а `:429-435` затем объявляет их ambiguous. Минимальный repro:

```ts
// @file: x
// @consumers: y
// @tasks: TSK-1

/** @purpose Real declaration. */
export const x = 1;
```

Текущий verdict: строка JSDoc ambiguous. Это не data debt. Ownership region должен закончиться
после canonical header block/его доказанных continuations; последующий declaration JSDoc не часть
шапки. Ожидаемое снятие: 86 raw findings на 84 файлах. Реальные duplicate/empty tags должны
по-прежнему fail closed.

### P3 — historical/Git evidence вообще не моделируется

`shared/sdd/migration-file-headers.ts:530-557` знает только current `ticketsById`; удалённый ticket
в Git всегда становится unresolved, а current header relation без exact target всегда становится
ошибкой. Это расходится с FO-6: legacy `@tasks` — evidence candidate, а `declared`/historical
relation не должна автоматически повышаться до semantic owner.

Минимальный repro: completed ticket существует в parent history, source header всё ещё содержит
его ID, current semantic owner подтверждён другим exact ticket. Сейчас move блокируется как
unresolved; ожидается history evidence + продолжение, без подмены owner.

Минимальный фикс: read-only historical adapter с frozen/base commit boundary, который возвращает
`history` relation и её former spec, но никогда не делает её owner. Shallow/missing object должен
оставаться fail-closed. Persistent cache и второй ручной registry не нужны.

## 3. Historical IDs: evidence и disposition

`03acc91a^` содержит завершённые ticket-документы для 34 numeric IDs ниже; `03acc91a` удалил их
из активного дерева. Их нельзя remap-ить на случайный current ticket. Доказуемое действие:
сохранить relation как Git `history`, удалить stale token из live V2 header при rewrite и выбрать
semantic owner из current exact evidence.

| Old ID                                               |         Raw refs | Historical owner/evidence                                                                                       | Proposed action                                                     |
| ---------------------------------------------------- | ---------------: | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| TSK-95, TSK-96, TSK-97, TSK-98, TSK-100, TSK-103     | 4, 2, 3, 1, 4, 2 | `03acc91a^:tasks/agent-inbox/agent-inbox.task-<id>.md`                                                          | `history`; stale live token drop, no current-ticket remap           |
| TSK-106, TSK-129, TSK-133                            |          7, 5, 1 | deleted `inbox-api/*.task-<id>.md`                                                                              | `history` under `inbox-api`                                         |
| TSK-107, TSK-130, TSK-131                            |          1, 1, 1 | deleted `inbox-dashboard/*.task-<id>.md`                                                                        | `history` under `inbox-dashboard`                                   |
| TSK-109, TSK-110                                     |             3, 2 | deleted `inbox-core/*.task-<id>.md`                                                                             | `history` under `inbox-core`                                        |
| TSK-111, TSK-112                                     |             6, 1 | deleted `inbox-opencode/*.task-<id>.md`                                                                         | `history` under `inbox-opencode`                                    |
| TSK-113, TSK-140, TSK-141, TSK-142, TSK-143          |    5, 1, 2, 1, 1 | deleted `inbox-roles/*.task-<id>.md`                                                                            | `history` under `inbox-roles`                                       |
| TSK-115, TSK-117, TSK-150, TSK-152, TSK-154          |    3, 2, 1, 2, 2 | deleted root `agent-inbox.task-<id>.md`                                                                         | `history` under root `agent-inbox`                                  |
| TSK-119, TSK-121, TSK-122, TSK-123, TSK-124, TSK-125 | 1, 3, 3, 1, 1, 1 | deleted `inbox-eval/*.task-<id>.md`; commit body explicitly calls 119/121 dangling legacy refs                  | `history` under `inbox-eval`                                        |
| TSK-126, TSK-127                                     |             2, 1 | deleted `inbox-chat/*.task-<id>.md`                                                                             | `history` under `inbox-chat`                                        |
| TSK-176                                              |               14 | historical object `tasks/agent-inbox/inbox-pipeline/inbox-pipeline.task-176.md`; commits `08608b55`, `165697d6` | `history` under `inbox-pipeline`                                    |
| TSK-AI-16                                            |                1 | not a Task-ID: requirement `AI-16` in historical `agent-inbox.spec.md`; implementation commit `cbd03b68`        | drop malformed prefix; history belongs to root `agent-inbox`        |
| ID-spa + ID-design                                   | 3 combined lines | current TSK-164/TSK-169 dashboard tickets; source wrote whitespace instead of canonical comma                   | data repair: `ID-spa, ID-design`; both resolve to `inbox-dashboard` |

### Обнаруженная historical collision `TSK-169`

Frozen history содержит две разные сущности с этим ID:

- dashboard `tasks/agent-inbox/agent-inbox.task-169.md` → canonical `ID-design`;
- удалённый CLI worktree ticket, доказанный `df200f2d`, — FR-WT-08 submodule init.

Глобальный `ids --write` поэтому ошибочно заменил три CLI header refs на `ID-design`. Это не
dashboard relation и не operator choice. Repair: до следующего write вернуть этим трём relations
scope-qualified historical identity CLI TSK-169 (или сразу классифицировать их Git history), не
создавая второй active ticket и не назначая dashboard spec:

- `cli/cmd/vcs-worktree/_core/logic/worktree-ops.logic.ts`;
- `cli/cmd/vcs-worktree/_core/logic/worktree-ops.test.ts`;
- `cli/cmd/vcs-worktree/vcs-worktree.cmd.ts`.

## 4. Current-ticket relation audit

372 unique missing-exact relations сгруппированы в 70 current tickets. Число `Git` ниже —
консервативный lower bound: commit subject прямо содержит legacy/canonical ID и трогает файл.
Отсутствие такого subject не означает отсутствие evidence: для остальных проверены current header,
ticket Purpose, module path и file history semantics. Ни один relation нельзя механически добавлять
в Target Files только потому, что он был в `@tasks`.

Правило repair для каждого ticket:

1. файл создан/изменён фазой и Purpose двусторонне совпадает → добавить exact Target File;
2. файл лишь composition/help/consumer либо связь подтверждена старым commit, но не ownership →
   сохранить `history`, не добавлять target;
3. несовпадение Purpose/path → conscious stale-evidence drop с Git evidence в отчёте;
4. receipt никогда не считается observed Git change.

Representative attribution, которым проверялась эта классификация:

- `fb24c954` создаёт cat URL surface и совпадает с Purpose `CAT-mr-url`;
- `6e8910cf` создаёт lint checks, соответствующие `LIN-*` tickets;
- `771f0550` реализует dbc-parser cycle, соответствующий `DP-*` Purpose;
- `97e59acb` связывает state-store/decision surface с `IC-decision`;
- `e2d64afe` создаёт agent-run core+opencode, а `f578ffc4` добавляет model selection;
- `165697d6` переносит review pipeline и объясняет Git-only `TSK-176`.

Это representative commits, не разрешение по совпадению текста subject: полный candidate set ниже
остаётся обязательным входом следующей repair wave.

| Ticket       | Legacy  | Relations | Direct ID-in-commit | Action                                                                             |
| ------------ | ------- | --------: | ------------------: | ---------------------------------------------------------------------------------- |
| AI-roots     | TSK-172 |        13 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| AM-claude    | TSK-39  |         1 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| AR-command   | TSK-59  |         2 |                   2 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| CAT-mr-url   | TSK-31  |         7 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| CLI-approve  | TSK-69  |         1 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| CLI-diff     | TSK-81  |         5 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| CLI-jobs     | TSK-85  |        10 |                   9 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| CLI-noteedit | TSK-78  |         3 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| CLI-pipeline | TSK-83  |         6 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| CLI-revoke   | TSK-74  |         2 |                   2 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| CLI-suggest  | TSK-79  |         2 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| CLI-todo     | TSK-76  |         4 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| CLI-vcs-ctx  | TSK-68  |         1 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| CLI-vcs-use  | TSK-70  |         8 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| CMD-entry    | TSK-47  |         2 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| DL-ast       | TSK-08  |         2 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| DL-content   | TSK-11  |         5 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| DL-fixtures  | TSK-10  |         1 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| DL-jsdoc-fx  | TSK-21  |         5 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| DL-match     | TSK-09  |         3 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| DL-tags      | TSK-20  |         2 |                   2 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| DL-types     | TSK-07  |         2 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| DP-fields    | TSK-01  |         1 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| DP-jsdoc     | TSK-02  |         1 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| IA-health    | TSK-170 |         2 |                   2 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| IA-rest-sse  | TSK-162 |        19 |                  16 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| IC-decision  | TSK-157 |        10 |                   1 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| IC-journal   | TSK-156 |         3 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| IC-state     | TSK-173 |        21 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| ID-design    | TSK-169 |         3 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| ID-spa       | TSK-164 |         4 |                   4 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| IE-harness   | TSK-165 |        12 |                  12 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| INP-rel-cmd  | TSK-44  |         1 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| IO-runtime   | TSK-175 |        25 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| IO-session   | TSK-160 |         6 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| IP-review    | TSK-161 |         1 |                   1 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| IQ-actions   | TSK-177 |        14 |                  14 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| IQ-executor  | TSK-159 |         1 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| IV-gitlab    | TSK-158 |         8 |                   2 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| IV-vcs-port  | TSK-174 |        28 |                   3 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| LIN-anchors  | TSK-14  |         3 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| LIN-command  | TSK-16  |         3 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| LIN-dbc      | TSK-15  |         2 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| LIN-disable  | TSK-51  |         3 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| LIN-e2e      | TSK-18  |         1 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| LIN-headers  | TSK-13  |         2 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| LIN-language | TSK-32  |         2 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| LIN-types    | TSK-12  |         2 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| LIN-unit     | TSK-17  |         4 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| MS-config    | TSK-138 |         1 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| MS-pipeline  | TSK-139 |         4 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| ORI-command  | TSK-55  |         3 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| SS-command   | TSK-57  |        12 |                  11 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| STA-manager  | TSK-45  |         1 |                   1 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| SYN-command  | TSK-53  |         6 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| SYN-shared   | TSK-56  |        11 |                  10 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| SYN-tests    | TSK-54  |         8 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| TES-tree     | TSK-66  |         3 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| UC-notify    | TSK-33  |         4 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| UC-tests     | TSK-34  |         2 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| VC-approve   | TSK-67  |         1 |                   1 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| VC-fileport  | TSK-28  |         4 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| VC-github    | TSK-30  |         7 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| VC-gitlab    | TSK-29  |         5 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| VC-jobs      | TSK-84  |        13 |                  13 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| VC-noteedit  | TSK-77  |         3 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| VC-pipeline  | TSK-82  |         5 |                   4 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| VC-todos     | TSK-75  |         5 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| VC-unappr    | TSK-73  |         4 |                   4 | exact-target / history split by Purpose+diff; no owner inference from header alone |
| VMM-glcreate | TSK-89  |         1 |                   0 | exact-target / history split by Purpose+diff; no owner inference from header alone |

### Exact candidate set (grouped by ticket)

- `AI-roots` (13): `services/agent-inbox/modules/inbox-core/__tests__/runtime-profile.integration.test.ts`, `services/agent-inbox/modules/inbox-core/__tests__/runtime-profile.test.ts`, `services/agent-inbox/modules/inbox-core/boot-readiness.ts`, `services/agent-inbox/modules/inbox-core/runtime-profile.port.ts`, `services/agent-inbox/modules/inbox-core/runtime-profile.ts`, `services/agent-inbox/modules/inbox-core/state-store.ts`, `services/agent-inbox/modules/inbox-core/test-support/test-tmp.ts`, `services/agent-inbox/modules/inbox-core/types/review-runtime-binding.type.ts`, `services/agent-inbox/modules/inbox-core/types/review-runtime-profile-spec.type.ts`, `services/agent-inbox/modules/inbox-core/types/review-runtime-roots.type.ts`, `services/agent-inbox/modules/inbox-roles/role-scheduler.ts`, `services/agent-inbox/serve/__tests__/bootstrap.test.ts`, `services/agent-inbox/serve/bootstrap.ts`
- `AM-claude` (1): `services/agent-mon/model/scan-opts.type.ts`
- `AR-command` (2): `cli/cmd/help/help.cmd.ts`, `cli/gennady.ts`
- `CAT-mr-url` (7): `cli/cmd/cat/__tests__/cat-url.test.ts`, `cli/cmd/cat/cat-url.fn.ts`, `cli/cmd/cat/cat.cmd.ts`, `cli/cmd/cat/help.ts`, `cli/cmd/cat/index.ts`, `cli/utils/cat-gen/__tests__/cat-gen-from-vcs.test.ts`, `cli/utils/cat-gen/cat-gen.ts`
- `CLI-approve` (1): `cli/gennady.ts`
- `CLI-diff` (5): `cli/cmd/vcs-diff/__tests__/vcs-diff.test.ts`, `cli/cmd/vcs-diff/help.ts`, `cli/cmd/vcs-diff/index.ts`, `cli/cmd/vcs-diff/vcs-diff.cmd.ts`, `cli/gennady.ts`
- `CLI-jobs` (10): `cli/cmd/_shared/log-filter.ts`, `cli/cmd/help/help.cmd.ts`, `cli/cmd/vcs-job-log/help.ts`, `cli/cmd/vcs-job-log/index.ts`, `cli/cmd/vcs-job-log/vcs-job-log.cmd.ts`, `cli/cmd/vcs-job/__tests__/vcs-job.test.ts`, `cli/cmd/vcs-job/help.ts`, `cli/cmd/vcs-job/index.ts`, `cli/cmd/vcs-job/vcs-job.cmd.ts`, `cli/gennady.ts`
- `CLI-noteedit` (3): `cli/cmd/review/_core/xml/build-review-artifact.xml.ts`, `cli/cmd/vcs-reply/__tests__/vcs-reply.edit.test.ts`, `cli/cmd/vcs-reply/vcs-reply.cmd.ts`
- `CLI-pipeline` (6): `cli/cmd/vcs-pipeline/__tests__/vcs-pipeline.test.ts`, `cli/cmd/vcs-pipeline/help.ts`, `cli/cmd/vcs-pipeline/index.ts`, `cli/cmd/vcs-pipeline/vcs-pipeline.cmd.ts`, `cli/cmd/vcs-todo/index.ts`, `cli/gennady.ts`
- `CLI-revoke` (2): `cli/cmd/vcs-approve/__tests__/vcs-approve.test.ts`, `cli/cmd/vcs-approve/vcs-approve.cmd.ts`
- `CLI-suggest` (2): `cli/cmd/vcs-reply/__tests__/vcs-reply.suggestion.test.ts`, `cli/cmd/vcs-reply/vcs-reply.cmd.ts`
- `CLI-todo` (4): `cli/cmd/vcs-todo/__tests__/vcs-todo.test.ts`, `cli/cmd/vcs-todo/index.ts`, `cli/cmd/vcs-todo/vcs-todo.cmd.ts`, `cli/gennady.ts`
- `CLI-vcs-ctx` (1): `cli/cmd/_shared/create-vcs-client.ts`
- `CLI-vcs-use` (8): `cli/cmd/review/__tests__/review-issues.cmd.error.test.ts`, `cli/cmd/review/__tests__/review-issues.cmd.test.ts`, `cli/cmd/review/_core/logic/run-review-command.logic.ts`, `cli/cmd/review/_core/types/review-command-options.type.ts`, `cli/cmd/review/review-issues.cmd.ts`, `cli/cmd/vcs-reply/__tests__/vcs-reply.cmd.test.ts`, `cli/cmd/vcs-worktree/__tests__/vcs-worktree.cmd.error.test.ts`, `cli/cmd/vcs-worktree/__tests__/vcs-worktree.cmd.test.ts`
- `CMD-entry` (2): `cli/gennady.ts`, `cli/index.ts`
- `DL-ast` (2): `services/dbc/linter/implementations/ts/__tests__/dbc-ts-ast-adapter.test.ts`, `services/dbc/linter/implementations/ts/dbc-ts-ast-adapter.ts`
- `DL-content` (5): `services/dbc/linter/dbc-ast-adapter.types.ts`, `services/dbc/linter/dbc-linter.types.ts`, `services/dbc/linter/implementations/ts/__tests__/dbc-ts-linter.test.ts`, `services/dbc/linter/implementations/ts/dbc-ts-ast-adapter.ts`, `services/dbc/linter/implementations/ts/dbc-ts-linter.ts`
- `DL-fixtures` (1): `services/dbc/linter/implementations/ts/__tests__/dbc-ts-linter.test.ts`
- `DL-jsdoc-fx` (5): `services/dbc/linter/implementations/ts/__tests__/fixtures/autofix-combined/indented-multi-tag.ts`, `services/dbc/linter/implementations/ts/__tests__/fixtures/autofix-combined/malformed-multi-line.ts`, `services/dbc/linter/implementations/ts/__tests__/fixtures/autofix-combined/malformed-opening.ts`, `services/dbc/linter/implementations/ts/__tests__/fixtures/autofix-combined/missing-star-prefix.ts`, `services/dbc/linter/implementations/ts/dbc-ts-linter.ts`
- `DL-match` (3): `services/dbc/linter/dbc-linter.types.ts`, `services/dbc/linter/implementations/ts/__tests__/fixtures/autofix-combined/implements-method.ts`, `services/dbc/linter/implementations/ts/dbc-ts-linter.ts`
- `DL-tags` (2): `services/dbc/linter/implementations/ts/__tests__/dbc-ts-linter.test.ts`, `services/dbc/linter/implementations/ts/dbc-ts-linter.ts`
- `DL-types` (2): `services/dbc/linter/dbc-ast-adapter.types.ts`, `services/dbc/linter/dbc-linter.types.ts`
- `DP-fields` (1): `services/dbc/parser/dbc-parser.types.ts`
- `DP-jsdoc` (1): `services/dbc/parser/implementations/jsdoc/dbc-jsdoc-parser.ts`
- `IA-health` (2): `services/agent-inbox/serve/bootstrap.ts`, `services/agent-inbox/serve/shutdown.ts`
- `IA-rest-sse` (19): `services/agent-inbox/modules/inbox-api/__tests__/artifact.router.test.ts`, `services/agent-inbox/modules/inbox-api/__tests__/chat.router.test.ts`, `services/agent-inbox/modules/inbox-api/__tests__/mutate.router.test.ts`, `services/agent-inbox/modules/inbox-api/http-helpers.ts`, `services/agent-inbox/modules/inbox-api/http-server.ts`, `services/agent-inbox/modules/inbox-api/routers/artifact.router.ts`, `services/agent-inbox/modules/inbox-api/routers/board.router.ts`, `services/agent-inbox/modules/inbox-api/routers/boot.router.ts`, `services/agent-inbox/modules/inbox-api/routers/chat.router.ts`, `services/agent-inbox/modules/inbox-api/routers/decision.router.ts`, `services/agent-inbox/modules/inbox-api/routers/feed.router.ts`, `services/agent-inbox/modules/inbox-api/routers/mutate.router.ts`, `services/agent-inbox/modules/inbox-api/routers/state.router.ts`, `services/agent-inbox/modules/inbox-api/routers/stream.router.ts`, `services/agent-inbox/modules/inbox-api/routers/task.router.ts`, `services/agent-inbox/modules/inbox-api/sse-hub.ts`, `services/agent-inbox/modules/inbox-dashboard/__tests__/chat-api-client.integration.test.ts`, `services/agent-inbox/test/__tests__/seed.test.ts`, `services/agent-inbox/test/dto-factories.ts`
- `IC-decision` (10): `services/agent-inbox/modules/inbox-api/http-server.ts`, `services/agent-inbox/modules/inbox-api/routers/boot.router.ts`, `services/agent-inbox/modules/inbox-api/routers/decision.router.ts`, `services/agent-inbox/modules/inbox-core/dry-run.ts`, `services/agent-inbox/modules/inbox-core/state-store.ts`, `services/agent-inbox/modules/inbox-pipeline/__tests__/pipeline-runtime.integration.test.ts`, `services/agent-inbox/modules/inbox-pipeline/pipeline-runtime.ts`, `services/agent-inbox/modules/inbox-roles/__tests__/role-scheduler.test.ts`, `services/agent-inbox/modules/inbox-roles/role-scheduler.ts`, `services/agent-inbox/serve/bootstrap.ts`
- `IC-journal` (3): `cli/cmd/inbox/_core/logic/inbox-registry.logic.ts`, `services/agent-inbox/modules/inbox-core/__tests__/inbox-registry.test.ts`, `services/agent-inbox/modules/inbox-roles/__tests__/assignment-persistence.test.ts`
- `IC-state` (21): `services/agent-inbox/modules/inbox-core/__tests__/review-change-batch.test.ts`, `services/agent-inbox/modules/inbox-core/__tests__/review-core-recovery.integration.test.ts`, `services/agent-inbox/modules/inbox-core/__tests__/review-core.contract.test.ts`, `services/agent-inbox/modules/inbox-core/__tests__/review-lifecycle.test.ts`, `services/agent-inbox/modules/inbox-core/__tests__/review-runtime.integration.test.ts`, `services/agent-inbox/modules/inbox-core/adapters/controlled-clock.ts`, `services/agent-inbox/modules/inbox-core/adapters/in-memory-artifact-store.ts`, `services/agent-inbox/modules/inbox-core/adapters/in-memory-journal.ts`, `services/agent-inbox/modules/inbox-core/adapters/local-artifact-store.ts`, `services/agent-inbox/modules/inbox-core/adapters/system-clock.ts`, `services/agent-inbox/modules/inbox-core/event-journal.ts`, `services/agent-inbox/modules/inbox-core/ports/artifact-store.port.ts`, `services/agent-inbox/modules/inbox-core/ports/clock.port.ts`, `services/agent-inbox/modules/inbox-core/review-config.ts`, `services/agent-inbox/modules/inbox-core/state-store.ts`, `services/agent-inbox/modules/inbox-core/state/review-change-batch.ts`, `services/agent-inbox/modules/inbox-core/state/review-lifecycle.ts`, `services/agent-inbox/modules/inbox-core/state/review-participation.ts`, `services/agent-inbox/modules/inbox-core/state/review-state.ts`, `services/agent-inbox/modules/inbox-core/types/review-event.type.ts`, `services/agent-inbox/modules/inbox-pipeline/pipeline-runtime.ts`
- `ID-design` (3): `cli/cmd/vcs-worktree/_core/logic/worktree-ops.logic.ts`, `cli/cmd/vcs-worktree/_core/logic/worktree-ops.test.ts`, `cli/cmd/vcs-worktree/vcs-worktree.cmd.ts`
- `ID-spa` (4): `e2e/inbox-serve/playwright.dashboard-v2.config.ts`, `services/agent-inbox/modules/inbox-dashboard/__tests__/dashboard-v2.contract.test.tsx`, `services/agent-inbox/modules/inbox-dashboard/dashboard-v2-api.ts`, `services/agent-inbox/modules/inbox-dashboard/v2-types.ts`
- `IE-harness` (12): `services/agent-inbox/modules/inbox-eval/runs/autonomy.run.ts`, `services/agent-inbox/modules/inbox-eval/runs/boot.run.ts`, `services/agent-inbox/modules/inbox-eval/runs/chat.run.ts`, `services/agent-inbox/modules/inbox-eval/runs/context.ts`, `services/agent-inbox/modules/inbox-eval/runs/coverage-gate.run.ts`, `services/agent-inbox/modules/inbox-eval/runs/crash-recovery.run.ts`, `services/agent-inbox/modules/inbox-eval/runs/effects.run.ts`, `services/agent-inbox/modules/inbox-eval/runs/events.run.ts`, `services/agent-inbox/modules/inbox-eval/runs/index.ts`, `services/agent-inbox/modules/inbox-eval/runs/parallel.run.ts`, `services/agent-inbox/modules/inbox-eval/runs/pipeline.run.ts`, `services/agent-inbox/modules/inbox-eval/runs/role-pickup.run.ts`
- `INP-rel-cmd` (1): `cli/cmd/remote-console/__tests__/remote-console.cmd.test.ts`
- `IO-runtime` (25): `services/agent-inbox/modules/inbox-api/__tests__/chat.router.test.ts`, `services/agent-inbox/modules/inbox-api/routers/chat.router.ts`, `services/agent-inbox/modules/inbox-chat/__tests__/chat-session.test.ts`, `services/agent-inbox/modules/inbox-chat/chat-session.ts`, `services/agent-inbox/modules/inbox-opencode/__tests__/agent-runtime.contract.test.ts`, `services/agent-inbox/modules/inbox-opencode/__tests__/agent-runtime.integration.test.ts`, `services/agent-inbox/modules/inbox-opencode/__tests__/prompt-compile.test.ts`, `services/agent-inbox/modules/inbox-opencode/__tests__/session-routing.integration.test.ts`, `services/agent-inbox/modules/inbox-opencode/__tests__/session-routing.test.ts`, `services/agent-inbox/modules/inbox-opencode/agent-coverage-trace.ts`, `services/agent-inbox/modules/inbox-opencode/agent-outcome-classifier.ts`, `services/agent-inbox/modules/inbox-opencode/errors.ts`, `services/agent-inbox/modules/inbox-opencode/opencode.mock.ts`, `services/agent-inbox/modules/inbox-opencode/opencode.port.ts`, `services/agent-inbox/modules/inbox-opencode/opencode.real.ts`, `services/agent-inbox/modules/inbox-opencode/prompt-compile.ts`, `services/agent-inbox/modules/inbox-opencode/schema-registry.ts`, `services/agent-inbox/modules/inbox-opencode/session-lifecycle.ts`, `services/agent-inbox/modules/inbox-opencode/session-pool.ts`, `services/agent-inbox/modules/inbox-opencode/session-registry.ts`, `services/agent-inbox/modules/inbox-queue/session-router.ts`, `services/agent-inbox/modules/inbox-roles/outcome-classifier.ts`, `services/agent-inbox/modules/inbox-roles/role-instance.ts`, `services/agent-inbox/serve/__tests__/bootstrap.test.ts`, `services/agent-inbox/serve/bootstrap.ts`
- `IO-session` (6): `services/agent-inbox/modules/inbox-chat/chat-session.ts`, `services/agent-inbox/modules/inbox-opencode/agent-outcome-classifier.ts`, `services/agent-inbox/modules/inbox-opencode/opencode.mock.ts`, `services/agent-inbox/modules/inbox-opencode/opencode.port.ts`, `services/agent-inbox/modules/inbox-roles/role-instance.ts`, `services/agent-inbox/serve/bootstrap.ts`
- `IP-review` (1): `services/agent-inbox/modules/inbox-pipeline/__tests__/gate-verdict.test.ts`
- `IQ-actions` (14): `services/agent-inbox/modules/inbox-queue/adapters/local-task-executor.adapter.ts`, `services/agent-inbox/modules/inbox-queue/automation/review-automation-policy.ts`, `services/agent-inbox/modules/inbox-queue/effects/review-effect-coordinator.ts`, `services/agent-inbox/modules/inbox-queue/model/review-action-package.ts`, `services/agent-inbox/modules/inbox-queue/model/review-decision.ts`, `services/agent-inbox/modules/inbox-queue/model/review-effect-queue.ts`, `services/agent-inbox/modules/inbox-queue/model/review-outcome.ts`, `services/agent-inbox/modules/inbox-queue/model/review-proposal.ts`, `services/agent-inbox/modules/inbox-queue/model/review-task.ts`, `services/agent-inbox/modules/inbox-queue/ports/task-executor.port.ts`, `services/agent-inbox/modules/inbox-queue/registry/review-action-catalog.ts`, `services/agent-inbox/modules/inbox-queue/registry/review-task-registry.ts`, `services/agent-inbox/modules/inbox-queue/types/review-effect.type.ts`, `services/agent-inbox/modules/inbox-queue/types/review-guarded-intent.type.ts`
- `IQ-executor` (1): `services/agent-inbox/modules/inbox-opencode/session-pool.ts`
- `IV-gitlab` (8): `services/agent-inbox/modules/inbox-api/http-server.ts`, `services/agent-inbox/modules/inbox-api/projections/board-projection.ts`, `services/agent-inbox/modules/inbox-api/routers/board.router.ts`, `services/agent-inbox/modules/inbox-vcs/vcs-gitlab.port.ts`, `services/agent-inbox/serve/bootstrap.ts`, `services/vcs-client/entities/vcs-actionable-mr.type.ts`, `services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-discussions.pagination.test.ts`, `services/vcs-client/gitlab/vcs-gitlab-inbox.ts`
- `IV-vcs-port` (28): `cli/cmd/inbox/help.ts`, `services/agent-inbox/modules/inbox-core/__tests__/vcs-inbox.real.blackbox.test.ts`, `services/agent-inbox/modules/inbox-core/types/review-event.type.ts`, `services/agent-inbox/modules/inbox-core/vcs-inbox.real.ts`, `services/agent-inbox/modules/inbox-vcs/__tests__/background-verify.test.ts`, `services/agent-inbox/modules/inbox-vcs/__tests__/effects.test.ts`, `services/agent-inbox/modules/inbox-vcs/__tests__/vcs-effects.integration.test.ts`, `services/agent-inbox/modules/inbox-vcs/__tests__/vcs-effects.real-integration.test.ts`, `services/agent-inbox/modules/inbox-vcs/__tests__/vcs-permission.contract.test.ts`, `services/agent-inbox/modules/inbox-vcs/__tests__/vcs-port.contract.test.ts`, `services/agent-inbox/modules/inbox-vcs/__tests__/vcs-sync.integration.test.ts`, `services/agent-inbox/modules/inbox-vcs/__tests__/vcs-test-context.ts`, `services/agent-inbox/modules/inbox-vcs/effects.ts`, `services/agent-inbox/modules/inbox-vcs/event-normalizer.ts`, `services/agent-inbox/modules/inbox-vcs/permission-policy.ts`, `services/agent-inbox/modules/inbox-vcs/readonly-effect.guard.ts`, `services/agent-inbox/modules/inbox-vcs/reconciler.ts`, `services/agent-inbox/modules/inbox-vcs/sync-coordinator.ts`, `services/agent-inbox/modules/inbox-vcs/sync.ts`, `services/agent-inbox/modules/inbox-vcs/vcs-gitlab.port.ts`, `services/agent-inbox/modules/inbox-vcs/vcs-port.ts`, `services/agent-inbox/modules/inbox-vcs/vcs-runtime.ts`, `services/agent-inbox/serve/__tests__/full-flow.blackbox.test.ts`, `services/agent-inbox/serve/bootstrap.ts`, `services/vcs-client/__tests__/gitlab/vcs-gitlab-client.observation.test.ts`, `services/vcs-client/entities/vcs-actionable-mr.type.ts`, `services/vcs-client/gitlab/vcs-gitlab-client.ts`, `services/vcs-client/gitlab/vcs-gitlab-inbox.ts`
- `LIN-anchors` (3): `cli/cmd/lint/__tests__/anchor.check.test.ts`, `cli/cmd/lint/checks/anchor.check.ts`, `cli/cmd/lint/help.ts`
- `LIN-command` (3): `cli/cmd/lint/help.ts`, `cli/cmd/lint/index.ts`, `cli/cmd/lint/lint.cmd.ts`
- `LIN-dbc` (2): `cli/cmd/lint/checks/dbc-contract.check.ts`, `cli/cmd/lint/help.ts`
- `LIN-disable` (3): `cli/cmd/lint/__tests__/disables.check.test.ts`, `cli/cmd/lint/checks/disables.check.ts`, `cli/cmd/lint/lint.types.ts`
- `LIN-e2e` (1): `cli/cmd/lint/__tests__/lint.cmd.test.ts`
- `LIN-headers` (2): `cli/cmd/lint/checks/file-header.check.ts`, `cli/cmd/lint/help.ts`
- `LIN-language` (2): `cli/cmd/lint/__tests__/language.check.test.ts`, `cli/cmd/lint/checks/language.check.ts`
- `LIN-types` (2): `cli/cmd/lint/help.ts`, `cli/cmd/lint/lint.types.ts`
- `LIN-unit` (4): `cli/cmd/lint/__tests__/anchor.check.test.ts`, `cli/cmd/lint/__tests__/dbc-contract.check.test.ts`, `cli/cmd/lint/__tests__/file-header.check.test.ts`, `cli/cmd/lint/__tests__/lint.cmd.test.ts`
- `MS-config` (1): `cli/gennady.ts`
- `MS-pipeline` (4): `cli/cmd/mr-stats/help.ts`, `cli/cmd/mr-stats/index.ts`, `cli/cmd/mr-stats/mr-stats.cmd.ts`, `services/mr-stats/__tests__/classifier-rules.test.ts`
- `ORI-command` (3): `cli/cmd/help/help.cmd.ts`, `cli/cmd/orient/help.ts`, `cli/gennady.ts`
- `SS-command` (12): `cli/cmd/help/help.cmd.ts`, `cli/cmd/sync-skills/__tests__/sync-skills-core-partial-read.test.ts`, `cli/cmd/sync-skills/__tests__/sync-skills-core.test.ts`, `cli/cmd/sync-skills/__tests__/sync-skills-formatter.test.ts`, `cli/cmd/sync-skills/__tests__/sync-skills.cmd.test.ts`, `cli/cmd/sync-skills/__tests__/sync-skills.types.test.ts`, `cli/cmd/sync-skills/index.ts`, `cli/cmd/sync-skills/sync-skills-core.ts`, `cli/cmd/sync-skills/sync-skills-formatter.ts`, `cli/cmd/sync-skills/sync-skills.cmd.ts`, `cli/cmd/sync-skills/sync-skills.types.ts`, `cli/gennady.ts`
- `STA-manager` (1): `cli/cmd/help/help.cmd.ts`
- `SYN-command` (6): `cli/cmd/sync/help.ts`, `cli/cmd/sync/index.ts`, `cli/cmd/sync/sync-core.ts`, `cli/cmd/sync/sync-formatter.ts`, `cli/cmd/sync/sync.cmd.ts`, `cli/cmd/sync/sync.types.ts`
- `SYN-shared` (11): `cli/cmd/sync/__tests__/sync-core-partial-read.test.ts`, `cli/cmd/sync/__tests__/sync-formatter.test.ts`, `cli/cmd/sync/__tests__/sync.cmd.test.ts`, `cli/cmd/sync/sync-core.ts`, `cli/cmd/sync/sync-formatter.ts`, `cli/cmd/sync/sync.cmd.ts`, `shared/common/sync/__tests__/sync-core.shared.test.ts`, `shared/common/sync/__tests__/sync-formatter.shared.test.ts`, `shared/common/sync/sync-core.shared.ts`, `shared/common/sync/sync-deps.type.ts`, `shared/common/sync/sync-formatter.shared.ts`
- `SYN-tests` (8): `cli/cmd/sync/__tests__/sync-core.test.ts`, `cli/cmd/sync/__tests__/sync-formatter.test.ts`, `cli/cmd/sync/__tests__/sync.cmd.test.ts`, `cli/cmd/sync/help.ts`, `cli/cmd/sync/sync-core.ts`, `cli/cmd/sync/sync-formatter.ts`, `cli/cmd/sync/sync.cmd.ts`, `cli/cmd/sync/sync.types.ts`
- `TES-tree` (3): `cli/cmd/testcov/help.ts`, `cli/cmd/testcov/index.ts`, `cli/cmd/testcov/testcov.cmd.ts`
- `UC-notify` (4): `cli/cmd/_shared/update-check-worker.ts`, `cli/cmd/_shared/update-check.ts`, `cli/gennady.ts`, `cli/index.ts`
- `UC-tests` (2): `cli/cmd/_shared/__tests__/update-check-worker.test.ts`, `cli/cmd/_shared/__tests__/update-check.test.ts`
- `VC-approve` (1): `services/vcs-client/github/vcs-github-merge-requests.ts`
- `VC-fileport` (4): `services/vcs-client/__tests__/abstract/vcs-client-abstract.test.ts`, `services/vcs-client/abstract/vcs-client-merge-requests.ts`, `services/vcs-client/abstract/vcs-client-repository-files.ts`, `services/vcs-client/abstract/vcs-client.ts`
- `VC-github` (7): `services/vcs-client/__tests__/github/vcs-github-client.test.ts`, `services/vcs-client/__tests__/github/vcs-github-merge-requests.test.ts`, `services/vcs-client/__tests__/github/vcs-github-repository-files.test.ts`, `services/vcs-client/github/vcs-github-client.ts`, `services/vcs-client/github/vcs-github-merge-discussions.ts`, `services/vcs-client/github/vcs-github-merge-requests.ts`, `services/vcs-client/github/vcs-github-repository-files.ts`
- `VC-gitlab` (5): `services/vcs-client/__tests__/gitlab/vcs-gitlab-merge-requests.test.ts`, `services/vcs-client/__tests__/gitlab/vcs-gitlab-repository-files.test.ts`, `services/vcs-client/gitlab/vcs-gitlab-client.ts`, `services/vcs-client/gitlab/vcs-gitlab-merge-requests.ts`, `services/vcs-client/gitlab/vcs-gitlab-repository-files.ts`
- `VC-jobs` (13): `services/vcs-client/abstract/vcs-client-merge-requests.ts`, `services/vcs-client/abstract/vcs-client-pipeline.ts`, `services/vcs-client/abstract/vcs-client.ts`, `services/vcs-client/entities/vcs-job-query.type.ts`, `services/vcs-client/entities/vcs-job.type.ts`, `services/vcs-client/entities/vcs-pipeline-status.type.ts`, `services/vcs-client/github/vcs-github-client.ts`, `services/vcs-client/github/vcs-github-merge-requests.ts`, `services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-requests.pipeline.test.ts`, `services/vcs-client/gitlab/__tests__/vcs-gitlab-pipeline.test.ts`, `services/vcs-client/gitlab/vcs-gitlab-client.ts`, `services/vcs-client/gitlab/vcs-gitlab-merge-requests.ts`, `services/vcs-client/gitlab/vcs-gitlab-pipeline.ts`
- `VC-noteedit` (3): `services/vcs-client/entities/vcs-delete-note-query.type.ts`, `services/vcs-client/entities/vcs-update-note-query.type.ts`, `services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-discussions.edit.test.ts`
- `VC-pipeline` (5): `services/vcs-client/abstract/vcs-client-merge-requests.ts`, `services/vcs-client/entities/vcs-pipeline-status.type.ts`, `services/vcs-client/github/vcs-github-merge-requests.ts`, `services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-requests.pipeline.test.ts`, `services/vcs-client/gitlab/vcs-gitlab-merge-requests.ts`
- `VC-todos` (5): `cli/cmd/inbox/help.ts`, `services/vcs-client/abstract/vcs-client-inbox.ts`, `services/vcs-client/entities/vcs-actionable-mr.type.ts`, `services/vcs-client/gitlab/__tests__/vcs-gitlab-inbox.test.ts`, `services/vcs-client/gitlab/vcs-gitlab-inbox.ts`
- `VC-unappr` (4): `services/vcs-client/entities/vcs-merge-request-approve-query.type.ts`, `services/vcs-client/github/vcs-github-merge-requests.ts`, `services/vcs-client/gitlab/__tests__/vcs-gitlab-merge-requests.unapprove.test.ts`, `services/vcs-client/gitlab/vcs-gitlab-merge-requests.ts`
- `VMM-glcreate` (1): `services/vcs-client/gitlab/vcs-gitlab-merge-requests.ts`

## 5. Ambiguous semantic owners

После объединения повторов across scopes 51 строки — это 47 файлов. Все разрешаются существующим
evidence; нового продуктового решения не требуется.

- `specs/cli/cli.spec.md`: `cli/cmd/help/help.cmd.ts`, `cli/gennady.ts` и три
  `cli/cmd/vcs-worktree/**` файла. Для worktree `ID-design` ложен из-за historical collision;
  `df200f2d` доказывает CLI ownership.
- `specs/cli/lint/lint.spec.md`: `cli/cmd/lint/lint.cmd.ts`; E2E ticket — verification history.
- `specs/agent-inbox/inbox-api/inbox-api.spec.md`: 10 файлов физического `inbox-api/**`.
- `specs/agent-inbox/inbox-chat/inbox-chat.spec.md`: `inbox-chat/__tests__/chat-session.test.ts`;
  deleted TSK-126 подтверждает owner.
- `specs/agent-inbox/inbox-core/inbox-core.spec.md`: `boot-readiness.ts`, `state-store.ts`,
  `types/review-event.type.ts`.
- `specs/agent-inbox/inbox-opencode/inbox-opencode.spec.md`: `session-pool.ts`.
- `specs/agent-inbox/inbox-pipeline/inbox-pipeline.spec.md`: runtime и его integration test.
- `specs/agent-inbox/inbox-queue/inbox-queue.spec.md`: executor/test, session-router,
  task-queue, task-registry.
- `specs/agent-inbox/inbox-roles/inbox-roles.spec.md`: scheduler и test.
- `specs/agent-inbox/inbox-vcs/inbox-vcs.spec.md`: `sync.ts`.
- root `specs/agent-inbox/agent-inbox.spec.md`: четыре `serve/**` composition/e2e файла и два
  `services/agent-inbox/test/**` fixtures.
- `specs/agent-mon/model/model.spec.md`: `model/scan-opts.type.ts`.
- `specs/agent-run/opencode/opencode.spec.md`: четыре `engines/opencode/**` files и
  `services/agent-run/index.ts`. Для `index.ts` TSK-63 Purpose буквально включает composition root;
  TSK-64 — последующая model history.
- `specs/vcs/vcs-client/vcs-client.spec.md`: четыре `services/vcs-client/**` files;
  DBC/VMM relations — historical cross-cutting work, не semantic ownership.

### Operator-choice table

| File | Candidates | Decision                                                                                                                                                             |
| ---- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —    | —          | **Нет недоказуемых semantic choices в текущих 47 files.** Любое расхождение с owner list выше должно снова блокировать preflight, а не выбирать first/path silently. |

## 6. Остальная data debt

### 10 ticket repairs

| Ticket       | Source                                                 | Repair                                                                                  |
| ------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| E2E-harness  | `tasks/cli/e2e/e2e.task-60.md`                         | восстановить canonical overview/phase ID; exact targets уже перечислены в body/headings |
| CLI-mrcreate | `tasks/cli/vcs-mr-create/vcs-mr-create.task-91.md`     | canonical `PHASES_OVERVIEW`                                                             |
| CLI-discuss  | `tasks/cli/vcs-discussions/vcs-discussions.task-93.md` | canonical `PHASES_OVERVIEW`                                                             |
| CLI-mr-edit  | `tasks/cli/vcs-mr-edit/vcs-mr-edit.task-92.md`         | canonical `PHASES_OVERVIEW`                                                             |
| CLI-reg-vcs  | `tasks/cli/vcs-discussions/vcs-integration.task-94.md` | canonical `PHASES_OVERVIEW`                                                             |
| CLI-draft    | `tasks/cli/vcs-draft-note/vcs-draft-note.task-87.md`   | canonical P1 phase section                                                              |
| VMM-gh-crud  | `tasks/vcs/vcs-mr-client/vcs-mr-client.task-90.md`     | canonical P1 phase section                                                              |
| VC-drafts    | `tasks/vcs/vcs-client/vcs-client.task-86.md`           | canonical P1 phase section                                                              |
| AI-fasttest  | `tasks/agent-inbox/agent-inbox.task-167.md`            | заменить prose/glob одним exact списком четырёх файлов                                  |
| DL-redund    | `tasks/dbc/dbc-linter/dbc-linter.task-88.md`           | отделить exact path от `(Modify — …)` prose                                             |

Это одна repair на ticket, хотя она снимает 95 raw lines: 84 file-level и 11 ticket-level.

### 6 direct header repairs

- добавить непустой `@consumers` в два dashboard tests:
  `feed-lifecycle.test.tsx`, `optimistic.test.tsx`;
- добавить canonical `@file`/`@consumers` в `scripts/prepare-publish-artifacts.ts`;
- нормализовать delimiter `ID-spa ID-design` → `ID-spa, ID-design` в `App.tsx`,
  `dashboard-v2-ui.tsx`, `e2e/inbox-serve/dashboard-v2.spec.ts`.

## 7. Repairability totals и ожидаемый остаток

| Bucket                              |  Logical actions |                                                            Covered current findings | Semantic choice? |
| ----------------------------------- | ---------------: | ----------------------------------------------------------------------------------: | ---------------- |
| Parser/preflight code defects P1-P3 |                3 |                     181 raw minimum: 86 header + 3 prose + 92 historical unresolved | no               |
| Current ticket reconciliation       | 80 tickets total | 430 missing-exact + 84 invalid-target + 11 unparseable; overlaps are ticket-deduped | evidence-based   |
| Historical ID dispositions          |           38 IDs |                               95 real-ID appearances inside 98 raw unresolved lines | evidence-based   |
| Owner assignments                   |         47 files |                                                                              51 raw | evidence-based   |
| Direct header data                  |          6 files |                                   6 raw, with possible second-order relation checks | no               |

Safe batch можно выполнить без продуктового выбора для **414 affected files / 80 current tickets /
38 historical IDs**. По текущему emitted set после всех перечисленных repairs ожидается **0 известных
blockers**. Это прогноз, не acceptance: исправленные parser branches могут открыть second-order
findings, поэтому move всё равно запрещён до нового 12-scope dry-run с нулём ошибок.

## 8. Безопасная последовательность следующей волны

1. Исправить P1/P2 и добавить isolated regression tests: prose `@tasks`, blank+JSDoc,
   multiline continuations, `//`/`#`, shebang/license, body tags fail closed.
2. Добавить P3 historical adapter с frozen commit boundary и tests: deleted ticket→history,
   missing Git object→fail closed, history never becomes owner.
3. Исправить historical collision TSK-169 и три whitespace-delimited dashboard headers; повторить
   IDs dry-run и проверить, что CLI files не получают `ID-design`.
4. Применить 10 ticket structure/target repairs и 3 empty-header repairs; каждый change должен
   ссылаться на heading/Purpose/Git evidence.
5. Reconcile 70 current-ticket groups по exact set ниже: exact target либо history/stale disposition,
   без превращения declaration/receipt в observed change.
6. Проверить 47 owner assignments через resolver; каждый файл должен иметь ровно один owner,
   остальные relations — history.
7. Acceptance: focused migration-file-header/task parser tests; historical shallow/full-history
   both-way; `plan --verify`; anchors/ids dry-run idempotency; 12 scope `move` dry-run = 0 blockers;
   source bytes unchanged при любом injected blocker; untouched V1 byte-exact/no diagnostics.
8. Только после этого возвращаться к уже утверждённой E-14/E-20 execution sequence.

Moves, corpus edits, commits и pushes этим proposal не выполнялись.
