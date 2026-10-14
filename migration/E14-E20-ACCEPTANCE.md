# E-14 / E-20 — финальное acceptance evidence

## Frozen input и объём

- Frozen release: `130f8091836216e5259786d61eaa996dd709d0e3`.
- Implementation base после prerequisite FO-6 fixes: `6c077d31b0f4c233d57fc315e8d90302987203bf`.
- Мигрировано: 12 scope, 68 spec units, 127 legacy tickets.
- В итоговом `specs/**`: 128 task files = 127 migrated + 1 pre-existing V2 ticket.
- Одноразовая `FILE-SPEC-MAP.tsv`: 1 221 data row; runtime registry/path inference не добавлялись.

## E-14 acceptance

- `sdd-check --all .`: 47 errors / 1 511 warnings; относительно frozen GAP-B-1 baseline — **0**
  новых error identities по `(code, file, severity)`.
- Оставшиеся 47 errors — только уже известные baseline identities:
  `SDD_SPEC_SECTION_MISSING×2`, `SDD_DIAGRAM_CAPTION_MISSING×1`,
  `SDD_BDD_REQUIREMENT_UNTRACED×37`, `SDD_RESEARCH_DISPOSITION_MISSING×6`,
  `SDD_MODULE_DAG_CYCLE×1`.
- MIGRATION grade: **PASS** — `FLOW_VERSION=v2`, `new-error-identities: none`,
  `executability-remaining: none`.
- Executable bar: `READINESS=ready`, `EXECUTION_READY=yes`; migration-critical
  `SDD_VERIFICATION_TABLE_INVALID` / `SDD_COVERAGE_POLICY_INVALID` — 0.
- Повторный `sdd-migrate move` dry-run: 12/12 scope отвечают `no-op — уже мигрирован в v2`.
- Evidence-based reconciliation не синтезировала receipts: unproven DONE/phase статусы
  переоткрыты; inter-ticket dependencies сохранены в META, а Phase Overview содержит
  только local `P*` references.

## E-20 acceptance

- `tasks/` отсутствует.
- `sdd-state .` печатает `FLOW_VERSION=v2`.
- Frozen E-22 golden-v1 proof проходит без rebaseline: expected V1 exit=1 и warning identity
  остаются явными, новых error identity нет.
- Три утверждённых оператором `Critic Rounds` удалены из актуального дерева; Git history остаётся
  единственным архивом этого рабочего журнала.

## Lifecycle note

68 migration unit maps — versioned pre-write audit input. После scope move они намеренно ссылаются на
исторические `tasks/**`; поэтому post-write `plan --verify` показывает inventory drift. Это не
подменяет no-op proof: post-write idempotency доказывается штатным `move` adapter на каждом
фактическом V2 scope.
