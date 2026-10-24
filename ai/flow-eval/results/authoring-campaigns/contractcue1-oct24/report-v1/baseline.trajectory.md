# Authoring trajectory baseline

Source: ddd26bd88a4b80389faf95e2533766ae44e6f84f; model: llm-proxy/deepseek-v4-flash. Recorded 12/12.

Baseline only — no prompt, speed or quality improvement is claimed.

| Case | Saved/planned | Artifact | Semantic | Joint | Path proven | Tools median | Reads | Writes/edits | Bash | Repeated reads | Worker tokens* | Worker messages | Worker seconds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| module-flat | 6/6 | 5 | 4 | 4 | 0 | 29 | 13.5 | 2 | 11 | 1 | 57721.5 (6/6) | 17.5 | 100.8 |
| module-nested | 6/6 | 5 | 5 | 4 | 0 | 25 | 10.5 | 2 | 12.5 | 0 | 49700.5 (6/6) | 19.5 | 104.0 |

*Non-cache tokens. Per-role input/output/reasoning/cache counters are in report.json. Cost and provider HTTP retries are unknown.

- A baseline only: no optimization or causal speedup has been demonstrated.
- Artifact, semantic and path verdicts are separate; opaque Bash is not proof of a forbidden write.
- Read/write counts are attempts, not bytes read or filesystem changes. An observed repeat is not necessarily waste.
- Token totals exclude cache reads; cache counters and model messages are separate in per-role profiles.
- SDK REST requests include polling and are not provider HTTP calls; proxy retries and monetary cost are unknown.
- Three repetitions describe these synthetic artifact cases, not statistical equivalence or the complete interactive SDD flow.

## authoring-contractcue1-oct24-module-flat-baseline-r1

Artifact=true; semantic=pass; path=false; status=completed.

Failed artifact checks: none. Path detail: opaque Bash command: whole-write-only path unproven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | bash | Unclassified; see safe command/raw trace | unknown | ls -la | completed | 0 | unrecognized-command |
| 2 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 3 | bash | Unclassified; see safe command/raw trace | unknown | find ai specs docs -type f   sort | completed | 0 | opaque-shell |
| 4 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module normalize | completed | 0 |  |
| 5 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 6 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 12 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 13 | read | Read reference context; necessity not proven | reference | docs/token-contract.md | completed | unknown |  |
| 14 | read | Read reference context; necessity not proven | reference | specs/README.md | completed | unknown |  |
| 15 | bash | Unclassified; see safe command/raw trace | unknown | cat package.json; git status --porcelain; find specs -type f   sort | completed | 0 | opaque-shell |
| 16 | grep | Inspect available paths/state | discovery | unknown | completed | unknown |  |
| 17 | grep | Inspect available paths/state | discovery | unknown | completed | unknown |  |
| 18 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 19 | bash | Unclassified; see safe command/raw trace | unknown | git log --oneline --all -10; git branch -a | completed | 0 | opaque-shell |
| 20 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 21 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 22 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 23 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 24 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 25 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 26 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 27 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 28 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 29 | bash | Unclassified; see safe command/raw trace | unknown | git diff --stat; find specs/token/normalize -type f   sort | completed | 0 | opaque-shell |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/normalize/normalize.spec.md ×3; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; docs/token-contract.md ×1; specs/README.md ×1.

Temporal batching candidates: 5+6, 6+7, 7+8, 8+9, 9+10, 10+11, 11+12, 12+13, 13+14. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-contractcue1-oct24-module-nested-baseline-r1

Artifact=true; semantic=pass; path=false; status=completed.

