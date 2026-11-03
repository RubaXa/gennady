# V14-2 — Автономный execute: «записывать вместо спрашивания» + разбор пачки одним вызовом оператора

Источник требования: решение **D-49** (`01-INTERVIEW-DECISIONS.md`): «execute должен быть автономным: все нестыковки и проблемы вместо вызова оператора записываются в задачи/открытые решения; по завершении сессии (пачки задач) оператор вызывается один раз и согласует по каждому решению: откатить / переделать / принять как есть; инструмент на шаге завершения выполнения всей пачки обязан проверить эти открытые вопросы». Жёсткие остановки (Approval #1/#2, красный обязательный гейт) под автосогласование **не** попадают.

Разложение D-49 на четыре механизма (сквозная нумерация ниже):

| M | Механизм | Требуемое свойство |
|---|---|---|
| M1 | Правило записи вместо вопроса | агент при неопределённости пишет запись, а не зовёт оператора |
| M2 | Durable объект отложенного решения | запись живёт в артефакте, читаемом свежим агентом; машинно-парсится |
| M3 | Гейт завершения пачки | инструмент отказывается закрыть пачку, если у записи нет вердикта |
| M4 | Один консолидированный разбор с оператором | вердикт по каждой записи: откатить / переделать / принять как есть |

Границы, которые D-49 не отменяет: `H_TICKET_NOT_APPROVED` (Approval #2), Approval #1 в spec-authoring,
`H_REAL_GATE_RED` (красный обязательный гейт), `EXTERNAL_AUTHORITY_REQUIRED`.

Чекаут v2 RC: `/private/tmp/claude-503/-Users-k-lebedev-Developer-gennady--claude-worktrees-nice-panini-8aa14e/400aa5cc-7ed6-4bdd-aa81-d8e4a3003aaf/scratchpad/rc-v6`
(ветка `lead/rel-17-baseline`, `227c03a8` + 2 коммита). Ниже пути внутри RC даны от корня чекаута.

---

## 1. v2 RC — что уже есть

Столбцы: `file:line` → что делает → пишет ли durable отложенное решение → проверяется ли на завершении пачки.

| file:line | Что делает | Durable запись? | Проверка на завершении пачки? |
|---|---|---|---|
| `ai/kit/axiom/process/ax-deviation-self-resolve.xml:2-24` | `AX_DEVIATION_SELF_RESOLVE`, cross-cutting: «дыра в спеке/тикете — НЕ повод прерывать оператора»; агент решает сам, пишет ticket-local Decision Log entry в точке решения, тегает Handoff `deviations: [<D-id>: <one-line>]`; оркестратор собирает все `deviations:` за прогон (один тикет или весь `batch`) и поднимает их ОДИН раз в конце как один batched `AskUserQuestion`: **add to the spec · roll back · accept as-is** | да — DL entry + строка Handoff | нет — только прозой в директиве |
| `ai/kit/axiom/process/ax-deviation-self-resolve.xml:14-18` | Разграничение каналов: дыра в артефакте → self-resolve; технический/инфра-разрыв → `RECOVERABLE_TECHNICAL`; отсутствующее разрешение → `EXTERNAL_AUTHORITY_REQUIRED`; принятие продуктового риска по открытому `MAJOR` остаётся за оператором | — | — |
| `ai/kit/contract/process/deviation-record-format.xml:2-16` | `DEVIATION_RECORD_FORMAT`: одна durable строка what/why/where; три канала (Decision Log спеки, DL узкого task index, `deviations:` в Handoff фазы); прямо сказано «Uncertainty does not pause an autonomous batch: record the smallest safe choice and continue. Operator review happens once, after the whole batch and its audits» | да | нет |
| `ai/kit/contract/process/handoff-format.xml:5-13` | `HANDOFF_FORMAT`: типизированная однострочная сдача с полями `artifacts` / `decisions` / `open` / `deviations`; `open` = «unresolved questions / risks / deferred sub-tasks (id + one-line)»; `deviations` = дыры, закрытые самостоятельно, каждая цитирует ticket-local DL id | да (обе: `open`, `deviations`) | нет |
| `cli/cmd/sdd-log/sdd-log.types.ts:247` | Регексп полезной нагрузки `complete`: `/^artifacts:\s*\[(.+)\];\s*decisions:\s*\[(.*)\];\s*open:\s*\[(.*)\];\s*deviations:\s*\[(.*)\]$/` — CLI машинно требует **наличия** обоих полей | да, CLI-владение записью | нет — валидируется форма, не вердикт |
| `cli/cmd/sdd-log/sdd-log.cmd.ts:395`, `cli/cmd/sdd-log/help.ts:36` | Сообщение об ошибке и справка по той же нагрузке | — | — |
| `ai/kit/templates/sdd-v2/execute.directive.hbs:132-134` | STEP_4_RECORD: при спорном автономном выборе Handoff несёт `deviations: [<what> ← <why> @ <path#anchor>]`; `sdd-log complete` персистит это в Execution Log, «rather than a second journal» | да | нет |
| `ai/kit/templates/sdd-v2/execute.directive.hbs:209-212` | STEP_7_CLOSE: **только в batch-режиме**, после всех тикетов и аудитов, динамически `READ_AND_USE_DIRECTIVE("ai/directives/sdd-v2/deviation-review.directive.xml")`; «Never pause for this review between tickets» | — | это и есть M4 как шаг директивы, без машинной проверки |
| `ai/kit/templates/sdd-v2/deviation-review.directive.hbs:1-37` | `SddDeviationReview` v1.0: STEP_1_COLLECT собирает DL entries пачки + `deviations` из Handoff + audit findings; STEP_2_REVIEW показывает три списка (`Deviations` / `Audit findings` / `Questions`) и спрашивает один раз; пустые три списка → завершить без церемонии | **нет** — Mission прямо: «writes no sidecar»; вердикт оператора нигде не персистится | нет |
| `ai/kit/templates/sdd-v2/execute.directive.hbs:9-21` | BeliefState execute: `ax-stateless-flow`, `ax-tool-invocation`, `ax-owner`, `ax-execution-order`, `ax-execution-log-plan-vs-fact`, `ax-verification-before-handoff`, `ax-group-audit-leaves-a-receipt`, `ax-group-review-leaves-a-receipt`, `ax-halt-vs-fail-distinction`, `ax-handoff-typed`, `ax-task-parallel` — **`ax-deviation-self-resolve` в списке отсутствует**, хотя именно оркестратор обязан собирать и поднимать записи | — | — (дефект активации) |
| `ai/kit/templates/sdd-v2/phase-execution-protocol.directive.hbs` (включение подтверждено `ai/kit/audit-halt-activation.mjs:144`), `ai/directives/sdd-v2/phase-execution-protocol/steps/STEP_4_HANDOFF.xml:28` | Аксиома активна у **воркера**, а описывает поведение **оркестратора** — это зафиксировано как исключение в `ai/kit/audit-contract-activation.mjs:333-337` (`AX_DEVIATION_SELF_RESOLVE->QUESTION_RULE_SLIM`) | — | — |
| `ai/kit/templates/sdd-v2/execute.directive.hbs:32-40` | HaltConditions: `H_AMBIGUOUS_TASK`, `H_TICKET_NOT_APPROVED`, `H_PHASE_BLOCKED`, `H_REAL_GATE_RED`, `H_REQUIREMENT_UNCOVERED` — жёсткие остановки, которые D-49 сохраняет | — | остановка до закрытия |
| `ai/kit/axiom/process/ax-dialogue-discipline.xml:3-11` | `AX_DIALOGUE_DISCIPLINE` (cross-cutting): «LOW confidence, OR a high-stakes step → hard stop, wait for the operator»; «The agent never closes a step it is unsure about»; названные hard stops (Approval Checks, SCALE) — вне правила proceed | — | **прямое противоречие M1** для execute: LOW confidence обязывает останавливаться, D-49 обязывает записывать |
| `ai/kit/axiom/critic/ax-uncertainty-is-signal.xml:1` | «"I don't understand X" is valid output. Uncertainty = underspecification» — одна строка, только critic | нет | нет |
| `ai/kit/contract/critic/oc-structured.xml:2` | `OC_STRUCTURED`: обязательные заголовки, включая `## What I did NOT understand`; «this read-only sensor never persists them itself» | нет (по контракту эфемерно) | нет |
| `ai/kit/axiom/process/ax-blocker-resolution-trail.xml:2-11` | `AX_BLOCKER_RESOLUTION_TRAIL`: строка с `🛑` + `BLOCKED` ACTIVE, пока позднее не появится строка с `✅` + `RESOLVED` со ссылкой; append-only; «Active history never implies an operator pause by itself»; резолюция обязана цитировать конкретную причину (пример в тексте — «operator chose option B») | **да, машинно-парсимо** | да — см. следующую строку |
| `shared/sdd/check.ts:490-501` | `hasActiveBlocker(...)`: если статус DONE → **ERR** `SDD_DONE_WITH_ACTIVE_BLOCKER`; иначе WARN `SDD_BLOCKER_OPEN` | — | **да** — единственный действующий образец «нельзя закрыть с незакрытым пунктом» |
| `shared/sdd/check.ts:2658-2686` | `FINAL_DISPOSITION` реестра research: `SDD_RESEARCH_DISPOSITION_MISSING`, `SDD_RESEARCH_DISPOSITION_PENDING` («accepted/superseded but FINAL_DISPOSITION is still pending»), `SDD_RESEARCH_DECISION_UNTRACED` | да | **да** — точный прецедент «запись со статусом `pending` роняет проверку» |
| `shared/sdd/group-receipt.ts:11-30` | `GROUP_RECEIPT_MARKER` (`SDD_AUDIT_RECEIPT` / `SDD_REVIEW_RECEIPT`), коды `SDD_GROUP_AUDIT_MISSING` / `SDD_GROUP_REVIEW_MISSING`, `signature` привязана к переисчисляемому состоянию членов группы (reopen инвалидирует), `gitRef` как провенанс, маркер схемы `<!--PHASE_RECEIPTS:v1-->` | да, forge-resistant | **да** — образец «durable факт разбора на границе завершения группы» |
| `ai/kit/templates/sdd-v2/execute.directive.hbs:178-191` | STEP_6_AUDIT_REVIEW: `npx gennady sdd-log <group> audit-receipt <verdict>` и `... review-receipt <verdict>`; CLI переисчисляет группу и отказывается, если не каждый член `[x] DONE` | да | да |
| `ai/kit/templates/sdd-v2/execute.directive.hbs:200-206` | STEP_7_CLOSE: перед summary `npx gennady sdd-check --all .` должен быть чист от `SDD_GROUP_AUDIT_MISSING` / `SDD_GROUP_REVIEW_MISSING`; «never close the group without them» | — | **да — готовая точка врезки M3** |
| `cli/cmd/sdd-task/sdd-task.types.ts:171` | `sdd-task <ticket>` печатает секцию `[BLOCKERS]` (`blockers: none` / `blockers: ACTIVE <n>`), которую потребляет оркестратор | — | да, для блокеров |
| `cli/cmd/sdd-task/sdd-task.types.ts:295` | Секция `[HANDOFF]` — **секции `[DEVIATIONS]` / `[OPEN]` нет**: отложенные решения оркестратору не поверхностятся | — | нет |
| `ai/kit/axiom/process/ax-close-with-integrity-check.xml:2-4` | «resolving or **consciously deferring** every finding before handing off» — «сознательное откладывание» не имеет durable адресата | нет | нет (дыра) |
| `ai/kit/contract/process/execute-summary-format.xml:12`, `ai/kit/contract/process/return-summary-format.xml:24` | Сводка прогона несёт отдельную строку про self-resolved дыры; `return-summary` требует агрегировать `deviations` «for the end-of-cycle batched report» | нет (текст сводки) | нет |
| `ai/kit/axiom/process/ax-reopen-format.xml:2-21` | `AX_REOPEN_FORMAT`: вердикт «переделать» уже имеет машинную форму — новый Round с конкретными `fix`+`test` PhaseID, Status → `[ ] TODO`, `Reopens: <new count>`, синк трекера | да | да (через `sdd-check`) |
| `ai/flow-eval/prompts.ts:72-73` | Headless-контракт: «Treat the scenario intent and acceptance criteria as the synthetic operator's answers…»; «collect assumptions and state them once in the final approval-boundary summary, never as invented durable rationale» | — | — |
| `ai/flow-eval/prompts.ts:74` | «Never waive a failed gate, accept a risk, or write an operator decision/Decision Log entry on the synthetic operator's behalf. A red required gate is a blocker and must remain visible.» | — | **конфликт**: запрещает писать DL entry, а `AX_DEVIATION_SELF_RESOLVE` требует именно ticket-local DL entry — сценарий eval на «записал вместо вопроса» без правки контракта недоказуем |
| `ai/flow-eval/scenarios.json` | 7 сценариев: `fibonacci-library`, `tic-tac-toe`, `slugify-toolchain`, `broken-specs-repair`, `infra-log-summary`, `infra-rotate-logs`, `infra-makefile` — **ни один не инъектирует дыру в спеке детерминированно** | — | нет |
| `ai/flow-sim/scenarios/S7-execute-lifecycle.md:807,853,872` | Sim-сценарий уже описывает ожидаемое поведение: собрать `deviations` и поднять ОДИН batched `AskUserQuestion` после пачки; отличает self-resolve от «gated on an operator-accepted…» | — | sim, не headless eval |
| `ai/kit/templates/sdd-v2/root.directive.hbs:66` | Ссылается на `H_ASK_WITHOUT_CARD` как «the gate the router enforces» | — | **висячая ссылка**: ни один блок HaltConditions в `ai/kit/templates/sdd-v2/**` его не объявляет; `ai/kit/templates/sdd-v2/router.directive.hbs:65-68` объявляет только `H_AMBIGUOUS_INTENT` / `H_SPEC_NOT_APPROVED` / `H_V2_INVALID` / `H_WRONG_REPO`; ссылка внесена в allowlist `ai/kit/audit-halt-activation.mjs:120-125` |
| `shared/sdd/session-boundary.ts:12-26` | `[!!! SESSION BOUNDARY — MUST REMEMBER !!!]` в выводе `sdd-state`/`sdd-task`/`sdd-new` — «session» в v2 = граница рабочего каталога, **не** сессия задач; терминология D-49 («по завершении сессии») отображается на `batch`, а не на этот токен | — | — |

**Вывод по §1.** Доктринальная часть D-49 в v2 RC **уже есть и почти дословно**: `AX_DEVIATION_SELF_RESOLVE`
даёт M1 + M4 с теми же тремя опциями («add to the spec · roll back · accept as-is» ≈ «переделать / откатить /
принять как есть»), `DEVIATION_RECORD_FORMAT` + `HANDOFF_FORMAT` дают M2, `deviation-review.directive` — шаг M4.
Отсутствует ровно **M3**: ни один код `sdd-check`/`sdd-verify` и ни один шаг `sdd-log` не смотрит на
записанные `deviations:`/`open:`; вердикт оператора нигде не персистится («writes no sidecar»), поэтому
пачку можно закрыть, ни разу не разобрав записи. Плюс три дефекта проводки: аксиома не активирована в
BeliefState `execute`, `AX_DIALOGUE_DISCIPLINE` противоречит M1 на LOW confidence, headless-контракт eval
запрещает запись, которую M1 требует.

---

## 2. v1 main @ `d37d5910` — что было

Поправка к постановке: рабочее дерево `/Users/k.lebedev/Developer/gennady` стоит на `recover-sdd-v2` (`0336c1ab`), а `main` на 19 коммитов **позади** `d37d5910`; на `d37d5910` нет ни `ai/kit/`, ни `ai/directives/sdd-v2/` — все строки ниже прочитаны через `git show d37d5910:<path>`. `ai/directives/sdd/execute*.xml` в v1 **не существует** (execute живёт как skill); `[LOG]`/`[RULES]` — секции вывода `sdd check --task <Task-ID>`, `--wip` — флаг `sdd verify --wip <target-files>`; отложенных решений ни то ни другое не касается.

| file:line | Что делает | Durable запись? | Проверка на завершении пачки? |
|---|---|---|---|
| `ai/skills/sdd-execute/SKILL.md:3` | Описание скилла уже включает «…and **reports non-routine execution decisions to the operator at the end**» — прямой предок D-49 на уровне одной задачи | — | — |
| `ai/skills/sdd-execute/SKILL.md:250-251` | Блок финальной сводки `🧭 Decisions made during execution:` — строка `<phase/timestamp> <decision> \| audit=<verified\|finding F-NN> \| backflow=<proposal\|none>` | нет (текст сводки) | нет |
| `ai/skills/sdd-execute/SKILL.md:265-267` | «Group `decision`/`insight` entries and audit `INSIGHT_BACKFLOW` findings here **once, after execution**. If backflow is proposed, ask the operator whether to **accept it into spec/task, revise the implementation, or create a follow-up task**» — те же три опции, что в D-49 (принять / переделать / отложить), уже сгруппированные в один разбор | нет | нет |
| `ai/skills/sdd-execute/SKILL.md:195-197` | Audit finding `conf=L` (обязательно `INFO`) и INFO `INSIGHT_BACKFLOW` → «preserve as a proposal for the final operator review. It does not get auto-applied and never causes another audit or Execution Round» | нет | нет |
| `ai/skills/sdd-execute/SKILL.md:199-200` | `decision-log` finding → «pause for the operator's explicit acknowledgement or rejection. The orchestrator never manufactures an acknowledgement» — это **hard stop** в v1, ровно тот класс, что D-49 сохраняет | — | останавливает |
| `ai/skills/sdd-execute/SKILL.md:201-204` | `ticket-update` / `spec-edit` → применить точную правку; «Record provisional spec/task choices as ordinary `decision` / `insight` evidence so the final summary shows them to the operator» | да, event-строки Execution Log | нет |
| `ai/skills/sdd-execute/SKILL.md:287` | HardForbidden: «Writing a risk acknowledgement or Decision Log acceptance without the operator's explicit choice» | — | запрет, не проверка |
| `ai/skills/sdd-execute/SKILL.md:285` | HardForbidden: «Writing a `✅ RESOLVED` marker for a blocker that is not resolved. `check-blockers` counts markers, so one makes it dispatch — that is a bug you can trigger, not permission you can grant» — прямое указание, что подделка вердикта = класс сфабрикованного `ver` | — | — |
| `ai/skills/sdd-execute/SKILL.md:42`, `:58`, `:67` | `✋ PAUSED awaiting operator decision` / `✋ AWAITING OPERATOR DECISION`: незакрытый BLOCKER, `exit 2` от `check-blockers`, `[!] BLOCKED` в Phases Overview → пауза (не провал) | да, через Execution Log | да, но **на входе**, до диспатча, а не на завершении пачки |
| `ai/skills/sdd-execute/scripts/check-blockers.sh:1-21` | Скан Execution Log: строки с `🛑`+`BLOCKED` против `✅`+`RESOLVED`; exit `0` чисто / `2` есть нерешённые / `4` bad invocation / `1` нет файла | — | **да** — единственный exit-код v1, который роняет диспатч из-за нерешённого пункта |
| `ai/directives/sdd/phase-execution-protocol.xml:309-313` | STEP: «Spec gap → `insight` line, never edit specs (per `AX_SPEC_NEVER_EDITED`)»; при вынужденном выборе — токен `decision <key>=<value> ← <reason>`, `insight` только если канонический текст обязан измениться, «carry the decision in Handoff, and continue through verification» — **v1-прообраз «записать вместо вопроса»** | да (event-строки + Handoff) | нет |
| `ai/directives/sdd/phase-execution-protocol.xml:169-170` | «Spec wrong / incomplete / stale → record `<ts> insight <observation> → <spec-section>, <what-change>`. Audit picks up these entries and proposes the spec change; operator approves and applies» | да | нет — «operator approves» без гейта |
| `ai/directives/sdd/phase-execution-protocol.xml:39` | Repo-wide гейт, падающий в чужих `Target Files`: «Record it in Handoff `open:` and continue» — второй канал отложенного пункта | да | нет |
| `ai/directives/sdd/phase-execution-protocol.xml:25`, `:187`, `HANDOFF_FORMAT` в `ai/kit/contract/process/handoff-format.xml:5-10` (v1-редакция) | Handoff v1 = `artifacts` / `decisions` / `open` — **без поля `deviations`**; `open` = «unresolved questions / risks / deferred sub-tasks» | да | нет |
| `ai/directives/sdd/phase-execution-protocol.xml:88-97` | v1-исходник `AX_BLOCKER_RESOLUTION_TRAIL`: 🛑/✅ парность, append-only, «Resolution authorship… MUST cite the specific environmental change or decision (e.g. "operator chose option B")»; «Empty resolution text → audit treats as fabricated» | да, машинно | да, через `check-blockers` |
| `ai/directives/sdd/phase-execution-protocol.xml:91-93` | «Count `🛑 BLOCKED` lines and `✅ RESOLVED` lines from Execution Log start… Otherwise → at least one ACTIVE blocker → **halt as PAUSED awaiting operator** (NOT failed)» | — | v2 RC сознательно ослабил это до «Active history never implies an operator pause by itself» (`ai/kit/axiom/process/ax-blocker-resolution-trail.xml:5-7`) |
| `ai/directives/sdd/phase-execution-protocol.xml:148`, `:355-359` | `BLOCKER_FORMAT`: `🛑 <ts> BLOCKED: <cause>` + `💬 unblock: <concrete operator action>`; статус фазы → `[!] BLOCKED`; вернуть BLOCKED оркестратору | да | да |
| `ai/directives/sdd/scaffold.directive.xml:180-187` | `AX_REOPEN_TICKET_FORMAT`: «Reopens accumulate as appended Rounds in one ticket»; Meta `Reopens: <count> (<date> — <last reason>)`; Status → `[~] IN_PROGRESS`; `### Round N — <date>, <reason>` append-only; re-run только помеченных фаз — **машинная форма вердикта «переделать»** | да | да (через `sdd check`) |
| `ai/directives/sdd/audit.directive.xml:83`, `:96`, `:110`, `:335-342`, `:537-564` | `INSIGHT_BACKFLOW` как тип finding + `AX_INSIGHT_BACKFLOW_CAPTURE` + `STEP_7_INSIGHT_BACKFLOW`: наблюдение, меняющее понимание контракта, оформляется как `INFO`-предложение `spec-edit` «for final operator review», не роняя вердикт | нет (finding эфемерен) | нет |
| `ai/directives/sdd/audit.directive.xml:62`, `:82`, `:240`, `:507-510` | `sdd check --task <Task-ID>` отдаёт секции `[LOG]` (`unknown-token` / `unclosed-round` / `bad-round-close` / `entry-after-close` / `extra-close-entry`) и `[RULES]`; целостность Execution Log решается механикой, «not by eye» | — | да, но только про форму лога |
| `ai/skills/sdd-execute-batch/SKILL.md:37` | «Printing the plan is informational. **The operator's invocation authorizes execution; do not ask for** [confirmation]» — v1 batch уже автономен по входу | — | — |
| `ai/skills/sdd-execute-batch/SKILL.md:77` | «The batch invocation already authorizes this task. **Preserve all operator-decision and external-**[state pauses]» — автономность не отменяет hard stop | — | — |
| `ai/skills/sdd-execute-batch/SKILL.md:86-89` | Классификация терминального результата лейна: `[x] DONE` / `[!] BLOCKED` / `PAUSED` (operator/external-state) / `FAILED`; продолжать несвязанные задачи | да, в Meta тикета | да, на quiescence |
| `ai/skills/sdd-execute-batch/SKILL.md:106-108` | «Final summary… Group **non-routine execution decisions** and `INSIGHT_BACKFLOW` proposals **once at the end for operator review**» — прямой предок `deviation-review.directive` | нет | нет |
| `ai/skills/sdd-execute-batch/SKILL.md:119` | HardForbidden: «Editing code, specs, tickets, Execution Logs, or trackers directly from the batch scheduler» — у batch-уровня **нет права записи**, поэтому вердикт пачки в v1 персистить негде | — | — |
| `shared/sdd/check.ts:154` (рабочее дерево; на `d37d5910` `shared/sdd/` отсутствует) | `SDD_DONE_WITH_ACTIVE_BLOCKER` есть; `SDD_BLOCKER_OPEN`, `SDD_GROUP_*_MISSING`, `SDD_RESEARCH_DISPOSITION_*` — **нет** | — | — |

**Вывод по §2.** v1 уже практиковал D-49 «в прозе»: фаза при дыре в спеке пишет `decision`/`insight`/
`open:` и продолжает; оркестратор группирует «non-routine execution decisions» и `INSIGHT_BACKFLOW`
один раз в конце и спрашивает оператора «accept / revise / follow-up». Машинного гейта не было ни в v1,
ни в v2: единственный работающий exit-код — `check-blockers` (v1) / `SDD_DONE_WITH_ACTIVE_BLOCKER` (оба),
и он смотрит на 🛑 BLOCKED, а не на записанное отложенное решение. v2 RC добавил ровно два новых кирпича
поверх v1: поле `deviations` в Handoff (машинно валидируемое `sdd-log`) и отдельную директиву
`deviation-review`. Ни один из них не проверяется на завершении пачки.

---

## 3. Покрытие плана

Сначала — важное размежевание. `_raw/V14-PROPOSALS-TRIAGE.md:52-73` (предложение №2) **ОТКЛОНЯЕТ**
«свой read = апрув на низкорисковых гейтах» и **ОТЛАГАЕТ** под id `V14-2` вынос headless-контракта
`ai/flow-eval/prompts.ts:66-73` в продукт. D-49 — **не** отклонённая половина: он не самоодобряет ни
один гейт, а переносит человеческий гейт со «после каждого шага» на «после пачки», сохраняя
Approval #1/#2 и красный обязательный гейт как hard stop. То есть D-49 ложится ровно в защищённую
формулировку `:64` («промежуточные чекпойнты — авто; именованные Approval и красный гейт — никогда»),
и его исполнители логично идут как `V14-2a..e` под тем же зонтиком.

| M | Покрыто | Задачи / критерии | Не покрыто |
|---|---|---|---|
| M1 (записывать вместо вопроса) | доктринально **да**, задачей — **нет** | `40-TRACK-DIRECTIVES-SKILLS.md:254` (D7.5 → **ЕСТЬ**, «+ новое поле `deviations`»); `:438` (`deviation-review.directive.xml` как post-batch обзор, вердикт **ЧАСТИЧНО** → **T-B6-04**) | `ax-deviation-self-resolve` не активирован в BeliefState `execute`; конфликт с `AX_DIALOGUE_DISCIPLINE` (LOW confidence → hard stop) в плане не зафиксирован — `40 §1.1` разбирает набор диалоговых аксиомов, но именно эту нестыковку не называет |
| M2 (durable объект) | **частично** | **B2-19** + **A11** — но только про `## Blocker Trail` и `sdd-log resolved`, т.е. про блокеры, не про отложенные решения; **ISS-11** (issue #22, провенанс Handoff, `20-ISSUES-VERDICTS.md:372-382`, `ГОТОВ К ВЫДАЧЕ`) даёт нужную дисциплину «не выдавать догадку за факт»; **ISS-12** (issue #23, `20:393`, → `B2-03`+`B2-04`, критерий **A7** «`correction` в словаре») даёт словарь токенов Execution Log, без которого вердикт нечем записать | нет исполнителя у объекта отложенного решения; `sdd-task` не поверхностит его (нет `[DEVIATIONS]` рядом с `[BLOCKERS]`) |
| M3 (гейт завершения пачки) | **НЕ покрыто ни одной задачей** | ближайшие образцы-механики: **B2-20** (WARN→ERROR групповых квитанций, **A13**) и **B2-13** (групповая квитанция в pickable) | нет кода `sdd-check`, нет шага `sdd-log`, нет пункта в `execute.directive.hbs` STEP_7_CLOSE — пачку можно закрыть, не разобрав ни одной записи |
| M4 (один разбор с вердиктом) | **частично** | директива существует; **T-B6-16** (`ax-re-dispatch.xml` + `H_NO_PROGRESS`, `40:327-330`) и **E-17** (`budget-exhausted`) владеют «не зацикливаться» — по `V14-PROPOSALS-TRIAGE.md:71` это отдельная от автономии тема | вердикт нигде не персистится (`deviation-review.directive.hbs:4-5` «writes no sidecar»); ни одна задача не утверждает, что обзор вообще запускается |
| Замок «спросил без карточки» | **частично** | **GAP-3** (`61-TASK-BOARD.md:224`, критерий **A22**): «`H_ASK_WITHOUT_CARD` объявлен в директиве **либо** снят из аллоулиста kit-аудита» | GAP-3 не знает, *зачем* его объявлять. D-49 даёт триггер: спросил оператора посреди пачки о дыре в артефакте, не записав карточку |
| Eval-доказательство | **частично** | **V14-3** (`V14-PROPOSALS-TRIAGE.md:178-183`): раздел «инъекция → ожидаемое изменение исхода» в `GAP-E-5` + эталонный причинный кейс поверх **E-23**, both-way, `S`, Волна 4; **GAP-E-1** (fail-fast `phase`/`mode`, критерий **A21**) — предпосылка | ни один из 7 сценариев `ai/flow-eval/scenarios.json` не инъектирует дыру в спеке; и `prompts.ts:74` прямо запрещает запись DL-entry, которую M1 требует — сценарий сегодня недоказуем |
| Критерий приёмки | **нет** | **A11** покрывает только `## Blocker Trail` (`60-ACCEPTANCE.md`, строка A11); `A24` в документе отсутствует (последний — **A23**) | нужен **новый A24** |

**Корпус.** `_raw/research/R2-academic-review.md:353-372` требование **№8 (P0)**: «Uncertainties и
assumptions — first-class объекты, а не свободный текст: вместо "Probably PostgreSQL" —
`unresolved_decision: question / affects`. Самый опасный класс галлюцинаций — plausible but unstated
architectural assumptions». Требование **№9 (P0)**: «Человеческий gate после каждого шага процесса».
Предупреждения, которые нельзя нарушить попутно: **№3** (LLM-as-judge запрещён как единственный
release gate) и **№5** (шкала статусов вместо одного флага `verified`).
`_raw/research/R1-discussion-and-evidence.md:540` (**T9**, research-only): персистентный след
неразрешённых допущений оправдан «только после инструментирования текущего флоу»; уровень **P** для
того, что есть (`ax-uncertainty-is-signal.xml:2` + transient `## What I did NOT understand`),
failure condition — «**реестр растёт, но не меняет решений/гейтов**». Сегодняшний RC находится ровно
в этом failure condition: `deviations` пишутся, `deviation-review` их показывает, и ничего от этого
не зависит.

---

## 4. Дизайн (минимальный, корпус-совместимый)

### 4.1 Объект отложенного решения — выбор якоря

Три кандидата и почему выбран третий:

| Кандидат | Почему нет / да |
|---|---|
| Секция тикета `## Blocker Trail` | секции ещё нет (её создаёт **B2-19**), и семантически она про 🛑 BLOCKED — блокер уже остановил работу, отложенное решение работу **не** останавливало. Слияние двух смыслов сломает `SDD_DONE_WITH_ACTIVE_BLOCKER` |
| Handoff-поле `deviations: [...]` | машинно валидируется уже сегодня (`cli/cmd/sdd-log/sdd-log.types.ts:247`), но это **индекс**, а не объект: append-only строка внутри закрытого раунда, в которую вердикт дописать нельзя, не нарушив append-only (`ax-blocker-resolution-trail.xml:11`) |
| **Ticket-local Decision Log entry** | **выбран.** Уже обязателен по `ax-deviation-self-resolve.xml:5-8`; `AX_TICKET_WRITE_SCOPE` уже делает секцию writable «for exactly this purpose»; грамматика уже машинно проверяется (`SDD_DL_ID_GRAMMAR`, `SDD_DL_ID_COLLISION`, `SDD_DL_ACRONYM_MISMATCH`, `SDD_DL_ID_PLACEHOLDER`); запись живёт в артефакте, который свежий агент и так читает. Новая только одна вещь — завершающий токен вердикта |

Грамматика = `DECISION_LOG_ENTRY_FORMAT` плюс один закрытый токен:

```
<ACR>-DL-N <date> — <what>; где: <path#section> (почему: <why>) [verdict: pending-operator]
```

После разбора токен заменяется ровно на одно из: `[verdict: accepted <date>]` ·
`[verdict: rework → Round <N>]` · `[verdict: rolled-back <ACR>-DL-<M>]`. Handoff-поле
`deviations:` остаётся индексом и цитирует `<D-id>` (как уже требует `handoff-format.xml:12`) —
второго журнала не появляется, запрет `DEVIATION_RECORD_FORMAT` на sidecar соблюдён.
Шкала `pending-operator → accepted | rework | rolled-back` — это R2 №5 «шкала статусов вместо
одного флага» в миниатюре, и она изоморфна уже существующей `FINAL_DISPOSITION`
(`shared/sdd/check.ts:2658-2686`).

### 4.2 Правило записи для execute (M1)

Что агент пишет вместо вопроса: при дыре в спеке/тикете — DL-запись выше + `<D-id>` в
`deviations:`, и продолжает (буквально `ax-deviation-self-resolve.xml:2-12`, уже написано).
Меняется одна вещь: ветка `AX_DIALOGUE_DISCIPLINE` «LOW confidence → hard stop»
(`ax-dialogue-discipline.xml:5`) становится **flow-scoped** — в `execute` (и в
`phase-execution-protocol`) LOW confidence о дыре в артефакте → записать, не останавливаться;
в `interview` / `scope` / `module` / `infra` ветка остаётся как есть.

Что остаётся hard stop, дословно по существующим носителям: Approval #1 (`H_SPEC_NOT_APPROVED`,
`router.directive.hbs:66`), Approval #2 (`H_TICKET_NOT_APPROVED`, `execute.directive.hbs:36`),
красный обязательный гейт (`H_REAL_GATE_RED`, `:38`), непокрытое требование
(`H_REQUIREMENT_UNCOVERED`, `:39`), `EXTERNAL_AUTHORITY_REQUIRED` и принятие продуктового риска по
открытому `MAJOR` (`ax-deviation-self-resolve.xml:17`), audit-finding с `route=decision-log`
(v1-предок: `ai/skills/sdd-execute/SKILL.md:199`).

Замок обратной стороны: `H_ASK_WITHOUT_CARD` получает **объявление** в `execute.directive.hbs`
HaltConditions с триггером «оператор был спрошен посреди пачки о дыре в артефакте без записи
`[verdict: pending-operator]`». Это закрывает **GAP-3** через объявление, а не через снятие из
аллоулиста `ai/kit/audit-halt-activation.mjs:120-125`.

### 4.3 Гейт завершения пачки (M3)

Новый код в `shared/sdd/check.ts`, по образцу пары `SDD_DONE_WITH_ACTIVE_BLOCKER` / `SDD_BLOCKER_OPEN`
(`:490-501`) и `SDD_RESEARCH_DISPOSITION_PENDING` (`:2676`):

- `SDD_DEVIATION_VERDICT_MISSING` — **ERROR**, если Meta Status тикета `[x] DONE` и в его Decision Log
  есть хотя бы одна запись `[verdict: pending-operator]`;
- та же ситуация при не-DONE тикете — **WARN** (посреди пачки гейт не мешает, ровно как `SDD_BLOCKER_OPEN`).

Точка врезки в директиву уже существует: `execute.directive.hbs:200-206`, STEP_7_CLOSE уже требует,
чтобы `groupReceiptGate` (`npx gennady sdd-check --all .`) был чист от `SDD_GROUP_AUDIT_MISSING` /
`SDD_GROUP_REVIEW_MISSING`. Добавляется третий код в тот же список и та же формулировка «never close
the group without them».

Писатель вердикта: `npx gennady sdd-log <ticket> deviation-verdict <D-id> <accepted|rework|rolled-back>` —
CLI-владение правкой токена, в том же семействе, что `sdd-log <group> audit-receipt <verdict>`
(`execute.directive.hbs:183`). `rework` обязан сослаться на раунд, открытый по `AX_REOPEN_FORMAT`;
`rolled-back` — на DL-id, которым решение отменено. Это снимает тупик «writes no sidecar»: директива
не создаёт файл, она правит уже существующую запись.

Сбор без археологии: `sdd-task <ticket>` получает секцию `[DEVIATIONS]` рядом с `[BLOCKERS]`
(`cli/cmd/sdd-task/sdd-task.types.ts:171`) — одним вызовом, как требует `AX_STATELESS_FLOW`.

### 4.4 Шаг разбора с оператором (M4)

`deviation-review.directive.hbs` STEP_2_REVIEW остаётся как есть, но опции берутся из D-49 и
называются по-русски: **принять как есть** · **переделать** · **откатить** (сегодня в
`ax-deviation-self-resolve.xml:23` — «add to the spec · roll back · accept as-is»; «add to the spec»
и «переделать» — одно и то же действие, формулировку надо свести к одной). Один
`AskUserQuestion` на всю пачку: взаимно независимые записи батчатся в один вызов —
`QUESTION_RULE_SLIM` это прямо разрешает. Добавляется STEP_3_PERSIST: по каждой записи вызвать
`sdd-log deviation-verdict`, затем перепрогнать `sdd-check --all .` и только после зелёного отдать
сводку.

### 4.5 Как это удовлетворяет корпус

- **R2 №8** — отложенное решение становится типизированным объектом с ровно теми полями, которых
  требование просит: `question` = `<what>`, `affects` = `где: <path#section>`, плюс `почему` и статус
  из закрытого словаря. Свободного текста «Probably PostgreSQL» больше не остаётся: без токена
  вердикта запись не парсится грамматикой DL.
- **R2 №9** — человеческий гейт не удаляется, меняется его гранулярность: «после каждого шага» →
  «после пачки», и из переноса **исключены** три класса (Approval #1/#2, красный обязательный гейт,
  внешняя авторитетность) — то есть у каждой необратимой границы человеческий гейт остаётся
  пошаговым. Это отступление от №9 фиксируется явно, а не молча.
- **R2 №3 / №5** — механическая половина гейта детерминирована (код `sdd-check`), судья не участвует:
  ни одна модель не решает, что отклонение допустимо. Статус — шкала, не флаг.
- **T9 failure condition снят по построению**: запись `pending-operator` красит
  `sdd-check --all .`, а STEP_7_CLOSE не может выдать сводку по красному прогону. Реестр не «растёт,
  не меняя гейтов» — он **и есть** гейт завершения. Falsifiability берётся у **V14-3**: both-way
  инъекция (с инъекцией — код есть и exit≠0, без инъекции — кода нет и exit 0).
- **Побочная правка, без которой eval недоказуем**: `ai/flow-eval/prompts.ts:74` запрещает «write an
  operator decision/Decision Log entry on the synthetic operator's behalf». Формулировку надо
  разделить: решение оператора и принятие риска — по-прежнему запрещены, а собственная
  agent-owned запись `[verdict: pending-operator]` — обязательна. Красный required-гейт остаётся
  видимым блокером — эта часть строки не меняется.

---

## 5. Задачи

Зонтик — `V14-2` из `_raw/V14-PROPOSALS-TRIAGE.md:69` (после `2.0.0-draft`, релизный объём A1–A23 не сдвигается). Критерий — **новый A24** (A11 покрывает только `## Blocker Trail`).

| id | Что | Размер | Волна | Deps | Приёмка + команда доказательства |
|---|---|---|---|---|---|
| **V14-2a** | Аксиом/директива: активировать `ax-deviation-self-resolve` в BeliefState `execute.directive.hbs:9-21`; сделать ветку LOW-confidence в `ax-dialogue-discipline.xml:5` flow-scoped; объявить `H_ASK_WITHOUT_CARD` в HaltConditions `execute.directive.hbs:32-40`; ввести токен `[verdict: …]` в `deviation-record-format.xml` + `DECISION_LOG_ENTRY_FORMAT`; свести опции к «принять как есть / переделать / откатить» в `ax-deviation-self-resolve.xml:23` | S | пост-релиз, вслед за `T-B6-08` | `T-B6-08`, `GAP-3` | `npm run audit:sdd-templates` зелёный **при удалённой** записи `'root.directive::H_ASK_WITHOUT_CARD'` из аллоулиста `ai/kit/audit-halt-activation.mjs:122` (доказывает: halt объявлен, а не занесён в исключения); `node --test ai/kit/__tests__/deps.test.ts` — аксиом числится зависимостью `execute` |
| **V14-2b** | CLI-проверка: `SDD_DEVIATION_VERDICT_MISSING` в `shared/sdd/check.ts` (ERROR при `[x] DONE`, WARN иначе); писатель `sdd-log <ticket> deviation-verdict <D-id> <verdict>`; секция `[DEVIATIONS]` в `sdd-task` | M | пост-релиз | `V14-2a`, `B2-01`, `B2-19` | both-way на фикстуре: тикет DONE с `[verdict: pending-operator]` → код присутствует, `sdd-check --task` exit≠0; после `sdd-log deviation-verdict … accepted` → кода нет, exit 0. `node --import tsx --test shared/sdd/__tests__/check.test.ts cli/cmd/sdd-log/__tests__/sdd-log.cmd.test.ts cli/cmd/sdd-task/__tests__/sdd-task.cmd.test.ts` |
| **V14-2c** | Шаг пачки: третий код в `groupReceiptGate` (`execute.directive.hbs:200-206`); STEP_3_PERSIST в `deviation-review.directive.hbs`; Mission переформулировать «writes no sidecar» → «не создаёт файл, правит существующую DL-запись» | S | пост-релиз | `V14-2b` | `npm run audit:sdd-templates` + `node --import tsx --test ai/kit/__tests__/stateless-sdd-flow-contract.test.ts`; кейс «группа с `pending-operator` не закрывается»: `npx gennady sdd-check --all <fixture>` exit≠0 до вердикта и exit 0 после |
| **V14-2d** | Eval: правка `ai/flow-eval/prompts.ts:74` (разделить «operator decision» и agent-owned `pending-operator`); один сценарий с **детерминированной инъекцией** дыры в спеке (фаза, которой нужен retry-cap, о котором спека молчит) | S | пост-релиз, поверх `V14-3` | `V14-2c`, `V14-3`, `GAP-E-1`, `GAP-E-5` | both-way (`ai/flow-eval/QUALITY-RULES.ru.md:10-16`): с инъекцией — ровно одна DL-запись `[verdict: pending-operator]` и **ноль** вызовов интерактивного вопроса; без инъекции — записи нет. `node --import tsx --test ai/flow-eval/__tests__/injection-golden.test.ts` (файл создаёт `V14-3`) + `npm run test:sdd-flow-eval` зелёный |
| **V14-2e** | Бухгалтерия: критерий **A24** в `60-ACCEPTANCE.md`; строки `V14-2a..d` в `61-TASK-BOARD.md §1`; правки трёх существующих задач (ниже) | S | вместе с `V14-2a` | — | `A24` присутствует, у него есть колонка «задачи-исполнители»; `grep -c "V14-2" 61-TASK-BOARD.md` ≥ 4 |

**A24 (формулировка):** «Отложенное решение — машинно-проверяемый объект: запись
`[verdict: pending-operator]` в ticket-local Decision Log делает `sdd-check --all .` красным на
границе завершения группы; пачка не закрывается, пока по каждой записи не выставлен вердикт
`принять как есть` / `переделать` / `откатить`; hard stops (Approval #1/#2, красный обязательный
гейт, внешняя авторитетность) под перенос не попадают; вопрос оператору посреди пачки без записанной
карточки — `H_ASK_WITHOUT_CARD`.» Доказательство — приёмки `V14-2b`/`V14-2c`/`V14-2d`.

**Правки существующих задач:**

- **T-B6-16** (`61:156`) — в приёмку добавить: повтор блокирующего набора, у которого единственная
  дельта — новая запись отклонения, **всё равно** даёт `H_NO_PROGRESS` (запись не является новым
  evidence), и при этом запись доживает до гейта `V14-2c`. Без этой строки `H_NO_PROGRESS` и M1
  начнут спорить: один требует останова, другой — записи и продолжения.
- **B2-19** (`61:82`) — внести явный **не-goal**: `## Blocker Trail` остаётся исключительно про
  🛑 BLOCKED; объект отложенного решения живёт в Decision Log. Переиспользуется только машинерия
  анкоров (`shared/sdd/anchor-inject.ts`, `sdd-extract`) — её `V14-2b` берёт для `[DEVIATIONS]`.
  Критерий **A11** при этом не расширяется.
- **E-17** (`61:191`) — третья строка both-way: пачка, завершившаяся `budget-exhausted`, по
  построению оставляет неразобранные `pending-operator`; агрегированный exit-код остаётся 0 (D-28),
  но группа **не закрывается** и число неразобранных записей печатается в исходе. Иначе
  `budget-exhausted` станет обходом гейта M3.

**Открытый вопрос оператору.** «Переделать» и «add to the spec» — это одно действие или два?
Сегодняшний текст `ax-deviation-self-resolve.xml:23` предлагает «add to the spec», D-49 говорит
«переделать»: первое правит спеку под уже сделанный код, второе правит код под спеку. Словарь
вердиктов закрытый, поэтому выбор надо сделать до `V14-2a`; предложение — оставить три токена и
трактовать `rework` как «правка артефакта-владельца по `AX_REOPEN_FORMAT`», а правку спеки считать
частным случаем той же маршрутизации.