Failed artifact checks: none. Path detail: opaque Bash command: whole-write-only path unproven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 2 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module pipeline/normalize | completed | 0 |  |
| 3 | read | Read current target (skeleton or result) | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 4 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 5 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 6 | bash | Unclassified; see safe command/raw trace | unknown | cat ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | 0 | unrecognized-command |
| 7 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 1 | embedded-shell-payload-withheld |
| 8 | bash | Unclassified; see safe command/raw trace | unknown | cat ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | 0 | unrecognized-command |
| 9 | bash | Unclassified; see safe command/raw trace | unknown | cat ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | 0 | unrecognized-command |
| 10 | bash | Unclassified; see safe command/raw trace | unknown | cat ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | 0 | unrecognized-command |
| 11 | bash | Unclassified; see safe command/raw trace | unknown | cat ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | 0 | unrecognized-command |
| 12 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "module acronym ACR SPEC_ID" ai/directives/sdd-v2 --glob '*.xml'   head -80 | completed | 0 | opaque-shell |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 14 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 1 | embedded-shell-payload-withheld |
| 15 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 16 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 17 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 18 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 19 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 20 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 21 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 22 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/pipeline/normalize/normalize.spec.md ×1; specs/token/token.spec.md ×1.

Temporal batching candidates: 0+1. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-contractcue1-oct24-module-flat-baseline-r2

Artifact=true; semantic=pass; path=false; status=completed.

Failed artifact checks: none. Path detail: opaque Bash command: whole-write-only path unproven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 2 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module normalize | completed | 0 |  |
| 3 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 4 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 5 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 6 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 8 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 10 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 11 | read | Read reference context; necessity not proven | reference | specs/infra-base/infra-base.spec.md | completed | unknown |  |
| 12 | bash | Unclassified; see safe command/raw trace | unknown | grep -rn "REQ-" docs ai specs --include='*.md' --include='*.xml'   head -50 | completed | 0 | opaque-shell |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 14 | read | Read reference context; necessity not proven | reference | docs/token-contract.md | completed | unknown |  |
| 15 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 16 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-diagram-ladder.example.md | completed | unknown |  |
| 17 | bash | Unclassified; see safe command/raw trace | unknown | grep -rn "acronym\ ACR" ai/directives/sdd-v2/module.directive.xml ai/directives/sdd-v2/formats/module-spec-structure.xml   head -40 | completed | 0 | opaque-shell |
| 18 | bash | Unclassified; see safe command/raw trace | unknown | grep -rn "SPEC_ID\ acronym" ai/directives/sdd-v2/*.xml   grep -i "module\ acronym\ spec_id"   head -40 | completed | 0 | opaque-shell |
| 19 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 20 | bash | Unclassified; see safe command/raw trace | unknown | grep -n "DECISION_LOG_ENTRY_FORMAT" -A45 ai/directives/sdd-v2/infra.directive.xml   head -70 | completed | 0 | opaque-shell |
| 21 | bash | Unclassified; see safe command/raw trace | unknown | grep -n "DECISION_LOG_ENTRY_FORMAT" ai/directives/sdd-v2/infra.directive.xml   head | completed | 0 | opaque-shell |
| 22 | bash | Unclassified; see safe command/raw trace | unknown | sed -n '600,660p' ai/directives/sdd-v2/infra.directive.xml | completed | 0 | opaque-shell |
| 23 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 24 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 25 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 26 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 27 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 28 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 29 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/normalize/normalize.spec.md ×2; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; specs/infra-base/infra-base.spec.md ×1; docs/token-contract.md ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; ai/directives/sdd-v2/formats/module-diagram-ladder.example.md ×1.

Temporal batching candidates: 0+1, 5+6, 6+7, 7+8, 8+9, 14+15, 15+16. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-contractcue1-oct24-module-nested-baseline-r2

Artifact=true; semantic=fail; path=false; status=completed.

Failed artifact checks: none. Path detail: opaque Bash command: whole-write-only path unproven; actual create→target read→whole Write order not proven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | bash | Unclassified; see safe command/raw trace | unknown | cat inputs/brief.md | completed | 0 | unrecognized-command |
| 1 | bash | Unclassified; see safe command/raw trace | unknown | cat ai/directives/sdd-v2/module.directive.xml | completed | 0 | unrecognized-command |
| 2 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module pipeline/normalize | completed | 0 |  |
| 3 | bash | Unclassified; see safe command/raw trace | unknown | cat specs/token/pipeline/normalize/normalize.spec.md | completed | 0 | unrecognized-command |
| 4 | bash | Unclassified; see safe command/raw trace | unknown | find specs/token -maxdepth 3 -type f   sort | completed | 0 | opaque-shell |
| 5 | bash | Unclassified; see safe command/raw trace | unknown | cat specs/token/token.spec.md | completed | 0 | unrecognized-command |
| 6 | bash | Unclassified; see safe command/raw trace | unknown | ls ai/directives/sdd-v2/formats/ && cat ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | 0 | opaque-shell |
| 7 | bash | Unclassified; see safe command/raw trace | unknown | cat ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | 0 | unrecognized-command |
| 8 | bash | Unclassified; see safe command/raw trace | unknown | cat ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | 0 | unrecognized-command |
| 9 | bash | Unclassified; see safe command/raw trace | unknown | grep -rn "DECISION_LOG_ENTRY_FORMAT" ai/directives/sdd-v2   head -20 | completed | 0 | opaque-shell |
| 10 | bash | Unclassified; see safe command/raw trace | unknown | grep -n "DIAGRAM_CAPTION_FORMAT\ ДЕТАЛИ\ диаграм" ai/directives/sdd-v2/formats/diagram-vocabulary.xml   head -40 | completed | 0 | opaque-shell |
| 11 | bash | Unclassified; see safe command/raw trace | unknown | sed -n '600,650p' ai/directives/sdd-v2/infra.directive.xml; sed -n '190,225p' ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | 0 | opaque-shell |
| 12 | bash | Unclassified; see safe command/raw trace | unknown | cat ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | 0 | unrecognized-command |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | ls -la && find . -maxdepth 2 -type f -not -path './.git/*'   sort   head -80 | completed | 0 | opaque-shell |
| 14 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 15 | bash | Unclassified; see safe command/raw trace | unknown | cat package.json; cat docs/token-contract.md; cat specs/README.md | completed | 0 | opaque-shell |
| 16 | bash | Unclassified; see safe command/raw trace | unknown | sed -n '1,220p' ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | 0 | opaque-shell |
| 17 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 18 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 19 | read | Read current target (skeleton or result) | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 20 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 21 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 22 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 23 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 24 | bash | Unclassified; see safe command/raw trace | unknown | git status --short | completed | 0 | unrecognized-command |
| 25 | bash | Unclassified; see safe command/raw trace | unknown | grep -n "Input\ Outcome\ NOR-REQ\ pending-operator\ ✅\ approved" specs/token/pipeline/normalize/normalize.spec.md | completed | 0 | opaque-shell |
| 26 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |

Read attempts: specs/token/pipeline/normalize/normalize.spec.md ×1.

Temporal batching candidates: none proven eligible. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-contractcue1-oct24-module-flat-baseline-r3

Artifact=true; semantic=fail; path=false; status=completed.

Failed artifact checks: none. Path detail: opaque Bash command: whole-write-only path unproven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 2 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module normalize | completed | 0 |  |
| 3 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 4 | bash | Unclassified; see safe command/raw trace | unknown | find specs ai/directives/sdd-v2 -type f   sort | completed | 0 | opaque-shell |
| 5 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 6 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 8 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 11 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 12 | read | Read reference context; necessity not proven | reference | specs/README.md | completed | unknown |  |
| 13 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 14 | bash | Unclassified; see safe command/raw trace | unknown | cat ai/directives/coding/README.md; cat ai/directives/testing/README.md; git status --porcelain | completed | 0 | opaque-shell |
| 15 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 16 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 17 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 18 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 19 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 20 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 21 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/normalize/normalize.spec.md ×2; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; specs/README.md ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1.

Temporal batching candidates: 0+1, 5+6, 6+7, 7+8, 8+9, 9+10, 12+13. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-contractcue1-oct24-module-nested-baseline-r3

Artifact=true; semantic=pass; path=false; status=completed.

Failed artifact checks: none. Path detail: opaque Bash command: whole-write-only path unproven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 2 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 3 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module pipeline/normalize | completed | 0 |  |
| 4 | read | Read current target (skeleton or result) | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 5 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 6 | bash | Unclassified; see safe command/raw trace | unknown | ls ai/directives/sdd-v2/formats/ | completed | 0 | unrecognized-command |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 11 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 12 | bash | Unclassified; see safe command/raw trace | unknown | cat package.json && ls node_modules/.bin && find docs -type f   head | completed | 0 | opaque-shell |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 14 | read | Read reference context; necessity not proven | reference | docs/token-contract.md | completed | unknown |  |
| 15 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 16 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 17 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 18 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 19 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 20 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 21 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/pipeline/normalize/normalize.spec.md ×1; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; docs/token-contract.md ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1.

Temporal batching candidates: 0+1, 4+5, 7+8, 8+9, 9+10. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-contractcue1-oct24-module-flat-baseline-r4

Artifact=true; semantic=pass; path=false; status=completed.

Failed artifact checks: none. Path detail: opaque Bash command: whole-write-only path unproven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 2 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module normalize | completed | 0 |  |
| 3 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 4 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 5 | glob | Inspect available paths/state | discovery | unknown | completed | unknown |  |
| 6 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 11 | grep | Inspect available paths/state | discovery | unknown | completed | unknown |  |
| 12 | read | Read reference context; necessity not proven | reference | specs/README.md | completed | unknown |  |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | ls -la; git status --short; git log --oneline -5 | completed | 0 | opaque-shell |
| 14 | bash | Unclassified; see safe command/raw trace | unknown | cat package.json; find ai -maxdepth 3 -type f   head -100; ls docs | completed | 0 | opaque-shell |
| 15 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 16 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/interface.directive.xml | completed | unknown |  |
| 17 | read | Read reference context; necessity not proven | reference | docs/token-contract.md | completed | unknown |  |
| 18 | bash | Unclassified; see safe command/raw trace | unknown | find .claude ai/skills -maxdepth 3 -type f   head -50 | completed | 0 | opaque-shell |
| 19 | read | Load workflow/instruction source | directive | .claude/skills/sdd-check/SKILL.md | completed | unknown |  |
| 20 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/library-spec-structure.xml | completed | unknown |  |
| 21 | read | Load workflow/instruction source | directive | ai/directives/testing/node-test.xml | completed | unknown |  |
| 22 | read | Load workflow/instruction source | directive | ai/directives/coding/typescript-rules.xml | completed | unknown |  |
| 23 | read | Load workflow/instruction source | directive | ai/directives/testing/baseline-testing.xml | completed | unknown |  |
| 24 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 25 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 26 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 27 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 28 | grep | Inspect available paths/state | discovery | unknown | completed | unknown |  |
| 29 | grep | Inspect available paths/state | discovery | unknown | completed | unknown |  |
| 30 | bash | Unclassified; see safe command/raw trace | unknown | git status --short; git diff --stat; git diff -- specs/token/normalize/normalize.spec.md   head -20 | completed | 0 | opaque-shell |
| 31 | grep | Inspect available paths/state | discovery | unknown | completed | unknown |  |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/normalize/normalize.spec.md ×1; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; specs/README.md ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; ai/directives/sdd-v2/interface.directive.xml ×1; docs/token-contract.md ×1; .claude/skills/sdd-check/SKILL.md ×1; ai/directives/sdd-v2/formats/library-spec-structure.xml ×1; ai/directives/testing/node-test.xml ×1; ai/directives/coding/typescript-rules.xml ×1; ai/directives/testing/baseline-testing.xml ×1.

Temporal batching candidates: 0+1, 6+7, 7+8, 8+9, 9+10, 15+16, 16+17, 19+20, 20+21, 21+22, 22+23. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-contractcue1-oct24-module-nested-baseline-r4

Artifact=true; semantic=pass; path=false; status=completed.

Failed artifact checks: none. Path detail: opaque Bash command: whole-write-only path unproven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 2 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module pipeline/normalize | completed | 0 |  |
| 3 | read | Read current target (skeleton or result) | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 4 | bash | Unclassified; see safe command/raw trace | unknown | ls -R specs ai/directives/sdd-v2/formats   head -100 | completed | 0 | opaque-shell |
| 5 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 6 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 8 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 10 | bash | Unclassified; see safe command/raw trace | unknown | grep -rl "DECISION_LOG_ENTRY_FORMAT" ai/directives/sdd-v2   head | completed | 0 | opaque-shell |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 12 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 14 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/root.directive.xml | completed | unknown |  |
| 15 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 16 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 17 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 18 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 19 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 20 | bash | Unclassified; see safe command/raw trace | unknown | git status --porcelain | completed | 0 | unrecognized-command |
| 21 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 22 | bash | Unclassified; see safe command/raw trace | unknown | find specs/token/pipeline -type f -print | completed | 0 | unrecognized-command |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/pipeline/normalize/normalize.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; ai/directives/sdd-v2/root.directive.xml ×1.

Temporal batching candidates: 0+1, 5+6, 6+7, 7+8, 8+9, 11+12. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-contractcue1-oct24-module-flat-baseline-r5

Artifact=true; semantic=pass; path=false; status=completed.

Failed artifact checks: none. Path detail: opaque Bash command: whole-write-only path unproven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 2 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module normalize | completed | 0 |  |
| 3 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 4 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 5 | bash | Inspect available paths/state | discovery | npx --no-install gennady sdd-orient specs/token/normalize/normalize.spec.md | completed | 0 |  |
| 6 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 12 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "acronym ACR" ai/directives/sdd-v2 --glob '*.xml'   head -60 | completed | 0 | opaque-shell |
| 14 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 15 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 16 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "DECISION_LOG_ENTRY_FORMAT" ai/directives/sdd-v2 -l && rg -n "id=\"DECISION_LOG_ENTRY_FORMAT\"" ai/directives/sdd-v2 -A 40 | completed | 0 | opaque-shell |
| 17 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 18 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 19 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 20 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 21 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 22 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/normalize/normalize.spec.md ×1; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1.

Temporal batching candidates: 0+1, 6+7, 7+8, 8+9, 9+10, 10+11, 11+12. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-contractcue1-oct24-module-nested-baseline-r5

Artifact=false; semantic=pass; path=false; status=completed.

Failed artifact checks: pending-approval. Path detail: opaque Bash command: whole-write-only path unproven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 2 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module pipeline/normalize | completed | 0 |  |
| 3 | read | Read current target (skeleton or result) | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 4 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 5 | bash | Unclassified; see safe command/raw trace | unknown | ls ai/directives/sdd-v2/formats/ | completed | 0 | unrecognized-command |
| 6 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 7 | bash | Inspect available paths/state | discovery | npx --no-install gennady sdd-orient specs/token/pipeline/normalize/normalize.spec.md | completed | 0 |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 12 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 13 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 14 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "module acronym MODULE.*ACR ACR.*module module spec.*acronym SPEC_ID" ai specs inputs -g '!**/normalize.spec.md'   head -40 | completed | 0 | opaque-shell |
| 15 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 16 | bash | Unclassified; see safe command/raw trace | unknown | find docs -type f -maxdepth 3   head -50; rg -n "TOKEN-PIPELINE normalize acronym ACR" docs   head -60 | completed | 0 | opaque-shell |
| 17 | read | Read reference context; necessity not proven | reference | specs/infra-base/infra-base.spec.md | completed | unknown |  |
| 18 | read | Read reference context; necessity not proven | reference | docs/token-contract.md | completed | unknown |  |
| 19 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 20 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "DECISION_LOG_ENTRY_FORMAT" ai/directives/sdd-v2 -l | completed | 0 | opaque-shell |
| 21 | bash | Unclassified; see safe command/raw trace | unknown | rg -n -A30 -B4 "id=\"DECISION_LOG_ENTRY_FORMAT\"" ai/directives/sdd-v2/root.directive.xml | completed | 0 | opaque-shell |
| 22 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 23 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 24 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 25 | read | Read current target (skeleton or result) | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 26 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 27 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 28 | bash | Unclassified; see safe command/raw trace | unknown | git status --short; git diff --stat | completed | 0 | opaque-shell |
| 29 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 1 | embedded-shell-payload-withheld |
| 30 | read | Read current target (skeleton or result) | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/pipeline/normalize/normalize.spec.md ×3; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; specs/infra-base/infra-base.spec.md ×1; docs/token-contract.md ×1.

Temporal batching candidates: 0+1, 8+9, 9+10, 10+11, 11+12, 12+13, 17+18. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-contractcue1-oct24-module-flat-baseline-r6

Artifact=false; semantic=fail; path=false; status=completed.

Failed artifact checks: relative-links. Path detail: opaque Bash command: whole-write-only path unproven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 2 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module normalize | completed | 0 |  |
| 3 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 4 | bash | Unclassified; see safe command/raw trace | unknown | ls specs/token && ls ai/directives/sdd-v2/formats/ | completed | 0 | opaque-shell |
| 5 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 6 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 12 | bash | Unclassified; see safe command/raw trace | unknown | rg -l "DECISION_LOG_ENTRY_FORMAT" ai/directives | completed | 0 | opaque-shell |
| 13 | bash | Unclassified; see safe command/raw trace | unknown | ls -la && find . -maxdepth 2 -type f -not -path './node_modules/*' -not -path './.git/*'   sort | completed | 0 | opaque-shell |
| 14 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 1 | embedded-shell-payload-withheld |
| 15 | read | Read reference context; necessity not proven | reference | docs/token-contract.md | completed | unknown |  |
| 16 | read | Read reference context; necessity not proven | reference | specs/README.md | completed | unknown |  |
| 17 | read | Read reference context; necessity not proven | reference | package.json | completed | unknown |  |
| 18 | bash | Unclassified; see safe command/raw trace | unknown | rg -n "DECISION_LOG_ENTRY_FORMAT" ai/directives/sdd-v2/formats/infrastructure-spec-structure.xml ai/directives/sdd-v2/root.directive.xml | completed | 0 | opaque-shell |
| 19 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/root.directive.xml | completed | unknown |  |
| 20 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 21 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 22 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 23 | read | Read current target (skeleton or result) | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 24 | write | Whole-file write attempt | target | specs/token/normalize/normalize.spec.md | completed | unknown |  |
| 25 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 26 | bash | Unclassified; see safe command/raw trace | unknown | git status --porcelain && git diff --stat | completed | 0 | opaque-shell |
| 27 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/normalize/normalize.spec.md ×2; specs/token/token.spec.md ×1; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; docs/token-contract.md ×1; specs/README.md ×1; package.json ×1; ai/directives/sdd-v2/root.directive.xml ×1.

Temporal batching candidates: 0+1, 5+6, 6+7, 7+8, 8+9, 9+10, 10+11. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.

## authoring-contractcue1-oct24-module-nested-baseline-r6

Artifact=true; semantic=pass; path=false; status=completed.

Failed artifact checks: none. Path detail: opaque Bash command: whole-write-only path unproven.

Binding/capture/cleanup issues: none. SDK REST measurement requests (including polling): unknown.

Categories below describe observable actions, not private reasoning or proven necessity. Read/write rows are attempts; status/exit retain failures. Withheld shell payloads remain unknown, never guessed.

| Order | Tool | Observable role (not intent) | Category | Path / sanitized command | Status | Exit | Issues |
|---:|---|---|---|---|---|---:|---|
| 0 | read | Load declared task facts | reference | inputs/brief.md | completed | unknown |  |
| 1 | bash | Unclassified; see safe command/raw trace | unknown | ls -la . && git -C . status --short | completed | 0 | opaque-shell |
| 2 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/module.directive.xml | completed | unknown |  |
| 3 | bash | Unclassified; see safe command/raw trace | unknown | find ./specs ./ai -type f   sort | completed | 0 | opaque-shell |
| 4 | read | Read reference context; necessity not proven | reference | specs/token/token.spec.md | completed | unknown |  |
| 5 | bash | Invoke canonical creation | create | npx --no-install gennady sdd-new module --scope token --module pipeline/normalize | completed | 0 |  |
| 6 | read | Read current target (skeleton or result) | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 7 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-inventory-format.xml | completed | unknown |  |
| 8 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/entity-surface-format.xml | completed | unknown |  |
| 9 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/dbc-contracts.xml | completed | unknown |  |
| 10 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/module-spec-structure.xml | completed | unknown |  |
| 11 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/diagram-vocabulary.xml | completed | unknown |  |
| 12 | grep | Inspect available paths/state | discovery | unknown | completed | unknown |  |
| 13 | read | Read reference context; necessity not proven | reference | specs/infra-base/infra-base.spec.md | completed | unknown |  |
| 14 | read | Load workflow/instruction source | directive | ai/directives/sdd-v2/root.directive.xml | completed | unknown |  |
| 15 | read | Load format/contract source | format | ai/directives/sdd-v2/formats/requirement-entry-format.xml | completed | unknown |  |
| 16 | bash | Unclassified; see safe command/raw trace | unknown | cat package.json && ls -la specs/token && find specs -maxdepth 4 -type d   sort | completed | 0 | opaque-shell |
| 17 | read | Read reference context; necessity not proven | reference | specs/README.md | completed | unknown |  |
| 18 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 19 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 20 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 21 | read | Read current target (skeleton or result) | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 22 | write | Whole-file write attempt | target | specs/token/pipeline/normalize/normalize.spec.md | completed | unknown |  |
| 23 | bash | Invoke validation; exit remains separate | check | npx --no-install gennady sdd-check --spec specs/token/pipeline/normalize/normalize.spec.md --authoring | completed | 0 |  |
| 24 | bash | Unclassified; see safe command/raw trace | unknown | git -C . status --short && git -C . diff --stat | completed | 0 | opaque-shell |
| 25 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |
| 26 | bash | Unclassified; see safe command/raw trace | unknown | [shell payload withheld] | completed | 0 | embedded-shell-payload-withheld |

Read attempts: inputs/brief.md ×1; ai/directives/sdd-v2/module.directive.xml ×1; specs/token/token.spec.md ×1; specs/token/pipeline/normalize/normalize.spec.md ×2; ai/directives/sdd-v2/formats/entity-inventory-format.xml ×1; ai/directives/sdd-v2/formats/entity-surface-format.xml ×1; ai/directives/sdd-v2/formats/dbc-contracts.xml ×1; ai/directives/sdd-v2/formats/module-spec-structure.xml ×1; ai/directives/sdd-v2/formats/diagram-vocabulary.xml ×1; specs/infra-base/infra-base.spec.md ×1; ai/directives/sdd-v2/root.directive.xml ×1; ai/directives/sdd-v2/formats/requirement-entry-format.xml ×1; specs/README.md ×1.

Temporal batching candidates: 6+7, 7+8, 8+9, 9+10, 10+11, 13+14, 14+15. These are hypotheses, not guaranteed savings.

Reflection: completed; actual self-report is archived separately and is not a causal verdict.
