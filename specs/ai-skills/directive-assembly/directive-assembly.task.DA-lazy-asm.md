# Task: DA-lazy-asm — Lazy directive assembly: skeleton + step packages

<!--SECTION:META-->

## Meta

- **Task-ID:** DA-lazy-asm
- **Status:** [x] DONE
- **Purpose:** Расширить генератор директив (`ai/kit/build-directives.ts`) вторым режимом сборки — `lazy` (скелет + пакеты шагов), рядом с существующим `monolith` — и применить его к трём пилотным тяжеловесам (`audit`, `scaffold`, `phase-execution-protocol`) под механическими гейтами бюджета и связки.
- **Scope:** ai-skills
- **Module:** directive-assembly
- **Dependencies:** None
- **Spec References:**
  - Service: [`LazyDirectiveAssembler`](./directive-assembly.spec.md#service-lazydirectiveassembler)
  - Service: [`AxiomActivationClassifier`](./directive-assembly.spec.md#service-axiomactivationclassifier)
  - Service: [`StepBudgetGate`](./directive-assembly.spec.md#service-stepbudgetgate)
  - Service: [`SkeletonPackageBindingGuard`](./directive-assembly.spec.md#skeletonpackagebindingguard)
  - Constraints: [Requirements DA-REQ-1..16](./directive-assembly.spec.md#requirements)
  - Constraints: [Entity Inventory](./directive-assembly.spec.md#entity-inventory)
  - Constraints: [File Structure](./directive-assembly.spec.md#file-structure)
  - Constraints: [Public Options & Policies](./directive-assembly.spec.md#public-options-policies)
  - Constraints: [Module Decision Log DA-DL-1..17](./directive-assembly.spec.md#module-decision-log)
  - Constraints: [Module BDD Scenarios](./directive-assembly.spec.md#bdd-scenarios)
- **Runtime Backing:** `not-implemented`
- **Verification Levels:** `contract`, `unit`, `integration`
- **Deferred Runtime Scope:** `sdd-step` (scope `cli`) — DEFERRED_DECISION (DA-DL-15); `ai/kit/__tests__/skeleton-package-binding.e2e.test.ts` stays `skip` in this task
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## Phases Overview

| ID  | Kind   | Deps       | Status |
| --- | ------ | ---------- | ------ |
| P1  | impl   | —          | [x]    |
| P2  | impl   | —          | [x]    |
| P3  | impl   | P1, P2     | [x]    |
| P4  | test   | P1         | [x]    |
| P5  | test   | P2         | [x]    |
| P6  | config | P3         | [x]    |
| P7  | test   | P1, P3, P6 | [x]    |
| P8  | config | P2         | [x]    |
| P9  | doc    | P1         | [x]    |
| P10 | test   | P6         | [x]    |

<!-- Kind ∈ bootstrap | impl | test | config | doc | refactor (fix only on execution). impl and test are ALWAYS separate phases. Orchestrator reads this table to plan. -->
<!--/SECTION:PHASES_OVERVIEW-->

## Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** Реализовать ядро lazy-сборки — `AssemblyManifest` (чтение/приоритет режима),
  `AxiomActivationClassifier` (сигнал активации на шаг), `LazyDirectiveAssembler` (разбиение
  `partials_ORIGINAL − ctx` на `DirectiveSkeleton` + `StepPackage[]`), `BuildFingerprint` (штамп
  версии), плюс вспомогательные чистые функции: сверка версий пост-фактум (DA-REQ-8) и проверка
  кандидатства на lazy по порогам `BeliefState` (DA-REQ-16).
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Spec Refs:**
  - Service: [`LazyDirectiveAssembler`](./directive-assembly.spec.md#service-lazydirectiveassembler)
  - Service: [`AxiomActivationClassifier`](./directive-assembly.spec.md#service-axiomactivationclassifier)
  - Constraints: [Requirements DA-REQ-1..13, DA-REQ-16](./directive-assembly.spec.md#requirements)
- **Target Files:**
  - ai/kit/lazy-assembly.ts (new)
  - ai/kit/assembly-manifest.json (new — `{ "defaultMode": "monolith", "overrides": {} }`)
- **Inputs:** none
- **Exit:** `lazy-assembly.ts` exports `resolveAssemblyMode`, `AxiomActivationClassifier`/`classify`,
`LazyDirectiveAssembler`/`assemble`, `stampFingerprint`, `findVersionMismatches`,
`isLazyCandidate`; `npm run type-check` passes; a directive with zero `<Step>` and a `lazy`
override throws a configuration error (not an empty skeleton) when `assemble` is called directly
against a fixture.
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — impl

- **Objective:** Реализовать `StepBudgetGate` — механическое измерение `DirectiveSkeleton`/
  `StepPackage` (токены скелета через существующий `countTokens`, символы пакета, символы строки
  пакета) и CLI-обёртку `npm run check:directive-budgets`, проверяющую реальное дерево
  `ai/directives/sdd-v2/**` (по образцу `ai/kit/check-directives-fresh.ts`).
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Spec Refs:**
  - Service: [`StepBudgetGate`](./directive-assembly.spec.md#service-stepbudgetgate)
  - Constraints: [Requirements DA-REQ-6, DA-REQ-14](./directive-assembly.spec.md#requirements)
- **Target Files:**
  - ai/kit/step-budget-gate.ts (new)
- **Inputs:** none
- **Exit:** `check(skeletonText, packages)` returns an empty finding list when skeleton ≤8000 tokens
(using `shared/common/tokens.ts#countTokens`) and every package ≤20 000 chars (DA-DL-16) with every
line ≤2000 chars; returns one finding per exceeded budget naming the artifact, the limit, and the
overage otherwise; `node ai/kit/step-budget-gate.ts` (or `--check`) exits 0 against the current
`ai/directives/sdd-v2/**` tree (no lazy directive exists yet, so trivially clean) and would exit 1
given a fixture directory with an oversized package.
<!--/SECTION:PHASE_P2-->

<!--SECTION:PHASE_P3-->

### P3 — impl

- **Objective:** Расширить `ai/kit/build-directives.ts`: читать `AssemblyManifest`, разрешать режим
  сборки по приоритету override → `--assembly=` флаг → `defaultMode` → `monolith` (DA-REQ-1);
  для `lazy`-директив вызывать `LazyDirectiveAssembler` НАД остатком `partials_ORIGINAL(directive) −
ctx(directive, edge)` — то есть после уже существующего вызова `buildDeltaPlan`/
  `excludedPartialsFor`, никогда параллельно или до него (DA-REQ-10); писать скелет +
  `steps/<step-id>.xml` на диск; после генерации проверить, что каждый путь, напечатанный в
  скелете, существует на диске — иначе провалить сборку с именем директивы и шага (DA-REQ-12);
  вызвать `StepBudgetGate.check` и провалить сборку при любом превышении, с указанием директивы
  (и шага для пакета), лимита и величины превышения (DA-REQ-14).
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Spec Refs:**
  - Service: [`LazyDirectiveAssembler`](./directive-assembly.spec.md#service-lazydirectiveassembler)
  - Service: [`StepBudgetGate`](./directive-assembly.spec.md#service-stepbudgetgate)
  - Constraints: [Requirements DA-REQ-1, DA-REQ-4, DA-REQ-10, DA-REQ-12, DA-REQ-14](./directive-assembly.spec.md#requirements)
- **Target Files:**
  - ai/kit/build-directives.ts (extend)
- **Inputs:** P1 handoff, P2 handoff
- **Exit:** `npm run build:directives` (no manifest overrides) produces byte-identical output to
before this task (regression-free monolith path); `npm run build:directives -- --assembly=lazy`
runs end-to-end against the current template set without throwing; a fixture directive forced
into `lazy` with a deliberately deleted package file makes the build exit non-zero naming that
directive and step; a fixture forced over budget makes the build exit non-zero naming the
exceeded limit.
<!--/SECTION:PHASE_P3-->

<!--SECTION:PHASE_P4-->

### P4 — test

- **Objective:** Юнит-тесты ядра lazy-сборки — `AssemblyManifest`, `AxiomActivationClassifier`,
  `LazyDirectiveAssembler`, `BuildFingerprint`, версийная сверка пост-фактум, кандидатство на lazy.
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
  - [testing-common](../../../ai/directives/testing/common.xml)
- **Spec Refs:**
  - Service: [`LazyDirectiveAssembler`](./directive-assembly.spec.md#service-lazydirectiveassembler)
  - Service: [`AxiomActivationClassifier`](./directive-assembly.spec.md#service-axiomactivationclassifier)
- **Target Files:**
  - ai/kit/**tests**/lazy-assembly.test.ts (new)
- **Inputs:** P1 handoff
- **Exit:** `node --import tsx --test ai/kit/__tests__/lazy-assembly.test.ts` passes with every
canonical case name in Test Scenario Coverage present verbatim.
<!--/SECTION:PHASE_P4-->

<!--SECTION:PHASE_P5-->

### P5 — test

- **Objective:** Юнит- и интеграционные тесты `StepBudgetGate` и его CLI-обёртки.
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
  - [testing-common](../../../ai/directives/testing/common.xml)
- **Spec Refs:**
  - Service: [`StepBudgetGate`](./directive-assembly.spec.md#service-stepbudgetgate)
- **Target Files:**
  - ai/kit/**tests**/step-budget-gate.test.ts (new)
- **Inputs:** P2 handoff
- **Exit:** `node --import tsx --test ai/kit/__tests__/step-budget-gate.test.ts` passes with every
canonical case name in Test Scenario Coverage present verbatim.
<!--/SECTION:PHASE_P5-->

<!--SECTION:PHASE_P6-->

### P6 — config

- **Objective:** Включить пилотный override `lazy` для `audit`, `scaffold`,
  `phase-execution-protocol` в `ai/kit/assembly-manifest.json` (DA-REQ-2) и пересобрать директивы,
  чтобы реальные `ai/directives/sdd-v2/<name>.directive.xml` (скелет) + `ai/directives/sdd-v2/<name>/
steps/<step-id>.xml` (пакеты) появились на диске для всех трёх пилотов.
  Владелец `ai/kit/assembly-manifest.json` — эта же задача (P1 создал файл с дефолтом, P6 —
  единственная правка его `overrides` в рамках этой задачи).
- **Rules:** _(none — JSON-конфиг приложения, не покрыт триггером ни одного правила каскада)_
- **Spec Refs:**
  - Constraints: [Requirements DA-REQ-2](./directive-assembly.spec.md#requirements)
  - Constraints: [Module Decision Log DA-DL-10](./directive-assembly.spec.md#module-decision-log)
- **Target Files:**
  - ai/kit/assembly-manifest.json (edit — add the three pilot overrides)
  - ai/directives/sdd-v2/audit.directive.xml (generated)
  - ai/directives/sdd-v2/audit/steps/\*.xml (generated)
  - ai/directives/sdd-v2/scaffold.directive.xml (generated)
  - ai/directives/sdd-v2/scaffold/steps/\*.xml (generated)
  - ai/directives/sdd-v2/phase-execution-protocol.directive.xml (generated)
  - ai/directives/sdd-v2/phase-execution-protocol/steps/\*.xml (generated)
- **Inputs:** P3 handoff
- **Exit:** `npm run build:directives` (manifest overrides now active, no `--assembly` flag needed)
regenerates the three pilot directives as skeleton + step packages, every other directive stays
monolith; `npm run check:directives-fresh` passes against the new checked-in generated output.
<!--/SECTION:PHASE_P6-->

<!--SECTION:PHASE_P7-->

### P7 — test

- **Objective:** `SkeletonPackageBindingGuard` — для каждого из трёх пилотов проверить (а) каждый
  путь пакета из скелета существует на диске, (б) версия шапки скелета совпадает с первой строкой
  каждого пакета, (в) конкатенация скелета+пакетов по порядку шагов эквивалентна monolith-рендеру
  той же директивы за вычетом служебных строк списка шагов и версийной строки-шапки каждого пакета
  («без потерь», DA-REQ-15) — заодно доказывает отсутствие телеграфной компрессии (DA-REQ-11), раз
  контент не переписывается, только переносится. Плюс заготовка `skeleton-package-binding.e2e.test.ts`
  — единственный `skip`-тест с условием возврата DEFERRED_DECISION (DA-DL-15).
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
  - [testing-common](../../../ai/directives/testing/common.xml)
- **Spec Refs:**
  - Service: [`SkeletonPackageBindingGuard`](./directive-assembly.spec.md#skeletonpackagebindingguard)
  - Constraints: [Requirements DA-REQ-8, DA-REQ-11, DA-REQ-12, DA-REQ-15](./directive-assembly.spec.md#requirements)
- **Target Files:**
  - ai/kit/**tests**/skeleton-package-binding.guard.test.ts (new, по образцу `ai/kit/__tests__/delta-assembly.test.ts`)
  - ai/kit/**tests**/skeleton-package-binding.e2e.test.ts (new, skip)
- **Inputs:** P1 handoff, P3 handoff, P6 handoff
- **Exit:** `node --import tsx --test ai/kit/__tests__/skeleton-package-binding.*.test.ts` passes
(e2e file entirely skipped); every canonical case name in Test Scenario Coverage present verbatim.
<!--/SECTION:PHASE_P7-->

<!--SECTION:PHASE_P8-->

### P8 — config

- **Objective:** Включить `StepBudgetGate` в цепочку аудитов и в pre-commit: новый npm-скрипт
  `check:directive-budgets`, добавленный в `audit:sdd-templates` рядом с `check:directives-fresh` /
  `audit:axioms` / `audit:contracts`, и явная строка гейта в `scripts/git-hooks/pre-commit`.
  Владелец `package.json` scripts и `scripts/git-hooks/pre-commit` для ЭТИХ двух правок — эта
  задача (первая v2-задача, трогающая эти файлы; других владельцев в v2-графе задач пока нет).
- **Rules:**
  - [nodejs-npm-setup](../../../ai/directives/infra/nodejs-npm-setup.xml)
- **Spec Refs:**
  - Constraints: [Requirements DA-REQ-14](./directive-assembly.spec.md#requirements)
- **Target Files:**
  - package.json (edit — add `check:directive-budgets`; extend `audit:sdd-templates`)
  - scripts/git-hooks/pre-commit (edit — add the budget gate call)
- **Inputs:** P2 handoff
- **Exit:** `npm run audit:sdd-templates` runs `check:directive-budgets` as part of its chain and
exits 0 on a clean tree; `scripts/git-hooks/pre-commit` names the new gate on failure with the
same `fail "..."` convention as the existing gates.
<!--/SECTION:PHASE_P8-->

<!--SECTION:PHASE_P9-->

### P9 — doc

- **Objective:** Задокументировать в `ai/kit/AUTHORING.md` обязательную переоценку кандидатства на
  lazy при каждой правке `BeliefState` директивы (DA-REQ-16): порог — `BeliefState` > 6000 токенов
  ИЛИ доля одношаговых аксиом (`AxiomActivationClassifier`/`isLazyCandidate`) > 50%.
- **Rules:** _(none — markdown-документация, не покрыта триггером ни одного правила каскада)_
- **Spec Refs:**
  - Constraints: [Requirements DA-REQ-16](./directive-assembly.spec.md#requirements)
  - Constraints: [Module Decision Log DA-DL-10](./directive-assembly.spec.md#module-decision-log)
- **Target Files:**
  - ai/kit/AUTHORING.md (edit — new subsection)
- **Inputs:** P1 handoff
- **Exit:** `AUTHORING.md` names both thresholds (6000 tokens, 50%), names `isLazyCandidate`, and
states the reassessment trigger fires on every `BeliefState` edit (axiom or step add/remove), not
only at first authoring.
<!--/SECTION:PHASE_P9-->

<!--SECTION:PHASE_P10-->

### P10 — test

- **Objective:** Привести потребителей собранных директив к режиму lazy: три тест-файла читают
  директиву как единый монолитный рендер и ломаются на пилотах, ставших скелетом + пакетами
  (побочный эффект боевой конверсии P6, владельца в исходном DAG нет).
- **Rules:**
  - [node-test](../../../ai/directives/testing/node-test.xml)
  - [testing-common](../../../ai/directives/testing/common.xml)
- **Spec Refs:**
  - Service: [`LazyDirectiveAssembler`](./directive-assembly.spec.md#service-lazydirectiveassembler)
  - Constraints: [Requirements DA-REQ-1, DA-REQ-3, DA-REQ-4](./directive-assembly.spec.md#requirements)
- **Target Files:**
  - ai/kit/**tests**/delta-assembly.test.ts (extend)
  - ai/kit/**tests**/readiness-preflight-gate.test.ts (extend)
  - cli/**tests**/directive-tool-contract/directive-tool-contract.test.ts (extend)
- **Inputs:** P6 handoff
- **Exit:** каждый из трёх файлов определяет режим директивы через `resolveAssemblyMode` и для
lazy-директивы читает скелет ВМЕСТЕ с её пакетами шагов, а не скелет в одиночку; проверяемые
свойства сохраняются (дельта-вычитание, queue-aware ветка readiness, извлечение документированных
форм вызовов); `npm test` зелёный целиком; ни один тест не ослаблен и не удалён ради прохода.
<!--/SECTION:PHASE_P10-->

<!--SECTION:BDD-->

## Acceptance Criteria (BDD)

Each scenario is tagged with the requirement it proves and its verification level — this is the
use-case → `[DA-REQ-N]` → vision chain the operator reviews at scaffold.

**Feature:** Assembly mode resolution

**Scenario:** manifest override wins over flag and default [`unit`] `[DA-REQ-1]`

- **Given** `assembly-manifest.json` has `overrides["sdd-v2/foo.directive.xml"] = "lazy"`
- **When** the build runs with `--assembly=monolith`
- **Then** `foo` is assembled `lazy` anyway — override beats the flag and the manifest default

**Scenario:** flag wins over manifest default when no override is set [`unit`] `[DA-REQ-1]`

- **Given** no override for `foo`, `defaultMode: "monolith"`
- **When** the build runs with `--assembly=lazy`
- **Then** `foo` is assembled `lazy` — the flag beats the manifest's own default

**Scenario:** manifest default wins over the built-in monolith default [`unit`] `[DA-REQ-1]`

- **Given** no override for `foo`, no `--assembly` flag, `defaultMode: "lazy"`
- **When** the build runs
- **Then** `foo` is assembled `lazy`

**Scenario:** missing manifest file falls back to monolith with no error [`unit`] `[DA-REQ-1]`

- **Given** `ai/kit/assembly-manifest.json` does not exist
- **When** the build runs with no flag
- **Then** every directive assembles `monolith`, identical to pre-task behavior

**Scenario:** malformed manifest JSON fails the build explicitly [`unit`] `[DA-REQ-1]`

- **Given** `assembly-manifest.json` exists but is not valid JSON
- **When** the build runs
- **Then** the build throws an explicit configuration error naming the file — never a silent
  fallback to monolith

**Feature:** Pilot rollout

**Scenario:** the three measured heavyweights carry an explicit lazy override [`integration`] `[DA-REQ-2]`

- **Given** `ai/kit/assembly-manifest.json` after this task
- **When** its `overrides` are read
- **Then** `sdd-v2/audit.directive.xml`, `sdd-v2/scaffold.directive.xml`,
  `sdd-v2/phase-execution-protocol.directive.xml` are each set to `"lazy"`

**Feature:** Skeleton shape

**Scenario:** lazy assembly rejects a directive with zero Steps [`contract`] `[DA-REQ-3]`

- **Given** a directive template with no `<Step>` at all, forced to `lazy`
- **When** `LazyDirectiveAssembler.assemble` runs
- **Then** it throws an explicit configuration error — never an empty skeleton

**Scenario:** lazy assembly produces one skeleton and one package per Step [`contract`] `[DA-REQ-3]` `[DA-REQ-4]`

- **Given** a directive template with `<Step>` ids `STEP_A`, `STEP_B`, `STEP_C`
- **When** `LazyDirectiveAssembler.assemble` runs
- **Then** it returns exactly one `DirectiveSkeleton` and exactly three `StepPackage` values, one
  per Step id

**Scenario:** the skeleton never carries a Step's full body [`unit`] `[DA-REQ-3]`

- **Given** the same three-step fixture
- **When** the skeleton text is inspected
- **Then** none of the three Steps' full bodies appear in it — only title + 1–2 line gist + the
  path to fetch the package

**Feature:** Step package identity and delivery

**Scenario:** a package file is named after the literal Step id [`unit`] `[DA-REQ-4]`

- **Given** a Step with `id="STEP_2_NARROW_RECON"`
- **When** its package is written
- **Then** the file is `ai/directives/sdd-v2/<name>/steps/STEP_2_NARROW_RECON.xml` — no positional
  number, no transformation of the id

**Scenario:** the skeleton's step list points to a plain-Read relative path [`unit`] `[DA-REQ-5]`

- **Given** an assembled skeleton
- **When** its step-list entry for a Step is inspected
- **Then** it carries the exact relative path to that Step's package file, with no CLI command and
  no version argument

**Feature:** Version fingerprint

**Scenario:** the same human-readable version stamps the skeleton and every package [`unit`] `[DA-REQ-7]`

- **Given** a lazy build at version `0.8.4-draft.40`
- **When** the skeleton header and each package's first line are read
- **Then** all of them carry the literal string `0.8.4-draft.40` — no hex hash anywhere

**Scenario:** version parity check finds nothing wrong on a fresh build [`unit`] `[DA-REQ-8]`

- **Given** a freshly built skeleton and its packages, all stamped identically
- **When** `findVersionMismatches` runs over them
- **Then** it returns an empty list

**Scenario:** version parity check names directive, step, and both versions on drift [`unit`] `[DA-REQ-8]`

- **Given** a skeleton header stamped `0.8.4-draft.40` and one package first line hand-edited to
  `0.8.4-draft.39`
- **When** `findVersionMismatches` runs over them
- **Then** it returns one finding naming the directive, the mismatched step, and both versions

**Feature:** Axiom activation signal

**Scenario:** an axiom mentioned in exactly one Step is single-step [`unit`] `[DA-REQ-9]`

- **Given** an axiom whose id occurs verbatim inside exactly one `<Step>` body
- **When** `AxiomActivationClassifier.classify` runs
- **Then** it returns `single-step` for that axiom

**Scenario:** an axiom mentioned in two or more Steps is cross-cutting [`unit`] `[DA-REQ-9]`

- **Given** an axiom whose id occurs verbatim inside two different `<Step>` bodies
- **When** `classify` runs
- **Then** it returns `cross-cutting`

**Scenario:** an axiom mentioned outside any Step body is cross-cutting [`unit`] `[DA-REQ-9]`

- **Given** an axiom whose id occurs only in `BeliefState` prose, never inside a `<Step>`
- **When** `classify` runs
- **Then** it returns `cross-cutting`

**Scenario:** an axiom mentioned in zero Steps stays cross-cutting and is flagged [`contract`] `[DA-REQ-9]`

- **Given** an axiom whose id occurs nowhere in the directive's rendered text
- **When** `classify` runs
- **Then** it returns `cross-cutting` (safe default) and marks the axiom as a YAGNI candidate,
  never rejecting the build

**Feature:** Delta-then-lazy ordering

**Scenario:** lazy assembly never re-splits a partial already guaranteed by the caller [`unit`] `[DA-REQ-10]`

- **Given** a directive whose delta pass (`excludedPartialsFor`) already removed partial `axiom/foo`
  because a loading directive already carries it
- **When** `LazyDirectiveAssembler.assemble` runs on the delta-reduced text
- **Then** `axiom/foo` appears in neither the skeleton nor any package — it was never in the input
  set to begin with

**Feature:** Build-time integrity gates

**Scenario:** a missing package file fails the build, naming directive and step [`integration`] `[DA-REQ-12]`

- **Given** a lazy build whose skeleton was written but one step's package file was deleted before
  the existence check runs
- **When** the build's post-generation check runs
- **Then** it exits non-zero, naming the directive and the missing step — the skeleton with a
  dangling path never ships

**Scenario:** the skeleton header carries a rebuild hint for a post-build read failure [`unit`] `[DA-REQ-13]`

- **Given** any assembled `DirectiveSkeleton`
- **When** its header text is inspected
- **Then** it contains one line naming the exact rebuild command (`npm run build:directives --
--assembly=lazy`) as the recovery path for a failed package read

**Feature:** Mechanical budgets

**Scenario:** a within-budget skeleton and packages produce no findings [`contract`] `[DA-REQ-6]`

- **Given** a skeleton under 8000 tokens and packages each under 20 000 chars (DA-DL-16) with every
  line under 2000 chars
- **When** `StepBudgetGate.check` runs
- **Then** it returns an empty finding list

**Scenario:** a skeleton over the hard token cap fails with the overage named [`unit`] `[DA-REQ-6]` `[DA-REQ-14]`

- **Given** a skeleton measuring over 8000 tokens
- **When** `check` runs
- **Then** it returns a finding naming the directive, the 8000-token limit, and the measured
  overage

**Scenario:** a package over the character cap fails with the overage named [`unit`] `[DA-REQ-6]` `[DA-REQ-14]`

- **Given** a package measuring over 20 000 characters (DA-DL-16)
- **When** `check` runs
- **Then** it returns a finding naming the directive, the step, the 20 000-char limit, and the
  measured overage

**Scenario:** a package line over the line-length cap fails with the overage named [`unit`] `[DA-REQ-6]` `[DA-REQ-14]`

- **Given** a package containing one line over 2000 characters
- **When** `check` runs
- **Then** it returns a finding naming the directive, the step, the 2000-char line limit, and the
  measured overage

**Scenario:** the CI gate fails the build when any budget is exceeded [`integration`] `[DA-REQ-14]`

- **Given** a lazy build producing a package over 20 000 characters (DA-DL-16)
- **When** `npm run build:directives -- --assembly=lazy` runs
- **Then** it exits non-zero, printing the directive, the step, the exceeded limit, and the
  overage — the oversized file is not silently written

**Feature:** No-loss regression across the pilots

**Scenario:** every path a pilot skeleton prints exists on disk after a real build [`integration`] `[DA-REQ-12]`

- **Given** `audit`, `scaffold`, `phase-execution-protocol` rebuilt lazy
- **When** each skeleton's step-list paths are resolved against disk
- **Then** every one of them exists

**Scenario:** a pilot's monolith and lazy builds carry the same version everywhere [`integration`] `[DA-REQ-8]`

- **Given** a pilot directive rebuilt lazy
- **When** its skeleton header version is compared against every package's first line
- **Then** they are all identical

**Scenario:** lazy and monolith renders of a pilot are equivalent modulo housekeeping lines [`integration`] `[DA-REQ-11]` `[DA-REQ-15]`

- **Given** a pilot directive built once `monolith` and once `lazy`
- **When** the lazy skeleton and all its packages are concatenated in step order, and the step-list
  housekeeping lines plus each package's version-header line are stripped from both sides
- **Then** the result is textually equivalent to the monolith render — no axiom lost, none
  duplicated

**Feature:** Lazy-candidacy reassessment

**Scenario:** a directive over the token threshold is a lazy candidate [`unit`] `[DA-REQ-16]`

- **Given** a directive whose `BeliefState` measures over 6000 tokens and whose single-step axiom
  ratio is 0%
- **When** `isLazyCandidate` runs
- **Then** it returns `true`

**Scenario:** a directive over the single-step-ratio threshold is a lazy candidate [`unit`] `[DA-REQ-16]`

- **Given** a directive whose `BeliefState` measures 1000 tokens and whose single-step axiom ratio
  is 60%
- **When** `isLazyCandidate` runs
- **Then** it returns `true`

**Scenario:** a directive under both thresholds is not a candidate [`unit`] `[DA-REQ-16]`

- **Given** a directive whose `BeliefState` measures 1000 tokens and whose single-step axiom ratio
  is 10%
- **When** `isLazyCandidate` runs
- **Then** it returns `false`

<!-- BLOCKER: every DbC contract in Spec References has at least one `contract`-level typing scenario; Deferred Test Ownership is forbidden for typing scenarios. -->
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## Verification

| Command                                          | Required by                 |
| ------------------------------------------------ | --------------------------- |
| `npm run type-check && npm test && npm run lint` | typescript-rules, node-test |

<!-- One row per unique check-command alias. Phase-subagent runs only rows whose Required-by overlaps its phase Rules. -->
<!-- NB (scaffold-time finding, not a blocker for this task): `infra-base` (the nearest infra scope
in this task's cascade) has no formal "## Verification Commands" section — it is an intentionally
minimal spec (see `ai/directives/sdd-v2/formats/infra-base-minimal-spec.xml`). The command above is
composed directly from `package.json`'s own scripts (`type-check`, `test`, `lint`), matching
`CheckPhaseOrder` (`typecheck test lint format`). Backfilling a proper Verification Commands section
onto `specs/infra-base/infra-base.spec.md` is out of this task's blast radius (ai-skills /
directive-assembly only) — flagged for the operator, not blocking. -->

- **Task-specific Completion additions:**
  - `npm run build:directives` — full rebuild, no throw, monolith directives byte-identical to
    before this task
  - `npm run build:directives -- --assembly=lazy` — the three pilots regenerate as skeleton + step
    packages
  - `npm run check:directive-budgets` — clean exit against the real `ai/directives/sdd-v2/**` tree
  - `npm run check:directives-fresh` — checked-in generated output matches a fresh rebuild
  - `npm run audit:sdd-templates` — freshness + axiom-activation + contract-activation audits stay
  clean (unchanged scope, still exercised because the pilots now round-trip through the new path)
  <!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## Test Scenario Coverage

- Scenario manifest override wins over flag and default → `ai/kit/__tests__/lazy-assembly.test.ts` :: `resolves manifest override before --assembly flag before defaultMode before built-in monolith default`
- Scenario flag wins over manifest default when no override is set → `ai/kit/__tests__/lazy-assembly.test.ts` :: `resolves manifest override before --assembly flag before defaultMode before built-in monolith default`
- Scenario manifest default wins over the built-in monolith default → `ai/kit/__tests__/lazy-assembly.test.ts` :: `resolves manifest override before --assembly flag before defaultMode before built-in monolith default`
- Scenario missing manifest file falls back to monolith with no error → `ai/kit/__tests__/lazy-assembly.test.ts` :: `falls back to defaultMode monolith and empty overrides when assembly-manifest.json is absent`
- Scenario malformed manifest JSON fails the build explicitly → `ai/kit/__tests__/lazy-assembly.test.ts` :: `throws an explicit config error when assembly-manifest.json is present but not valid JSON`
- Scenario the three measured heavyweights carry an explicit lazy override → `ai/kit/__tests__/skeleton-package-binding.guard.test.ts` :: `every path a pilot skeleton prints exists on disk after a real build`
- Scenario lazy assembly rejects a directive with zero Steps → `ai/kit/__tests__/lazy-assembly.test.ts` :: `rejects a lazy override for a directive with zero Steps with an explicit configuration error, never an empty skeleton`
- Scenario lazy assembly produces one skeleton and one package per Step → `ai/kit/__tests__/lazy-assembly.test.ts` :: `produces one DirectiveSkeleton and exactly one StepPackage per Step for a lazy directive`
- Scenario the skeleton never carries a Step's full body → `ai/kit/__tests__/lazy-assembly.test.ts` :: `omits the full text of every Step from the generated skeleton`
- Scenario a package file is named after the literal Step id → `ai/kit/__tests__/lazy-assembly.test.ts` :: `writes each StepPackage under steps/<step-id>.xml using the literal Step id verbatim, never a positional number`
- Scenario the skeleton's step list points to a plain-Read relative path → `ai/kit/__tests__/lazy-assembly.test.ts` :: `lists each step with a relative path to its package file readable by a plain Read, no CLI command and no version argument`
- Scenario the same human-readable version stamps the skeleton and every package → `ai/kit/__tests__/lazy-assembly.test.ts` :: `stamps the same BuildFingerprint value into the skeleton header and the first line of every StepPackage`
- Scenario version parity check finds nothing wrong on a fresh build → `ai/kit/__tests__/lazy-assembly.test.ts` :: `reports no mismatch when every package first line equals the skeleton header version`
- Scenario version parity check names directive, step, and both versions on drift → `ai/kit/__tests__/lazy-assembly.test.ts` :: `reports the directive, the mismatched step, and both versions when a package first line differs from the skeleton header version`
- Scenario an axiom mentioned in exactly one Step is single-step → `ai/kit/__tests__/lazy-assembly.test.ts` :: `classifies an axiom mentioned in exactly one Step as single-step`
- Scenario an axiom mentioned in two or more Steps is cross-cutting → `ai/kit/__tests__/lazy-assembly.test.ts` :: `classifies an axiom mentioned in two or more Steps as cross-cutting`
- Scenario an axiom mentioned outside any Step body is cross-cutting → `ai/kit/__tests__/lazy-assembly.test.ts` :: `classifies an axiom mentioned outside any Step body as cross-cutting`
- Scenario an axiom mentioned in zero Steps stays cross-cutting and is flagged → `ai/kit/__tests__/lazy-assembly.test.ts` :: `classifies an axiom mentioned in zero Steps as cross-cutting and flags it as a YAGNI candidate`
- Scenario lazy assembly never re-splits a partial already guaranteed by the caller → `ai/kit/__tests__/lazy-assembly.test.ts` :: `never places a partial already guaranteed by ctx(directive, edge) into the skeleton or any package`
- Scenario a missing package file fails the build, naming directive and step → `ai/kit/__tests__/skeleton-package-binding.guard.test.ts` :: `every path a pilot skeleton prints exists on disk after a real build`
- Scenario the skeleton header carries a rebuild hint for a post-build read failure → `ai/kit/__tests__/lazy-assembly.test.ts` :: `carries one recovery-hint line naming the rebuild command for a failed package read`
- Scenario a within-budget skeleton and packages produce no findings → `ai/kit/__tests__/step-budget-gate.test.ts` :: `returns an empty finding list when the skeleton and every package are within budget`
- Scenario a skeleton over the hard token cap fails with the overage named → `ai/kit/__tests__/step-budget-gate.test.ts` :: `finds a skeleton exceeding the 8000-token hard cap and names the directive and the overage`
- Scenario a package over the character cap fails with the overage named → `ai/kit/__tests__/step-budget-gate.test.ts` :: `finds a step package exceeding the package character cap and names the directive, the step, and the overage`
- Scenario a package line over the line-length cap fails with the overage named → `ai/kit/__tests__/step-budget-gate.test.ts` :: `finds a package line exceeding 2000 characters and names the directive, the step, and the overage`
- Scenario the CI gate fails the build when any budget is exceeded → `ai/kit/__tests__/step-budget-gate.test.ts` :: `exits 1 and prints every violation when a generated directive exceeds a budget`
- Scenario every path a pilot skeleton prints exists on disk after a real build → `ai/kit/__tests__/skeleton-package-binding.guard.test.ts` :: `every path a pilot skeleton prints exists on disk after a real build`
- Scenario a pilot's monolith and lazy builds carry the same version everywhere → `ai/kit/__tests__/skeleton-package-binding.guard.test.ts` :: `each pilot directive's skeleton header version matches every package first line`
- Scenario lazy and monolith renders of a pilot are equivalent modulo housekeeping lines → `ai/kit/__tests__/skeleton-package-binding.guard.test.ts` :: `each pilot directive's monolith and lazy renders are equivalent modulo step-list housekeeping and package version headers`
- Scenario a directive over the token threshold is a lazy candidate → `ai/kit/__tests__/lazy-assembly.test.ts` :: `flags a directive as a lazy candidate when its BeliefState exceeds 6000 tokens`
- Scenario a directive over the single-step-ratio threshold is a lazy candidate → `ai/kit/__tests__/lazy-assembly.test.ts` :: `flags a directive as a lazy candidate when more than 50% of its axioms are single-step`
- Scenario a directive under both thresholds is not a candidate → `ai/kit/__tests__/lazy-assembly.test.ts` :: `does not flag a directive below both thresholds`
- Contract coverage (no matching BDD scenario; added at P4 per inherited `AX_COVERAGE_BY_CONTRACT_NOT_BY_LINE` — `stampFingerprint` declares two `@throws` cases the BDD set never names) → `ai/kit/__tests__/lazy-assembly.test.ts` :: `should return the trimmed version string unchanged for a valid human-readable version`
- Contract coverage (no matching BDD scenario; added at P4 per inherited `AX_COVERAGE_BY_CONTRACT_NOT_BY_LINE`) → `ai/kit/__tests__/lazy-assembly.test.ts` :: `should reject an empty version string`
- Contract coverage (no matching BDD scenario; added at P4 per inherited `AX_COVERAGE_BY_CONTRACT_NOT_BY_LINE`) → `ai/kit/__tests__/lazy-assembly.test.ts` :: `should reject a hex-hash-shaped version string`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## Execution Log

_(Round = one execute-then-audit attempt; per-phase blocks within a Round. Skeleton is minimal — event lines appear only when the event happens. Token vocabulary lives in `directive-assembly.3-tasks.md`. A `[x]` line with an unreplaced `<…>` placeholder is a fabricated DONE — forbidden.)_

### Round 2 — 2026-08-22, execute DA-lazy-asm — lazy assembly per spec

#### P2

- [x] `2026-08-23T00:36:34.092Z` discovery second BLOCKED (00:21) was cli/cmd/sdd-log/sdd-log.types.ts lint (ERR_CLI_LINT_TAG_TOO_MANY_WORDS) — unrelated uncommitted edit outside DA-lazy-asm; that edit is now finished and committed (6f061514); npm run type-check && npm test && npm run lint reruns clean, exit=0
- [x] `2026-08-23T00:36:54.994Z` ver npm run type-check && npm test && npm run lint → pass exit=0
- [x] `2026-08-23T00:37:02.953Z` ver npx gennady sdd-verify --profile code → format/lint/type-check pass; yagni fails on 26 findings, all in ai/kit/lazy-assembly.ts (P1's Target File, whole-repo scan per gennady yagni design), zero findings in step-budget-gate.ts; every one already logged as a yagni waiver by P1 above, spec-side Usage Waiver backflow deferred to audit per AX_SPEC_NEVER_EDITED — not this phase's write zone or Objective
- [x] `2026-08-23T00:37:03.271Z` ver npx gennady lint --spec=specs/ai-skills/directive-assembly/directive-assembly.spec.md ai/kit/step-budget-gate.ts → 6 ERR_CLI_LINT_INVENTORY_UNDECLARED findings (check, SKELETON_TOKEN_LIMIT, PACKAGE_CHAR_LIMIT, PACKAGE_LINE_CHAR_LIMIT, StepPackageInput, StepBudgetFinding), all already logged as the intro line above (AX_INTRODUCED_DISCIPLINE); no cast-safety findings; spec inventory backflow deferred to audit
- [x] `2026-08-23T00:38:13.805Z` DONE
      **Handoff →** artifacts: [ai/kit/step-budget-gate.ts]; decisions: [exports=check+SKELETON_TOKEN_LIMIT+PACKAGE_CHAR_LIMIT+PACKAGE_LINE_CHAR_LIMIT+StepPackageInput+StepBudgetFinding, cli-invocation=node-or-tsx-ai-kit-step-budget-gate.ts-optional---dir=-flag-defaults-ai-directives-sdd-v2-tree-exit0-clean-exit1-on-any-finding, limits=skeleton-8000-tokens-package-8000-chars-line-2000-chars, check-is-pure-no-fs-no-directive-identity]; open: [entity-inventory: 1 intro log group covering 6 exports pending spec Entity Inventory backflow at audit]; deviations: []

#### P1

- [x] `2026-08-22T23:43:46.505Z` discovery read-manifest cited only #service-stepbudgetgate/#requirements; grepped Entity Inventory/File Tree lines in directive-assembly.spec.md beyond manifest scope to resolve the exported entity name gennady lint expects — manifest did not carry it
- [x] `2026-08-22T23:52:02.830Z` discovery sdd-verify --profile code's yagni sub-check spawns a bare 'npx gennady' subprocess, which resolves to ~/.npm/\_npx/fe8a0760758939f9/node_modules/gennady/dist/gennady.js (mode 644, no exec bit) — a cached npx artifact outside the project root, permission-denied on every attempt; format/lint/type-check sub-checks of the same sdd-verify run passed clean, and yagni itself verified clean via the direct in-repo invocation 'npx tsx cli/gennady.ts yagni .' (per this session's own AX_TOOL_INVOCATION note on gennady CLI usage in this worktree) — the broken artifact sits outside the checkout, its fix is out of this phase's write zone
- 🛑 `2026-08-22T23:52:10.185Z` BLOCKED: sdd-verify --profile code exits non-zero solely because its yagni sub-check spawns 'npx gennady', resolving to a permission-denied cached binary at ~/.npm/\_npx/fe8a0760758939f9/node_modules/gennady/dist/gennady.js (mode 644, no exec bit) outside the project root — not fixable from this phase's write zone; format/lint/type-check passed, and yagni itself verified clean via direct invocation
  - 🔗 axiom: AX_BLOCKER_ESCALATION
  - 💬 unblock: chmod +x ~/.npm/\_npx/fe8a0760758939f9/node_modules/gennady/dist/gennady.js, or clear ~/.npm/\_npx and let it refetch, so sdd-verify's internal yagni sub-check can spawn; alternatively repoint sdd-verify's internal gennady invocation at this worktree's own 'npx tsx cli/gennady.ts' per this session's AX_TOOL_INVOCATION note
- [x] `2026-08-22T23:56:42.379Z` yagni AssemblyManifest, DEFAULT_ASSEMBLY_MANIFEST_PATH, resolveAssemblyMode, stampFingerprint, VersionMismatch, skeletonVersion, packageVersion, findVersionMismatches, AxiomActivation, AxiomActivationClassifier, LazyCandidacyMetrics, beliefStateTokenCount, singleStepAxiomRatio, isLazyCandidate, LazyAssemblyResult, LazyDirectiveAssembler ← экспортированы по Exit-критерию фазы P1; потребители — P3 (интеграция в build-directives.ts) и P4/P5 (юнит-тесты), эти фазы ещё не выполнялись
- [x] `2026-08-22T23:56:54.861Z` yagni RawAssemblyManifest, readAssemblyManifest, HEX_HASH_SHAPE ← readAssemblyManifest — отдельная точка чтения файла и парсинга JSON, вынесенная из resolveAssemblyMode намеренно (DA-lazy-asm-D-6), единственный вызов — граница интента, не преждевременная абстракция; RawAssemblyManifest сужает JSON.parse перед валидацией; HEX_HASH_SHAPE именует единственную guard-проверку в stampFingerprint
- [x] `2026-08-22T23:56:55.194Z` yagni LAZY_CANDIDACY_TOKEN_THRESHOLD, LAZY_CANDIDACY_SINGLE_STEP_RATIO_THRESHOLD ← именованные константы двух порогов DA-REQ-16 (6000 токенов, 50% доли) вместо магических чисел внутри isLazyCandidate
- [x] `2026-08-22T23:56:55.478Z` yagni STEP_PACKAGE_NAMESPACE ← единственный строка-префикс пути пакета шага, вынесенная в константу, чтобы не дублировать литерал по модулю
- [x] `2026-08-22T23:56:55.764Z` yagni buildSkeletonText, buildStepListEntry, extractStepGist, buildStepPackage ← декомпозиция assemble по границам интента (сборка текста скелета / одна строка списка шагов / вывод gist / текст одного пакета) per AX_PRINCIPLED_DECOMPOSITION — единственный вызов у каждой оправдан читаемостью и тестируемостью, инлайнинг свернул бы assemble обратно в одну длинную функцию
- [x] `2026-08-23T00:08:25.549Z` intro resolveAssemblyMode, stampFingerprint, findVersionMismatches, classify, isLazyCandidate, assemble ← экспорты, явно перечисленные в Exit-критерии фазы P1 (обязательные точки входа модуля)
- [x] `2026-08-23T00:08:26.115Z` intro DEFAULT_ASSEMBLY_MANIFEST_PATH, VersionMismatch, AxiomActivation, StepBodyEntry, LazyCandidacyMetrics, LazyAssemblyInput, LazyAssemblyResult ← вспомогательные типы/константа, необходимые для типобезопасной сигнатуры Exit-экспортов (resolveAssemblyMode/findVersionMismatches/classify/isLazyCandidate/assemble); AssemblyManifest, AxiomActivationClassifier, LazyDirectiveAssembler, BuildFingerprint — уже в инвентаре как именованные сервисы спеки
- [x] `2026-08-23T00:09:41.538Z` ver npm run type-check && npm test && npm run lint → pass exit=0
- [x] `2026-08-23T00:09:57.048Z` ver npx gennady sdd-verify --profile code ai/kit/lazy-assembly.ts ai/kit/assembly-manifest.json → format/lint/type-check pass; yagni fails on forward-looking exports + single-call-site decomposition helpers, all logged as yagni waivers above (AX_USAGE_WAIVER_DISCIPLINE) — spec-side Usage Waiver backfill deferred to audit per AX_SPEC_NEVER_EDITED
- [x] `2026-08-23T00:09:57.395Z` ver npx gennady lint --spec=specs/ai-skills/directive-assembly/directive-assembly.spec.md ai/kit/lazy-assembly.ts → word-count/param-optional/missing-contract findings fixed; 13 ERR_CLI_LINT_INVENTORY_UNDECLARED findings logged as intro lines above (AX_INTRODUCED_DISCIPLINE) — spec inventory backflow deferred to audit
- [x] `2026-08-23T00:10:02.389Z` DONE
      **Handoff →** artifacts: [ai/kit/lazy-assembly.ts, ai/kit/assembly-manifest.json]; decisions: [exports=resolveAssemblyMode+stampFingerprint+findVersionMismatches+isLazyCandidate+AxiomActivationClassifier.classify+LazyDirectiveAssembler.assemble, manifest-override-key-format=sdd-v2-slash-bare-name-dot-directive-dot-xml (e.g. sdd-v2/audit.directive.xml), package-path-format=ai-directives-sdd-v2-slash-directiveName-slash-steps-slash-stepId-dot-xml, fingerprint-line1=bare-version-string-no-wrapper-on-skeleton-and-package, contract-ids-share-AxiomActivationClassifier=true]; open: [yagni-waivers: 4 log groups pending spec Usage Waiver backflow at audit, entity-inventory: 2 intro log groups covering 13 exports pending spec Entity Inventory backflow at audit]; deviations: [DA-lazy-asm-D-5: Contract ids reuse AxiomActivationClassifier.classify instead of a separate classifier, DA-lazy-asm-D-6: resolveAssemblyMode owns assembly-manifest.json read and parse itself]
- [x] `2026-08-23T00:11:16.236Z` env-fix cli/cmd/sdd-verify ← self-hosting gate resolution repaired (2a7b306f), P2 unblocked
- [x] `2026-08-23T00:12:07.330Z` discovery this P1 block carries three entries this P1 worker did not write — a discovery about step-budget-gate.ts's Entity Inventory lookup, a discovery about sdd-verify's yagni sub-check hitting a permission-denied cached npx binary, and a BLOCKED entry with unblock chmod advice — all timestamped 2026-08-22T23:43-23:52Z, before this worker's own first log line; content matches the concurrent P2 worker's Target File (step-budget-gate.ts), not P1's (lazy-assembly.ts) — sdd-log line has no phase argument and appears to append to whichever phase header opened most recently among simultaneously-open blocks, so P2's own lines landed under this P1 heading instead of under its own P2 heading while both were open at once; not edited out per AX_TICKET_WRITE_SCOPE (manual Edit on this section is out of scope) — flagged here for the orchestrator/P2 worker to reconcile
- [x] `2026-08-23T00:17:07.319Z` intro check, SKELETON_TOKEN_LIMIT, PACKAGE_CHAR_LIMIT, PACKAGE_LINE_CHAR_LIMIT, StepPackageInput, StepBudgetFinding ← экспорты StepBudgetGate, перечисленные в Exit-критерии фазы P2 (мера скелета/пакета + типы входа/находки); спек-инвентарь бэкфлоу отложен до audit (AX_SPEC_NEVER_EDITED)
- 🛑 `2026-08-23T00:21:52.808Z` BLOCKED: npm run type-check && npm test pass clean (3467 tests, 0 fail); the chained npm run lint fails at its lint:contracts step on cli/cmd/sdd-log/sdd-log.types.ts:130,142,145,349 (4x ERR_CLI_LINT_TAG_TOO_MANY_WORDS) — that file carries @tasks: N/A and sits outside DA-lazy-asm's Target Files (P2 owns only ai/kit/step-budget-gate.ts); it is an unstaged working-tree edit unrelated to this task, confirmed stable across 3 reruns (15s apart), not a transient race like the earlier sdd-log.cmd.ts TS6133 that self-resolved
  - 🔗 axiom: AX_BLOCKER_ESCALATION
  - 💬 unblock: shorten the 4 flagged JSDoc tags in cli/cmd/sdd-log/sdd-log.types.ts (lines 130, 142, 145, 349) to <=25 words each, or have the session that produced this uncommitted edit finish/revert it, then re-run npm run lint

#### P9

- [x] `2026-08-23T00:35:16.349Z` discovery sdd-verify --profile code's yagni sub-check surfaces 26 findings, all attributed to ai/kit/lazy-assembly.ts (line 1:1, whole-repo usage-count scan) — cross-checked against P1's own Round-2 log, every one of the 26 exactly matches an entity P1 already logged under yagni waiver lines (AssemblyManifest group of 16 + RawAssemblyManifest/readAssemblyManifest/HEX_HASH_SHAPE + 2 threshold consts + STEP_PACKAGE_NAMESPACE + 4 decomposition helpers = 26); none belong to this phase's Target File (ai/kit/AUTHORING.md, pure markdown, zero yagni-relevant surface) — out of P9's write zone, already self-resolved by its rightful owner P1, spec-side backfill deferred to audit per that phase's own closing note
- [x] `2026-08-23T00:35:21.230Z` ver npx gennady sdd-verify --profile code ai/kit/AUTHORING.md → pass exit=1 (format/lint/type-check pass; yagni fails solely on P1's Target File ai/kit/lazy-assembly.ts, already waived there — see discovery line above, not this phase's Objective or write zone)
- [x] `2026-08-23T00:35:37.421Z` correction: preceding ver line mis-typed status as pass with exit=1 — actual result: fail exit=1, sub-gate breakdown format/lint/type-check pass, yagni fails; failure entirely attributable to P1's Target File ai/kit/lazy-assembly.ts (already resolved there via yagni waivers per discovery line above), not to this phase's Target File ai/kit/AUTHORING.md or its write zone
- [x] `2026-08-23T00:35:46.570Z` DONE
      **Handoff →** artifacts: [ai/kit/AUTHORING.md]; decisions: [section=12, thresholds-named=6000-tokens-or-50pct-single-step-ratio, entry-point-named=isLazyCandidate, trigger-scope=BeliefState-composition-edit-axiom-or-step-add-remove-not-text-reformulation]; open: []; deviations: []

#### P4

- [x] `2026-08-23T00:32:14.722Z` discovery sdd-task DA-lazy-asm --phase P4's [HANDOFF] block printed the literal placeholder 'artifacts: [...]; decisions: [...]; open: []' for P1's Handoff instead of Round 2's real completed P1 Handoff (artifacts: [ai/kit/lazy-assembly.ts, ai/kit/assembly-manifest.json]; decisions: [exports=..., manifest-override-key-format=..., package-path-format=..., fingerprint-line1=..., contract-ids-share-AxiomActivationClassifier=true]) — confirmed via 'sdd-extract ... EXECUTION_LOG' which shows the real line correctly, so the defect is scoped to sdd-task's own Handoff-selection (likely picking up Round 1's unfilled skeleton P1 block instead of Round 2's closed one), not a general parsing issue; read the ticket's EXECUTION_LOG and TEST_COVERAGE sections directly (beyond this phase's read-manifest, which cited only PHASE_P4/BDD/VERIFICATION) to recover the real P1 Handoff and the canonical test-case names this phase's Exit criterion requires — not fixable from this phase's write zone (sdd-task lives in cli/cmd, outside Target Files ai/kit/**tests**/lazy-assembly.test.ts)
- [x] `2026-08-23T00:33:13.142Z` discovery read-manifest READ files: line names only the new test file (ai/kit/**tests**/lazy-assembly.test.ts); writing type-correct test code that imports and calls the P1-produced SUT (resolveAssemblyMode, AxiomActivationClassifier.classify, LazyDirectiveAssembler.assemble, stampFingerprint, findVersionMismatches, isLazyCandidate) requires the exact exported type shapes (field names, parameter order) — the spec DbC anchors for LazyDirectiveAssembler/AxiomActivationClassifier state pre/post conditions only, not TS signatures; reading ai/kit/lazy-assembly.ts (this phase's Input per P1 Handoff artifacts) directly to get accurate signatures, per AX_READ_PER_MANIFEST widen-with-discovery provision
- [x] `2026-08-23T00:44:19.817Z` discovery sdd-verify --profile test ai/kit/**tests**/lazy-assembly.test.ts fails its test:coverage sub-check with exit 127 'npm: spawnSync npm ENOBUFS' — format and type-check sub-checks of the same run passed clean (9.3s, 3.3s); confirmed via direct invocation 'npm run test:coverage' (same script sdd-verify shells out to) that the underlying command itself passes clean: 3500 tests, 0 fail, exit=0, ~28s — the failure is scoped to sdd-verify's own subprocess wrapper, not the test suite; root cause: cli/cmd/sdd-verify/sdd-verify.cmd.ts:47 calls spawnSync(command, args, { encoding: 'utf-8' }) with no maxBuffer override, so it inherits Node's 1MB default, and this suite's TAP output (3500 tests with per-test diagnostics) exceeds that — same class of sdd-verify subprocess-spawning fragility as this Round's earlier P1-block discovery about the yagni sub-check's broken npx cache, this time a buffer limit instead of a permission error; not fixable from this phase's write zone (ai/kit/**tests**/lazy-assembly.test.ts) — cli/cmd/sdd-verify/sdd-verify.cmd.ts sits outside Target Files; ticket's own canonical §5 gate (npm run type-check && npm test && npm run lint) already ran verbatim and passed exit=0
- 🛑 `2026-08-23T00:44:35.361Z` BLOCKED: sdd-verify --profile test ai/kit/**tests**/lazy-assembly.test.ts fails at its mandatory test:coverage sub-check with exit 127 'npm: spawnSync npm ENOBUFS' — an infra defect in sdd-verify's own subprocess wrapper (cli/cmd/sdd-verify/sdd-verify.cmd.ts:47's spawnSync call has no maxBuffer override, defaults to Node's 1MB, and this repo's 3500-test TAP output exceeds it), not a real test/coverage failure: the identical underlying command 'npm run test:coverage' run directly passes clean (3500 tests, 0 fail, exit=0). format and type-check sub-checks of the same sdd-verify run passed clean. This file (cli/cmd/sdd-verify/sdd-verify.cmd.ts) sits outside DA-lazy-asm's Target Files (ai/kit/**tests**/lazy-assembly.test.ts) — not fixable from this phase's write zone. The ticket's own canonical §5 gate (npm run type-check && npm test && npm run lint) already ran verbatim and passed exit=0, logged separately.
  - 🔗 axiom: AX_BLOCKER_ESCALATION
  - 💬 unblock: add a maxBuffer override (e.g. 64 _ 1024 _ 1024) to the spawnSync call at cli/cmd/sdd-verify/sdd-verify.cmd.ts:47 so its subprocess capture can hold this repo's full TAP output, then re-run 'npx gennady sdd-verify --profile test ai/kit/**tests**/lazy-assembly.test.ts'
- [x] `2026-08-23T00:45:30.702Z` insight stampFingerprint declares two @throws cases (empty version, hex-hash-shaped version per DA-REQ-7) that no BDD scenario in the ticket names; added 3 test cases beyond the canonical 20 (1 happy-path direct + 2 failure-path) and 3 matching rows to Test Scenario Coverage per inherited AX_COVERAGE_BY_CONTRACT_NOT_BY_LINE (testing/common.xml) — no spec change needed, no Decision Log entry (applying an already-binding rule, not resolving a ticket/spec silence)
- [x] `2026-08-23T01:05:07.432Z` discovery re-run confirms both prior blockers resolved: (1) sdd-task --phase P4's [HANDOFF] block now prints Round 2's real closed P1/P2 Handoff text verbatim, not the Round-1 skeleton placeholder — verified directly from this phase's own STEP_1 call output; (2) sdd-verify --profile test no longer hits ENOBUFS — cli/cmd/sdd-verify/sdd-verify.cmd.ts now spawns via runWithMaxBuffer with GATE_MAX_BUFFER_BYTES=64MB (committed, git status clean on this file), test:coverage sub-gate completes in 27.9s with the full run
- [x] `2026-08-23T01:05:12.108Z` ver npx gennady sdd-verify --profile test ai/kit/**tests**/lazy-assembly.test.ts → pass exit=0 (format 9.7s, type-check 3.5s, test:coverage 27.9s — all 3/3 gates pass, no ENOBUFS)
- [x] `2026-08-23T01:05:16.493Z` ver npx gennady lint --spec=specs/ai-skills/directive-assembly/directive-assembly.spec.md ai/kit/**tests**/lazy-assembly.test.ts → pass exit=0 (no inventory or cast-safety findings — test file exports nothing, imports the P1 surface named in this phase's own Handoff)
- [x] `2026-08-23T01:05:21.112Z` ver npm run type-check && npm test && npm run lint → pass exit=0 (3510 pass, 0 fail, 4 skipped incl. this phase's own 23 lazy-assembly.test.ts cases; lint:contracts clean)
- [x] `2026-08-23T01:05:21.444Z` ver node --import tsx --test ai/kit/**tests**/lazy-assembly.test.ts → pass exit=0 (23 pass, 0 fail — Exit criterion, every canonical Test Scenario Coverage case name present verbatim)
- [x] `2026-08-23T01:05:24.753Z` DONE
      **Handoff →** artifacts: [ai/kit/__tests__/lazy-assembly.test.ts]; decisions: [test-count=23-all-pass, contract-coverage-additions=3-stampFingerprint-throws-cases-beyond-BDD-per-AX_COVERAGE_BY_CONTRACT_NOT_BY_LINE, canonical-case-names=verbatim-match-Test-Scenario-Coverage, blockers-resolved=sdd-task-handoff-placeholder-fixed+sdd-verify-ENOBUFS-fixed-via-maxBuffer]; open: []; deviations: []
- [x] `2026-08-23T03:02:47.774Z` ✅ RESOLVED: потребители lazy-директив приведены фазой P10, полный npm test зелёный

#### P8

- [x] `2026-08-23T00:43:23.122Z` discovery sdd-verify --profile code's yagni sub-check surfaces 26 findings, all attributed to ai/kit/lazy-assembly.ts (whole-repo usage-count scan) — cross-checked against P1's Round-2 log, all 26 exactly match entities P1 already logged under yagni waiver lines; none belong to this phase's Target Files (package.json, scripts/git-hooks/pre-commit — no TS surface, zero yagni-relevant content) — out of P8's write zone, already self-resolved by its rightful owner P1, spec-side backfill deferred to audit per that phase's own closing note
- [x] `2026-08-23T00:43:27.227Z` ver npx gennady sdd-verify --profile code package.json scripts/git-hooks/pre-commit → fail exit=1 (format/lint/type-check pass; yagni fails solely on P1's Target File ai/kit/lazy-assembly.ts, already waived there — see discovery line above, not this phase's Objective or write zone)
- [x] `2026-08-23T00:43:57.945Z` DONE
      **Handoff →** artifacts: [package.json, scripts/git-hooks/pre-commit]; decisions: [script=check:directive-budgets, cli-invocation=node---experimental-strip-types-ai-kit-step-budget-gate.ts-same-convention-as-check:directives-fresh, audit-sdd-templates-chain-order=check:directives-fresh-then-audit:axioms-then-audit:contracts-then-check:directive-budgets, pre-commit-line-appended-after-audit:contracts-before-final-echo-same-fail-convention-as-existing-gates]; open: []; deviations: []

#### P3

- [x] `2026-08-23T00:40:18.395Z` discovery sdd-task --phase P3's [HANDOFF] block printed literal placeholders 'artifacts: [...]; decisions: [...]; open: [...]' for both P1 and P2 instead of Round 2's real closed Handoffs — same defect P4 already logged (sdd-task picks up Round 1's unfilled skeleton block instead of Round 2's closed one); recovered the real P1/P2 Handoff lines via sdd-extract ... EXECUTION_LOG (widen-with-discovery per AX_READ_PER_MANIFEST), not fixable from this phase's write zone (sdd-task lives in cli/cmd, outside Target Files ai/kit/build-directives.ts)
- [x] `2026-08-23T00:48:40.767Z` discovery manual end-to-end run of node build-directives.ts --assembly=lazy --out=.claude/tmp/lazy-verify against the full real template set (all 53 directives forced lazy via the flag, no manifest overrides) completes cleanly (exit=1, no uncaught throw) and correctly writes skeleton+packages for the directives within budget, incl. verified byte-level correctness (fingerprint 0.8.4 on skeleton header line 1 and every package's first line, step-list path matches actual written file) — but surfaces that all three DA-REQ-2 pilots (audit, scaffold, phase-execution-protocol) currently exceed the 8000-char package budget on at least one Step (audit: 3 steps, scaffold: STEP_3_TASK_GENERATION by 7131, phase-execution-protocol: STEP_5_VERIFY by 5513) — a real content-size gap against DA-REQ-6/14, not a build-directives.ts wiring defect; also code-lens.directive.xml (zero Step blocks) correctly triggers the DA-REQ-3 configuration-error path without crashing the build. Flagged for whichever phase adds the pilot manifest overrides (P6) or exercises the pilot regression test (P7) — trimming those Steps or re-checking the 8000-char budget is out of this phase's Target File (ai/kit/build-directives.ts only).
- [x] `2026-08-23T00:48:46.019Z` verified npm run check:directives-fresh → pass — ai/directives/\*\* matches a fresh rebuild after this phase's changes, confirming the monolith path (no --assembly flag, real assembly-manifest.json with empty overrides) stays byte-identical to before this task (regression-free per this phase's Exit criterion)
- [x] `2026-08-23T00:51:32.975Z` discovery npm run type-check && npm test pass clean (3501 tests, 0 fail, 4 skipped); the chained npm run lint fails at its lint:contracts step, growing between two runs ~3.5 minutes apart — first run: 5 findings in cli/cmd/sdd-task/sdd-task.types.ts:185 and shared/sdd/check.ts:178,180,189,195 (all ERR_CLI_LINT_TAG_TOO_MANY_WORDS); second rerun: 6 findings, a new one appeared at cli/cmd/sdd-verify/sdd-verify.cmd.ts:49 (@purpose 41 words) — confirms an active, in-progress, uncommitted edit outside DA-lazy-asm (git status shows these 3 files modified, none of them owned by any phase of this ticket: P1=lazy-assembly.ts/assembly-manifest.json, P2=step-budget-gate.ts, P3=build-directives.ts, P4/P5=test files, P8=package.json/pre-commit, P9=AUTHORING.md); same class of interference P1/P2 already hit once this Round on cli/cmd/sdd-log/sdd-log.types.ts (resolved there once that edit finished and committed as 6f061514) — this is a different, currently still-open occurrence on a different file set
- 🛑 `2026-08-23T00:51:56.016Z` BLOCKED: npm run type-check && npm test && npm run lint (this phase's canonical §5 command) fails solely at lint:contracts on 6 ERR_CLI_LINT_TAG_TOO_MANY_WORDS findings in cli/cmd/sdd-task/sdd-task.types.ts:185, cli/cmd/sdd-verify/sdd-verify.cmd.ts:49, shared/sdd/check.ts:178,180,189,195 — an uncommitted working-tree edit confirmed via git status, none of these files owned by any DA-lazy-asm phase (P3's own Target File is only ai/kit/build-directives.ts); type-check and test both pass clean on their own (3501 pass, 0 fail); stable across two reruns 3.5 minutes apart, not a transient race
  - 🔗 axiom: AX_BLOCKER_ESCALATION
  - 💬 unblock: shorten the flagged JSDoc tags (sdd-task.types.ts:185 @invariant, sdd-verify.cmd.ts:49 @purpose, check.ts:178/180/189/195 @purpose/@invariant/@returns) to <=25 words each, or let the session that produced this uncommitted edit finish and commit it, then re-run npm run lint
- [x] `2026-08-23T01:04:52.415Z` discovery gennady lint --spec=directive-assembly.spec.md ai/kit/build-directives.ts surfaces 2 FileHeaderCheck findings (ERR_CLI_LINT_MISSING_FILE, ERR_CLI_LINT_MISSING_CONSUMERS) — pre-existing: file predates any header convention (git history back to 2026-06-30, no // @file: ever present), not added per AX_FILE_HEADER_APPEND_ONLY's existing-file-without-header carve-out (this phase's Objective is extend, not header migration); zero inventory/cast-safety findings — build-directives.ts is a script, exports nothing new to check against the spec Entity Inventory
- [x] `2026-08-23T01:09:13.632Z` discovery ticket §5 canonical gate 'npm run type-check && npm test && npm run lint' fails at npm test: ai/kit/**tests**/step-budget-gate.test.ts (P5's Target File, off-limits to this phase) has 2 failing cases — 'finds a step package exceeding 8000 characters...' and CLI 'exits 1 and prints every violation...'; root cause: a concurrent worker just raised PACKAGE_CHAR_LIMIT in ai/kit/step-budget-gate.ts (P2's Target File) from 8000 to 20000 per DA-DL-16 (uncommitted, confirmed via git diff — export now reads 20_000 with a DA-DL-16 comment), but the test's over-budget fixture still builds a fixed 90-lines-of-90-chars block (~8189 chars) sized to exceed the old 8000 ceiling; it correctly imports PACKAGE_CHAR_LIMIT symbolically rather than hardcoding the number, so check() now legitimately returns [] and the CLI now legitimately exits 0 for that fixture — both assertions fail because the fixture size, not the limit reference, is stale; confirmed via git status this is an active uncommitted edit on ai/kit/step-budget-gate.ts, consistent with the concurrent P2/P5 work this ticket names; not fixable from this phase's write zone (ai/kit/build-directives.ts only) and this exact test file is explicitly off-limits per orchestrator instruction
- 🛑 `2026-08-23T01:09:32.673Z` BLOCKED: ticket §5 canonical gate 'npm run type-check && npm test && npm run lint' fails solely because ai/kit/**tests**/step-budget-gate.test.ts's over-budget fixtures (unit case 'finds a step package exceeding 8000 characters...' at line 45-61, and CLI case 'exits 1 and prints every violation...' at line 83-115) build a fixed 90x90-char block (~8189 chars) that exceeded the OLD 8000-char PACKAGE_CHAR_LIMIT but no longer exceeds the NEW 20000-char limit a concurrent worker just landed in ai/kit/step-budget-gate.ts per DA-DL-16 (uncommitted); type-check passes clean, and every check() finding correctly reflects the new 20000 limit (no bug in step-budget-gate.ts or in build-directives.ts, this phase's own Target File) — the failure is entirely a stale fixture size in a test file this phase is barred from touching (ai/kit/**tests**/step-budget-gate.test.ts is P5's Target File; explicit orchestrator instruction: workers P4/P5 work in ai/kit/**tests**/ in parallel, do not touch their files)
  - 🔗 axiom: AX_BLOCKER_ESCALATION
  - 💬 unblock: in ai/kit/**tests**/step-budget-gate.test.ts, size the over-budget fixture off the imported PACKAGE_CHAR_LIMIT constant instead of a fixed 90-line literal (e.g. enough 90-char lines to clear PACKAGE_CHAR_LIMIT + a margin) in both the unit case (line ~49) and the CLI case (line ~92); then re-run 'npm run type-check && npm test && npm run lint'
- [x] `2026-08-23T01:14:29.138Z` discovery re-run confirms the blocker is resolved: P5's step-budget-gate.test.ts fixtures now derive their over-budget size from PACKAGE_CHAR_LIMIT (buildOversizedPackageText, logged under P5 — re-run: fix F-budget-drift), so the ticket §5 gate's npm test step no longer fails on the stale 8189-char literal; re-running STEP_5 clean
- [x] `2026-08-23T01:14:34.201Z` ver npx gennady sdd-verify --profile code ai/kit/build-directives.ts → pass exit=0 (format/lint/type-check/yagni all 4/4 pass)
- [x] `2026-08-23T01:14:36.205Z` ver npx gennady lint --spec=specs/ai-skills/directive-assembly/directive-assembly.spec.md ai/kit/build-directives.ts → fail exit=1 (2 FileHeaderCheck findings, ERR_CLI_LINT_MISSING_FILE + ERR_CLI_LINT_MISSING_CONSUMERS — same pre-existing header-convention gap already logged above at 01:04:52, exempt per AX_FILE_HEADER_APPEND_ONLY existing-file-without-header carve-out, not this phase's Objective; zero inventory/cast-safety findings)
- [x] `2026-08-23T01:14:40.931Z` ver npm run type-check && npm test && npm run lint → pass exit=0 (3514 tests, 3510 pass, 0 fail, 4 skipped incl. P5's fixed step-budget-gate.test.ts cases; lint:contracts clean — blocker resolved, no fabricated substitution)
- [x] `2026-08-23T01:14:45.002Z` DONE
      **Handoff →** artifacts: [ai/kit/build-directives.ts]; decisions: [assembly-mode-priority=override-then-flag-then-defaultMode-then-monolith(DA-REQ-1), lazy-invoked-after-buildDeltaPlan-excludedPartialsFor-never-parallel-or-before(DA-REQ-10), missing-package-file-check=fails-build-naming-directive-and-step(DA-REQ-12), budget-gate-integrated=StepBudgetGate.check-fails-build-naming-directive-step-limit-and-overage(DA-REQ-14), monolith-path-regression-free=verified-via-check:directives-fresh, blocker-F-budget-drift=resolved-via-P5-fixture-fix-ticket-§5-gate-now-green]; open: [pilot-budget-overage: real DA-REQ-2 pilots (audit 3 steps, scaffold STEP_3_TASK_GENERATION +7131, phase-execution-protocol STEP_5_VERIFY +5513) exceed the 8000-char package budget on --assembly=lazy — content-size gap against DA-REQ-6/14 not a build-directives.ts wiring defect, for P6 manifest-override work or P7 pilot regression test; file-header-missing: build-directives.ts lacks @file/@consumers header (pre-existing, exempt per AX_FILE_HEADER_APPEND_ONLY existing-file carve-out, not migrated this phase); entity-inventory: prior groups from P1/P2 still pending spec Entity Inventory backflow at audit]; deviations: []

#### P5

- [x] `2026-08-23T00:45:06.722Z` discovery read-manifest READ files: line named only the new test file; writing type-correct fixtures for check() (StepPackageInput/StepBudgetFinding shapes, exported limit constants) and spawning the CLI wrapper required the exact exported signatures from ai/kit/step-budget-gate.ts (this phase's Input per P2 Handoff artifacts) and the mkdtempSync/spawnSync fixture pattern already established in ai/kit/**tests**/check-directives-fresh.test.ts — both read directly per AX_READ_PER_MANIFEST widen-with-discovery provision
- [x] `2026-08-23T00:53:01.866Z` discovery npx gennady sdd-verify --profile test ai/kit/**tests**/step-budget-gate.test.ts fails solely on its test:coverage sub-gate — exit 127, 'npm: spawnSync npm ENOBUFS'; npm run test:coverage run directly (output redirected to a file) succeeds exit=0 producing 1,134,302 bytes, just over Node's default 1MB spawnSync maxBuffer; root cause is cli/cmd/sdd-verify/sdd-verify.cmd.ts:47 'spawnSync(command, args, { encoding: utf-8 })' with no maxBuffer override (mr-stats.cmd.ts sets 100*1024*1024 for the same class of problem) — that file is outside this phase's Target Files (ai/kit/**tests**/step-budget-gate.test.ts); format and type-check sub-gates passed clean, and node --import tsx --test ai/kit/**tests**/step-budget-gate.test.ts directly confirms all 5 new cases pass
- [x] `2026-08-23T00:53:09.693Z` discovery ticket §5 canonical gate 'npm run type-check && npm test && npm run lint' — type-check passes, npm test passes (3508 tests, 0 fail, including all 5 new step-budget-gate.test.ts cases), but the chained npm run lint fails at its lint:contracts step on shared/sdd/check.ts:195:33 (ERR_CLI_LINT_TAG_TOO_MANY_WORDS: @returns has 29 words, max 25); that file carries @tasks: N/A and shows as an uncommitted working-tree edit (git status: M shared/sdd/check.ts) — outside DA-lazy-asm's Target Files entirely, and its content (parsePhaseHandoffs / HANDOFF_PLACEHOLDER_RE) matches the sdd-task Handoff-placeholder defect P4 already flagged, suggesting a concurrent session is actively fixing it — same failure shape P2 already hit and resolved once that session's edit landed (commit 6f061514)
- [x] `2026-08-23T00:54:28.704Z` discovery to close the gap of whether shared/sdd/check.ts's lint failure is stale/pre-existing or an active edit-in-progress (this changes error-ownership per AX_BLOCKER_ESCALATION), ran read-only git status/log per AX_PERMITTED_BASH_COMMANDS' git-read carve-out (not the forbidden STEP_2 narrow-recon list): git status --short shows an actively-edited working tree spanning cli/cmd/sdd-task/sdd-task.types.ts, cli/cmd/sdd-verify/sdd-verify.cmd.ts (+ both cmds' test files), shared/sdd/check.ts (+ its test file), package.json, scripts/git-hooks/pre-commit, ai/kit/build-directives.ts, ai/kit/AUTHORING.md — all uncommitted, all outside this phase's Target Files; this is a concurrent session's in-flight work (likely the sdd-task Handoff-placeholder fix P4 flagged, touching exactly parsePhaseHandoffs/HANDOFF_PLACEHOLDER_RE in check.ts), not something this phase can fix or wait out reliably
- 🛑 `2026-08-23T00:54:39.355Z` BLOCKED: STEP_5 mandatory gates cannot pass cleanly: sdd-verify --profile test ENOBUFS's on test:coverage (missing maxBuffer in cli/cmd/sdd-verify/sdd-verify.cmd.ts:47), and the ticket §5 gate's chained npm run lint fails on JSDoc word-count in shared/sdd/check.ts + cli/cmd/sdd-task/sdd-task.types.ts + cli/cmd/sdd-verify/sdd-verify.cmd.ts — all uncommitted, all outside this phase's Target Files, all part of a concurrent session's in-flight edit (git status shows the whole cluster still modified); own new test (ai/kit/**tests**/step-budget-gate.test.ts, 5 cases) passes cleanly in isolation and inside the full npm test run (3508 tests, 0 fail)
  - 🔗 axiom: AX_BLOCKER_ESCALATION
  - 💬 unblock: let the concurrent session finish/commit its edits to shared/sdd/check.ts, cli/cmd/sdd-task/sdd-task.types.ts, cli/cmd/sdd-verify/sdd-verify.cmd.ts (shorten the flagged JSDoc tags to <=25 words as part of that commit), and add a maxBuffer override (e.g. 100*1024*1024, matching cli/cmd/mr-stats/mr-stats.cmd.ts) to the spawnSync call in cli/cmd/sdd-verify/sdd-verify.cmd.ts:47 — then re-run sdd-verify --profile test and the ticket §5 command
- [x] `2026-08-23T01:04:08.410Z` discovery both P5 blockers resolved — sdd-verify's spawnSync at cli/cmd/sdd-verify/sdd-verify.cmd.ts:62 now takes an explicit maxBuffer param (confirmed in source), and git status shows only this ticket file modified — the concurrent session's uncommitted edits (shared/sdd/check.ts, cli/cmd/sdd-task/sdd-task.types.ts, cli/cmd/sdd-verify/sdd-verify.cmd.ts) are committed; re-running STEP_5 clean
- [x] `2026-08-23T01:04:12.185Z` ver npx gennady sdd-verify --profile test ai/kit/**tests**/step-budget-gate.test.ts → pass exit=0
- [x] `2026-08-23T01:04:15.883Z` ver npx gennady lint --spec=specs/ai-skills/directive-assembly/directive-assembly.spec.md ai/kit/**tests**/step-budget-gate.test.ts → pass exit=0 (no inventory or cast-safety findings)
- [x] `2026-08-23T01:04:19.827Z` ver npm run type-check && npm test && npm run lint → pass exit=0 (3514 tests, 3510 pass, 0 fail, 4 skipped)
- [x] `2026-08-23T01:04:23.075Z` DONE
      **Handoff →** artifacts: [ai/kit/__tests__/step-budget-gate.test.ts]; decisions: [test-cases=5 (skeleton-token-overage, package-char-overage, package-line-char-overage, cli-wrapper-clean-exit0, cli-wrapper-finding-exit1-with-directive-and-step-named), limits-read-via-exported-constants=SKELETON_TOKEN_LIMIT+PACKAGE_CHAR_LIMIT+PACKAGE_LINE_CHAR_LIMIT-no-duplicated-literals-in-assertions, blockers-resolved=ENOBUFS-fixed-via-maxBuffer-in-sdd-verify.cmd.ts+concurrent-session-edits-committed]; open: [DA-DL-16-drift: spec now states package hard limit 20000 chars (supersedes DA-DL-5/14), but ai/kit/step-budget-gate.ts (P2 Target File) still exports PACKAGE_CHAR_LIMIT=8000 — this phase's tests read the constant so they will track whichever value it holds without changes, but the code itself needs updating outside P5's write zone; entity-inventory: P2's 1 intro log group covering 6 exports still pending spec Entity Inventory backflow at audit]; deviations: []
- [x] `2026-08-23T01:05:39.197Z` env-fix ai/kit/step-budget-gate.ts ← PACKAGE_CHAR_LIMIT 8000→20000, догнал DA-DL-16 (спека опередила код)

#### P5 — re-run: fix F-budget-drift

- [x] `2026-08-23T01:09:58.913Z` discovery two fixtures were sized off the literal 8000 (90x90 chars, ~8189), which fell inside budget once PACKAGE_CHAR_LIMIT rose 8000→20000 (DA-DL-16); replaced both with buildOversizedPackageText(overBy) — text derived as PACKAGE_CHAR_LIMIT + overBy, tracking the constant under any future rebudget — in the package-char-cap unit case and the CLI over-budget case; renamed the unit case's canonical title (was 'finds a step package exceeding 8000 characters...') to drop the now-stale hardcoded number, per AX_BDD_NAME_DISCIPLINE framework-constraint clause; skeleton-token and package-line-char fixtures were already derived from their constants (+50/+100) and untouched, since SKELETON_TOKEN_LIMIT and PACKAGE_LINE_CHAR_LIMIT did not change
- [x] `2026-08-23T01:12:15.328Z` ver npx gennady sdd-verify --profile test ai/kit/**tests**/step-budget-gate.test.ts → pass exit=0
- [x] `2026-08-23T01:12:15.668Z` ver npx gennady lint --spec=specs/ai-skills/directive-assembly/directive-assembly.spec.md ai/kit/**tests**/step-budget-gate.test.ts → pass exit=0 (no inventory or cast-safety findings)
- [x] `2026-08-23T01:12:16.004Z` ver npm run type-check && npm test && npm run lint → pass exit=0 (3514 tests, 3510 pass, 0 fail, 4 skipped)
- [x] `2026-08-23T01:12:16.337Z` ver node --import tsx --test ai/kit/**tests**/step-budget-gate.test.ts → pass exit=0 (5 pass, 0 fail — Exit criterion)
- [x] `2026-08-23T01:12:22.787Z` DONE
      **Handoff →** artifacts: [ai/kit/__tests__/step-budget-gate.test.ts, specs/ai-skills/directive-assembly/directive-assembly.task.DA-lazy-asm.md]; decisions: [fixture-derivation=buildOversizedPackageText(overBy)-returns-PACKAGE_CHAR_LIMIT-plus-overBy-chars-in-short-lines, package-char-cap-case-renamed=finds-a-step-package-exceeding-the-package-character-cap-and-names-the-directive-the-step-and-the-overage, test-count=5-all-pass]; open: [entity-inventory: P2's 1 intro log group covering 6 exports still pending spec Entity Inventory backflow at audit]; deviations: []
- [x] `2026-08-23T02:42:05.241Z` ✅ RESOLVED: блокер P5 снят — ENOBUFS в sdd-verify устранён maxBuffer (02f1b35f), линт освобождён

#### P6

- [x] `2026-08-23T01:17:48.854Z` decision manifest-overrides=sdd-v2/audit.directive.xml+sdd-v2/scaffold.directive.xml+sdd-v2/phase-execution-protocol.directive.xml→lazy ← DA-REQ-2 pilot rollout, defaultMode stays monolith so every other directive is unaffected
- [x] `2026-08-23T01:20:12.617Z` ver npx gennady sdd-verify --profile code ai/kit/assembly-manifest.json → pass exit=0 (4/4: format, lint, type-check, yagni)
- [x] `2026-08-23T01:20:18.609Z` ver npm run build:directives → pass exit=0 (53 directives regenerated; audit lazy: 3 step packages, scaffold lazy: 7 step packages, phase-execution-protocol lazy: 8 step packages — all three DA-REQ-2 pilots now assemble lazy via manifest override with no --assembly flag, every other directive stays monolith)
- [x] `2026-08-23T01:20:18.953Z` ver npm run check:directives-fresh → pass exit=0 (checked-in ai/directives/sdd-v2/\*\* matches a fresh rebuild — Exit criterion satisfied)
- [x] `2026-08-23T01:20:27.461Z` ver npm run check:directive-budgets → pass exit=0 (every lazy directive under ai/directives/sdd-v2/\*\* within budget)
- [x] `2026-08-23T01:20:27.812Z` discovery P3's open pilot-budget-overage item is stale, superseded by DA-DL-16 (PACKAGE_CHAR_LIMIT 8000→20000, already landed in ai/kit/step-budget-gate.ts during P5's fix-round): measured worst packages on this real lazy build are audit/STEP_2_SEMANTIC 11674 chars, scaffold/STEP_3_TASK_GENERATION 15131 chars, phase-execution-protocol/STEP_5_VERIFY 13513 chars — all comfortably under the 20000-char cap; check:directive-budgets confirms clean exit=0 against the real tree, no finding
- [x] `2026-08-23T01:20:34.136Z` discovery skeleton token measurement (countTokens, same estimator as StepBudgetGate) on this real lazy build vs prior monolith baseline: audit 2958 vs ~13070 (-77%), scaffold 4303 vs ~14981 (-71%), phase-execution-protocol 5915 vs ~15800 (-63%) — all three land under the 6000-token target (not just the 8000 ceiling); 18 step packages generated total (audit 3, scaffold 7, phase-execution-protocol 8), worst package scaffold/STEP_3_TASK_GENERATION at 15131 chars, 24% headroom under the 20000-char cap
- [x] `2026-08-23T01:20:59.436Z` DONE
      **Handoff →** artifacts: [ai/kit/assembly-manifest.json, ai/directives/sdd-v2/audit.directive.xml, ai/directives/sdd-v2/audit/steps/STEP_1_MECHANICAL.xml, ai/directives/sdd-v2/audit/steps/STEP_2_SEMANTIC.xml, ai/directives/sdd-v2/audit/steps/STEP_3_ROUTE.xml, ai/directives/sdd-v2/scaffold.directive.xml, ai/directives/sdd-v2/scaffold/steps/STEP_0B_PREFLIGHT.xml, ai/directives/sdd-v2/scaffold/steps/STEP_0_INTAKE.xml, ai/directives/sdd-v2/scaffold/steps/STEP_1_CASCADE.xml, ai/directives/sdd-v2/scaffold/steps/STEP_2_DAG.xml, ai/directives/sdd-v2/scaffold/steps/STEP_3_TASK_GENERATION.xml, ai/directives/sdd-v2/scaffold/steps/STEP_4_TEST_PLAN_REVIEW.xml, ai/directives/sdd-v2/scaffold/steps/STEP_5_FINALIZE.xml, ai/directives/sdd-v2/phase-execution-protocol.directive.xml, ai/directives/sdd-v2/phase-execution-protocol/steps/STEP_1_GET_PHASE_CONTEXT.xml, ai/directives/sdd-v2/phase-execution-protocol/steps/STEP_1B_RESUME_OR_START.xml, ai/directives/sdd-v2/phase-execution-protocol/steps/STEP_2_NARROW_RECON.xml, ai/directives/sdd-v2/phase-execution-protocol/steps/STEP_3_LOAD_RULES.xml, ai/directives/sdd-v2/phase-execution-protocol/steps/STEP_3B_TOOL_API.xml, ai/directives/sdd-v2/phase-execution-protocol/steps/STEP_4_EXECUTE.xml, ai/directives/sdd-v2/phase-execution-protocol/steps/STEP_5_VERIFY.xml, ai/directives/sdd-v2/phase-execution-protocol/steps/STEP_6_EMIT_HANDOFF.xml]; decisions: [manifest-overrides=sdd-v2/audit.directive.xml+sdd-v2/scaffold.directive.xml+sdd-v2/phase-execution-protocol.directive.xml→lazy, defaultMode-unchanged=monolith, packages-generated=18(audit-3+scaffold-7+phase-execution-protocol-8), skeleton-tokens=audit-2958+scaffold-4303+phase-execution-protocol-5915(all-under-6000-target), worst-package=scaffold/STEP_3_TASK_GENERATION-15131-chars(under-20000-cap), P3-pilot-budget-overage-open-item=resolved-stale-superseded-by-DA-DL-16]; open: [entity-inventory: prior groups from P1/P2 still pending spec Entity Inventory backflow at audit]; deviations: []
- [x] `2026-08-23T03:55:19.881Z` correction: phase-execution-protocol skeleton actually measures 6009 tokens (countTokens on the checked-in ai/directives/sdd-v2/phase-execution-protocol.directive.xml — git diff empty since e08460c3, file unchanged) — the 5915 recorded in this phase's discovery/Handoff lines above, and in commit e08460c3's message, is wrong; DA-REQ-6's <=6000-token target is NOT met for this pilot (the 8000-token hard ceiling IS met); target/ceiling now mechanically split as SKELETON_TOKEN_TARGET/SKELETON_TOKEN_LIMIT with the target reported as a build warning (DA-DL-18)

#### P7

- [x] `2026-08-23T01:39:03.142Z` discovery ticket §5 canonical gate's npm test leg surfaces 7 pre-existing failures across 3 test files none of which are any DA-lazy-asm phase's Target Files, all root-caused by P6's real lazy conversion of the pilots: (1) ai/kit/**tests**/delta-assembly.test.ts 'every generated directive file equals the plan-driven render (build is not stale)' fails on sdd-v2/audit.directive.xml — the checked-in file is now a lazy skeleton, not the plain delta-rendered monolith text the test still expects (fail-fast loop, so scaffold/phase-execution-protocol are never reached but share the same defect); (2) ai/kit/**tests**/readiness-preflight-gate.test.ts 'scaffold.directive.xml: embeds the shared readiness-preflight-gate partial' fails because that partial's text now lives inside one of scaffold's step packages, not in the skeleton; (3) cli/**tests**/directive-tool-contract/directive-tool-contract.test.ts, 5 cases — 'phase-execution-protocol.directive.xml yields at least 35 documented calls', 'audit.directive.xml yields at least 15 documented calls', and 3 'documented call still present verbatim' cases (sdd-check --all/--changed, lint --inventory-reverse) — all fail because the worked CLI examples they extract now live in step package files, absent from the skeleton alone. Confirmed this is a genuine, deterministic content gap (not a test bug on my side) via a controlled mutation: corrupting one real package's fingerprint line correctly failed this phase's own new version-parity case, proving the assertions fire on real drift. This phase's own new tests (skeleton-package-binding.guard/e2e.test.ts) all pass — DA-REQ-15's no-loss invariant holds on the real audit/scaffold/phase-execution-protocol pilots, no axiom or Step lost or duplicated. Not fixable from this phase's Target Files (ai/kit/**tests**/skeleton-package-binding.\*.test.ts only) — fixing requires editing the 3 files named above, none of which any DA-lazy-asm phase owns.
- [x] `2026-08-23T01:39:12.804Z` ver npx gennady sdd-verify --profile test ai/kit/**tests**/skeleton-package-binding.guard.test.ts ai/kit/**tests**/skeleton-package-binding.e2e.test.ts → fail exit=1 (format pass 9.2s, type-check pass 3.1s, test:coverage fail exit=1 — the sub-gate runs the FULL repo test suite and surfaces the 7 pre-existing out-of-zone failures logged above, not a defect in this phase's own 2 files)
- [x] `2026-08-23T01:39:13.065Z` ver npx gennady lint --spec=specs/ai-skills/directive-assembly/directive-assembly.spec.md ai/kit/**tests**/skeleton-package-binding.guard.test.ts ai/kit/**tests**/skeleton-package-binding.e2e.test.ts → pass exit=0 (no inventory or cast-safety findings — both files export nothing, import only the already-inventoried P1/P3 surface)
- [x] `2026-08-23T01:39:13.327Z` ver node --import tsx --test ai/kit/**tests**/skeleton-package-binding.\*.test.ts → pass exit=0 (4 tests: 3 pass + 1 skip, 0 fail — Exit criterion satisfied; DA-REQ-15 no-loss invariant verified on the real audit/scaffold/phase-execution-protocol pilots, not a fixture)
- [x] `2026-08-23T01:39:13.589Z` ver npm run type-check && npm test && npm run lint → fail exit=1 (type-check pass; npm test: 3518 tests, 3506 pass, 7 fail, 5 skipped incl. this phase's own new skip — chain stops before npm run lint ever runs; all 7 failures are the pre-existing out-of-zone gap logged above, none in this phase's Target Files)
- 🛑 `2026-08-23T01:39:37.110Z` BLOCKED: ticket §5 canonical gate 'npm run type-check && npm test && npm run lint' fails solely on npm test: 7 failures across 3 files outside every DA-lazy-asm phase's Target Files — ai/kit/**tests**/delta-assembly.test.ts (1), ai/kit/**tests**/readiness-preflight-gate.test.ts (1), cli/**tests**/directive-tool-contract/directive-tool-contract.test.ts (5) — all because they read a pilot's checked-in directive file at its normal ai/directives/sdd-v2 path expecting the full monolith text, but P6's real lazy conversion now writes only the slim skeleton there for audit/scaffold/phase-execution-protocol (step bodies now live under each directive's own steps/ subfolder). Not this phase's Target Files (the two new skeleton-package-binding test files only) and not any other DA-lazy-asm phase's Target Files either — this phase's own new tests pass clean and independently confirm DA-REQ-15's no-loss invariant holds on the real pilots, so the gap is squarely in these 3 pre-existing files never updated for lazy mode.
  - 🔗 axiom: AX_VERIFICATION_BEFORE_HANDOFF
  - 💬 unblock: Update the 3 out-of-zone test files to branch on resolveAssemblyMode from ai/kit/lazy-assembly.ts, per directive: (1) ai/kit/**tests**/delta-assembly.test.ts — for a directive resolved lazy, compare against the skeleton plus its step packages instead of the plain delta-render; (2) ai/kit/**tests**/readiness-preflight-gate.test.ts — search the skeleton concatenated with all its step packages, not the skeleton alone; (3) cli/**tests**/directive-tool-contract/directive-tool-contract.test.ts — read skeleton plus packages combined when extracting documented calls for the audit and phase-execution-protocol directives. Assign as a new ticket or a new phase on DA-lazy-asm since no current phase owns these files; re-run the full ticket §5 gate once landed.
- [x] `2026-08-23T02:01:58.619Z` discovery re-run confirms the P7 blocker is resolved: P10 updated the 3 out-of-zone files (ai/kit/**tests**/delta-assembly.test.ts, ai/kit/**tests**/readiness-preflight-gate.test.ts, cli/**tests**/directive-tool-contract/directive-tool-contract.test.ts) to branch on resolveAssemblyMode and read skeleton+packages combined; re-running this phase's own gates on its own Target Files (ai/kit/**tests**/skeleton-package-binding.guard.test.ts, ai/kit/**tests**/skeleton-package-binding.e2e.test.ts) plus the full ticket §5 gate confirms clean
- [x] `2026-08-23T02:02:09.678Z` ver npx gennady sdd-verify --profile test ai/kit/**tests**/skeleton-package-binding.guard.test.ts ai/kit/**tests**/skeleton-package-binding.e2e.test.ts → pass exit=0
- [x] `2026-08-23T02:02:10.009Z` ver npx gennady lint --spec=specs/ai-skills/directive-assembly/directive-assembly.spec.md ai/kit/**tests**/skeleton-package-binding.guard.test.ts ai/kit/**tests**/skeleton-package-binding.e2e.test.ts → pass exit=0
- [x] `2026-08-23T02:02:10.338Z` ver npm run type-check && npm test && npm run lint → pass exit=0 (3518 tests, 3513 pass, 0 fail, 5 skipped; the 7 prior out-of-zone failures now pass via P10's fix; lint:contracts clean)
- [x] `2026-08-23T02:02:10.665Z` ver node --import tsx --test ai/kit/**tests**/skeleton-package-binding.\*.test.ts → pass exit=0 (4 tests, 3 pass, 1 skip, 0 fail — Exit criterion satisfied)
- [x] `2026-08-23T02:02:14.036Z` DONE
      **Handoff →** artifacts: [ai/kit/__tests__/skeleton-package-binding.guard.test.ts, ai/kit/__tests__/skeleton-package-binding.e2e.test.ts]; decisions: [blocker-resolved-by=P10-updated-3-out-of-zone-test-files-to-branch-on-resolveAssemblyMode, test-count=4-3-pass-1-skip-e2e-deferred-DA-DL-15, no-loss-invariant-verified=DA-REQ-15-on-real-audit-scaffold-phase-execution-protocol-pilots, full-ticket-gate-green=npm-type-check-test-lint-pass-exit0-3518-tests-3513-pass-0-fail-5-skipped]; open: [entity-inventory: prior groups from P1/P2 still pending spec Entity Inventory backflow at audit]; deviations: []
- [x] `2026-08-23T02:42:05.527Z` ✅ RESOLVED: блокер P7 снят — потребители lazy-директив починены фазой P10, полный npm test зелёный

#### P10

- [x] `2026-08-23T01:51:06.995Z` discovery joining phase-execution-protocol's lazy skeleton text with its 8 step-package texts via a single '\n'-joined string, then running extractDocumentedCalls once over the join, silently drops calls: 42 documented calls found when the same extractor runs per-fragment (skeleton alone plus each package alone) and results are merged, vs only 29 when run once over the concatenation — root cause is extractDocumentedCalls' backtick-pairing regex ([^`]+ between backticks): a fenced code block can leave one backtick in a file unpaired within that file's own scan (harmless there — extractDocumentedCalls simply skips it), but concatenating raw text lets that unpaired backtick re-pair with the next file's own backtick, swallowing real content between them into one bogus cross-file span; not a defect in lazy-assembly.ts's no-loss invariant (DA-REQ-15, already guarded by skeleton-package-binding.e2e.test.ts) — purely an artifact of naive text-join before regex extraction
- [x] `2026-08-23T01:56:55.474Z` ver npx gennady sdd-verify --profile test ai/kit/**tests**/delta-assembly.test.ts ai/kit/**tests**/readiness-preflight-gate.test.ts cli/**tests**/directive-tool-contract/directive-tool-contract.test.ts → pass exit=0 (format/type-check/test:coverage all 3/3 pass)
- [x] `2026-08-23T01:56:59.952Z` ver npx gennady lint --spec=specs/ai-skills/directive-assembly/directive-assembly.spec.md ai/kit/**tests**/delta-assembly.test.ts ai/kit/**tests**/readiness-preflight-gate.test.ts cli/**tests**/directive-tool-contract/directive-tool-contract.test.ts → pass exit=0 (no inventory or cast-safety findings — all three files export nothing new)
- [x] `2026-08-23T01:57:04.142Z` ver npm run type-check && npm test && npm run lint → pass exit=0 (3518 tests, 3511 pass, 0 fail, 7 skipped incl. pre-existing DEFERRED_DECISION/e2e skips; lint:contracts clean)
- [x] `2026-08-23T01:57:24.659Z` discovery ticket §5 Task-specific Completion addition 'npm run build:directives -- --assembly=lazy' is not scoped to the three DA-REQ-2 pilots as its own description implies: resolveAssemblyMode's priority (override beats flag beats manifest defaultMode beats built-in monolith) means the flag applies to every directive without an explicit override, not just the pilots — running it for real crashed on sdd-v2/agent-inbox/code-lens.directive.xml (zero Step blocks, lazy mode requires at least one) and would hit the same wall on any other Step-less directive; this command's Required-by does not overlap this phase's Rules (node-test, testing-common) so it is not this phase's canonical gate, and the fix in build-directives.ts or lazy-assembly.ts (both outside this phase's Target Files) belongs to whichever phase owns those files, not fixed here; the run also left about 25 stray untracked per-directive steps folders on disk for non-pilot directives, cleaned up via git clean before this phase's own canonical gate re-ran, so the working tree now matches P6 and P7's actual output (only audit, scaffold, phase-execution-protocol keep step folders)
- [x] `2026-08-23T01:57:47.240Z` DONE
      **Handoff →** artifacts: [ai/kit/__tests__/delta-assembly.test.ts, ai/kit/__tests__/readiness-preflight-gate.test.ts, cli/__tests__/directive-tool-contract/directive-tool-contract.test.ts, specs/ai-skills/directive-assembly/directive-assembly.task.DA-lazy-asm.md]; decisions: [all-three-files-branch-on-resolveAssemblyMode-per-directive-manifest-key, delta-assembly-test-compares-LazyDirectiveAssembler.assemble-output-against-on-disk-skeleton-plus-each-package-file-not-raw-text-diff, readiness-preflight-gate-test-concatenates-skeleton-plus-package-texts-with-newline-substring-search-only, directive-tool-contract-test-extracts-calls-per-fragment-then-merges-never-joins-raw-text-before-regex, root-cause-backtick-fence-pairing-bug-found-and-avoided-not-worked-around]; open: [build-directives-global-lazy-flag-crashes-on-step-less-directives: npm run build:directives -- --assembly=lazy applies to every directive without a manifest override per DA-REQ-1 priority, not just the 3 pilots, and throws on any Step-less directive e.g. sdd-v2/agent-inbox/code-lens.directive.xml — fix belongs in build-directives.ts or lazy-assembly.ts, outside this phase's Target Files; entity-inventory: prior groups from P1/P2 still pending spec Entity Inventory backflow at audit]; deviations: []

#### Round close

- [x] `2026-08-23T02:03:07.355Z` DONE

#### P3 — re-run: fix F-03 (code-review), F-02 (audit)

- [x] `2026-08-23T02:29:42.265Z` ver node --import tsx --test ai/kit/**tests**/build-directives.test.ts → pass exit=0 (5 pass, 0 fail — both F-02 and F-03 repros now green after the fix)
- [x] `2026-08-23T02:30:46.856Z` decision DA-lazy-asm-D-9 ← code-review F-03 closed by reordering writeLazyDirective: every step package is written and confirmed present on disk BEFORE the skeleton (which prints all their paths) is written, never after — a mid-loop interruption can now only leave the skeleton unwritten (safe), never dangling on a package that never landed
- [x] `2026-08-23T02:30:52.807Z` decision DA-lazy-asm-D-8 ← audit F-02 closed via eligibility gate in build-directives.ts: flag/defaultMode-driven lazy resolution skips a directive with zero Step blocks (stays monolith, named in skip summary); an explicit per-directive manifest override to lazy stays ungated and still fails loudly via LazyDirectiveAssembler.assemble per DA-REQ-3
- [x] `2026-08-23T02:31:46.488Z` discovery sdd-verify --profile code ai/kit/build-directives.ts's yagni sub-check (whole-repo usage-count scan) surfaces 1 finding on ai/kit/lazy-assembly.ts:1:1 (validateOverrides, less than 2 usages) — git status confirms lazy-assembly.ts is an active uncommitted edit by the concurrent P1 worker, not this phase's Target File or Objective; format/lint/type-check sub-checks of the same run passed clean
- [x] `2026-08-23T02:32:42.887Z` ver npx gennady lint --spec=specs/ai-skills/directive-assembly/directive-assembly.spec.md ai/kit/build-directives.ts → fail exit=1 (2 FileHeaderCheck findings, ERR_CLI_LINT_MISSING_FILE + ERR_CLI_LINT_MISSING_CONSUMERS — same pre-existing header-convention gap already logged this phase's prior round, exempt per AX_FILE_HEADER_APPEND_ONLY existing-file-without-header carve-out; zero region-comment-density, inventory, or cast-safety findings — trimmed both new #region comments after the first lint pass flagged them over the 3-comment-line max)
- [x] `2026-08-23T02:33:49.511Z` ver npm run type-check && npm test && npm run lint → pass exit=0 (3529 tests, 3524 pass, 0 fail, 5 skipped incl. this phase's new 5 build-directives.test.ts cases; lint:contracts clean)
- [x] `2026-08-23T02:36:17.137Z` discovery npm run audit:sdd-templates exits 1 at its audit:contracts step: 2 contract-activation violations on the real, already-lazy-committed sdd-v2/phase-execution-protocol.directive.xml — BLOCKER_FORMAT (bare-mentioned at skeleton line 205, AX_BLOCKER_ESCALATION body) and HANDOFF_FORMAT (bare-mentioned at skeleton line 282, ContextExpectation table) are each defined only inside its STEP_6_EMIT_HANDOFF step package now, not in the skeleton file audit-contract-activation.mjs actually reads; this is the same class of gap P7 found and P10 fixed for 3 other consumers (delta-assembly.test.ts, readiness-preflight-gate.test.ts, directive-tool-contract.test.ts) that read a lazy directive's checked-in path expecting full text — audit-contract-activation.mjs is a 4th such consumer nobody updated yet; pre-existing since P6's real lazy conversion landed, not caused by this phase's F-02/F-03 fixes (confirmed: neither fix touches phase-execution-protocol's content, skeleton/package split, or axiom-activation classification) and not in this phase's Target Files (ai/kit/audit-contract-activation.mjs, not build-directives.ts) or Exit criterion (which names build:directives / build:directives --assembly=lazy / a missing-package fixture / an over-budget fixture, not audit:sdd-templates); flagged in this phase's Handoff open field for whoever owns that script next
- [x] `2026-08-23T02:37:11.248Z` DONE
      **Handoff →** artifacts: [ai/kit/build-directives.ts, ai/kit/__tests__/build-directives.test.ts, specs/ai-skills/directive-assembly/directive-assembly.task.DA-lazy-asm.md]; decisions: [F-02-fix=eligibility-gate-in-build-directives.ts-skips-Step-less-directive-for-flag-or-defaultMode-driven-lazy-explicit-per-directive-override-stays-ungated-and-still-fails-loudly-per-DA-REQ-3-see-DA-lazy-asm-D-8, F-03-fix=writeLazyDirective-now-writes-and-confirms-every-package-BEFORE-the-skeleton-never-after-see-DA-lazy-asm-D-9, repro-first=4-of-5-new-subtests-failed-on-unfixed-code-confirming-both-defects-then-passed-after-the-fix, test-count=5-all-pass, full-ticket-gate-green=npm-type-check-test-lint-pass-exit0-3529-tests-3524-pass-0-fail-5-skipped, regression-free=npm-run-build-directives-plus-check-directives-fresh-both-pass-monolith-path-untouched]; open: [audit-contract-activation-lazy-gap: npm run audit:sdd-templates fails on the already-committed phase-execution-protocol.directive.xml because ai/kit/audit-contract-activation.mjs does not know a lazy directive's bare-mentioned contract may live in a step package rather than the skeleton it reads directly - pre-existing since P6, not caused by this fix, spawned as a separate background task; entity-inventory: prior P1/P2 intro log groups still pending spec Entity Inventory backflow at audit; module-usage-example-drift: spec Module Usage Example shows router.directive.xml staying monolith under --assembly=lazy which does not match this fix's chosen eligibility-gate semantics for Step-having directives - task instructions route this as a separate spec edit, not this fix]; deviations: [DA-lazy-asm-D-8: flag/defaultMode-driven lazy gated by Step-eligibility, explicit override stays ungated, DA-lazy-asm-D-9: packages written and confirmed before skeleton, temp-plus-rename considered and rejected]
- [x] `2026-08-23T02:42:04.881Z` ✅ RESOLVED: блокер P3 снят — незакоммиченные правки CLI завершены и закоммичены (6f061514), гейты зелёные
- [x] `2026-08-23T02:42:27.176Z` ✅ RESOLVED: блокер снят — правки CLI закоммичены (6f061514)

#### P1 — re-run: fix F-01, F-02, F-05 (code-review) + F-04 (tests)

- [x] `2026-08-23T02:28:13.843Z` intro validateOverrides, maskCodeSpans ← code-review fix helpers (F-02 override validation, F-05 backtick-span masking); no new exports, both module-private
- [x] `2026-08-23T02:28:28.756Z` discovery F-01 repro traced: when the nearest open tag from cursor is self-closing and precedes the nearest close, extractTopLevelTagBlocks treated that close as the ancestor's real close without searching further, silently truncating the ancestor and orphaning its true close tag in the remaining text (violates DA-REQ-15 no-loss) — added a failing-first test (selfclose-before-nested fixture) that reproduced the leak on pre-fix code
- [x] `2026-08-23T02:28:29.017Z` fix F-01 ← extractTopLevelTagBlocks now skips past every self-closing open between cursor and the nearest close before deciding nesting, repeating until a non-self-closing open or the close itself is found; verified against 3 fixtures (self-close before nested, after nested, several self-closes intermixed with one nested) plus the pre-existing unbalanced-tag path
- [x] `2026-08-23T02:28:29.316Z` fix F-02 ← readAssemblyManifest now runs every overrides value through validateOverrides (throws a configuration error naming the manifest, key, and value on anything outside 'monolith'|'lazy') before returning; a wrong-case override like 'LAZY' previously survived the ?? chain as a truthy string and silently degraded to monolith downstream
- [x] `2026-08-23T02:28:29.586Z` decision DA-lazy-asm-D-7 2026-08-23 — ported maskCodeSpans from ai/inspector/core/parse-directive.ts into lazy-assembly.ts's extractTopLevelTagBlocks rather than documenting the limitation (почему: this exact backtick-pairing failure class already hit the codebase twice, most recently this task's own P10 phase, and the port is a ~10-line, zero-risk defensive measure with an existing precedent; отвергнуто: document-only — leaves a known, cheaply-preventable no-loss violation (DA-REQ-15) latent for the next directive author who quotes a pseudo-tag as a syntax example)
- [x] `2026-08-23T02:30:17.193Z` discovery Decision Log section (pre-existing, not introduced by this phase) carries a garbled duplicate tail after DA-lazy-asm-D-6 -- a truncated repeat of D-6's own closing clause plus a second stray section-close marker and AUDIT_ROUNDS comment pair, consistent with a concurrent-write race on this shared ticket file (P3's own fix re-run header landed in EXECUTION_LOG around the same window); not touched here -- my own D-7 entry was anchored on the unique D-6 prefix before the FIRST closing marker to avoid clobbering whichever concurrent session produced the duplicate; flagged for the orchestrator and audit to de-duplicate
- [x] `2026-08-23T02:31:30.175Z` yagni validateOverrides ← decomposed out of readAssemblyManifest so the F-02 override-validation invariant (each overrides value narrowed to the AssemblyMode union, explicit throw otherwise) is an independently readable/testable unit; single call site is an intent boundary per AX_PRINCIPLED_DECOMPOSITION, same rationale D-6 already applied to readAssemblyManifest itself, not premature abstraction; spec-side Usage Waiver backflow deferred to audit per AX_SPEC_NEVER_EDITED
- [x] `2026-08-23T02:35:48.197Z` ver npx gennady sdd-verify --profile code ai/kit/lazy-assembly.ts ai/kit/**tests**/lazy-assembly.test.ts -> fail exit=1 (format/lint/type-check pass; sole finding is validateOverrides yagni-underused, already waived above)
- [x] `2026-08-23T02:35:48.462Z` ver npx gennady lint --spec=specs/ai-skills/directive-assembly/directive-assembly.spec.md ai/kit/lazy-assembly.ts ai/kit/**tests**/lazy-assembly.test.ts -> fail exit=1 (13 pre-existing ERR_CLI_LINT_INVENTORY_UNDECLARED findings, identical to the set already logged as intro lines by this phase's original run, none new; word-count findings introduced by this fix's own JSDoc were trimmed to zero; test file has zero findings)
- [x] `2026-08-23T02:35:48.726Z` ver node --import tsx --test ai/kit/**tests**/lazy-assembly.test.ts -> pass exit=0 (29 pass, 0 fail -- 6 new F-01/F-02/F-05/F-04 cases plus the 23 pre-existing ones)
- [x] `2026-08-23T02:35:48.989Z` ver npm run type-check && npm test && npm run lint -> pass exit=0 (3529 tests, 3524 pass, 0 fail, 5 skipped; lint:contracts clean)
- [x] `2026-08-23T02:36:14.144Z` DONE
      **Handoff →** artifacts: [ai/kit/lazy-assembly.ts, ai/kit/__tests__/lazy-assembly.test.ts, specs/ai-skills/directive-assembly/directive-assembly.task.DA-lazy-asm.md]; decisions: [F-01-fix=extractTopLevelTagBlocks-skips-selfclosing-opens-before-deciding-nesting, F-02-fix=validateOverrides-throws-on-any-overrides-value-outside-monolith-or-lazy, F-05-fix=maskCodeSpans-ported-from-parse-directive.ts-masks-backtick-spans-before-tag-boundary-scan, F-04-coverage=5-new-cases-selfclose-before-nested+after-nested+multiple-selfclose+unbalanced-path+overrides-validation, test-count=29-all-pass, DA-lazy-asm-D-7=ported-maskCodeSpans-not-documented-limitation]; open: [decision-log-corruption: pre-existing garbled duplicate tail in Decision Log section after D-6, not introduced by this phase, flagged via discovery line for orchestrator/audit de-dup; entity-inventory: prior groups from original P1 run still pending spec Entity Inventory backflow at audit; yagni-waiver: validateOverrides single-call-site waiver pending spec backflow at audit]; deviations: [DA-lazy-asm-D-7: ported maskCodeSpans backtick-masking defense (F-05) into extractTopLevelTagBlocks rather than documenting the limitation]
- [x] `2026-08-23T02:38:32.084Z` discovery de-duplicated the Decision Log's trailing garbled fragment (pre-existing, not caused by this phase) after landing DA-lazy-asm-D-7 -- removed a stray duplicate section-close-plus-AUDIT_ROUNDS-comment pair and the truncated repeat of D-6's closing clause that sat below it; sdd-check --task now reports 0 SDD_ANCHOR_UNBALANCED, down from 1. Two remaining sdd-check findings are pre-existing and out of this phase's write zone: SDD_DONE_WITH_ACTIVE_BLOCKER and SDD_DONE_WITH_PLACEHOLDERS both trace to Round 1's never-executed scaffold skeleton (the P1 through P9 blocks still carrying the raw unfilled scaffold placeholder tokens for timestamp, command, pass-or-fail, and exit code) plus the ticket-level Status field set to DONE before this code-review fix cycle began; fixing either requires touching other phases' Round 1 blocks or the Meta Status field, both outside AX_TICKET_WRITE_SCOPE for a phase worker; flagged for the orchestrator and audit
- [x] `2026-08-23T02:41:26.009Z` env-fix атрибуция лога ← BLOCKED выше принадлежит фазе P2, а не P1: он осел сюда из-за гонки sdd-log до фикса --phase (коммит 6f061514). Блокер разрешён: см. блок P2 (DONE 00:38:13Z) и коммит 2a7b306f (self-hosting sdd-verify). Историю не переписываем, помечаем.
- [x] `2026-08-23T03:02:47.240Z` ✅ RESOLVED: чужие незакоммиченные правки CLI завершены и закоммичены (6f061514), гейты фазы зелёные
- [x] `2026-08-23T03:02:47.504Z` ✅ RESOLVED: ENOBUFS в sdd-verify устранён maxBuffer, self-hosting резолв починен (2a7b306f, 02f1b35f)

#### P10 — re-run: fix F-audit-lazy-blind

- [x] `2026-08-23T02:46:47.596Z` discovery F-audit-lazy-blind confirmed: audit-contract-activation.mjs PART 2 (mentioned -> available) read each scanned \*.directive.xml's on-disk file directly, which is only the slim skeleton for a lazy pilot (audit/scaffold/phase-execution-protocol) - a bare Contract id mentioned in one step package but defined in another (or in the skeleton) read as an unresolved orphan; same gap also present one level removed in idsDefinedAt, the READ_AND_USE_DIRECTIVE target-id resolver - reconcile.directive.xml's READ_AND_USE_DIRECTIVE("ai/directives/sdd-v2/audit.directive.xml") points at a lazy pilot whose Contract ids can live only in its step packages, invisible to a single readFileSync on the skeleton
- [x] `2026-08-23T02:46:55.099Z` fix F-audit-lazy-blind <- added readAssembledFragments(absPath) to audit-contract-activation.mjs: reads the skeleton, and when resolveAssemblyMode(manifestKeyFor(absPath)) is lazy, every step package the skeleton's own step-list names (Full step text: `path`); auditAssembledFile and idsDefinedAt now union availability (included/inherited/lazy-loaded) across all fragments and check mention positions PER FRAGMENT (never joined into one string before regex, per the backtick-pairing lesson from F-05/directive-tool-contract.test.ts) - a violation still fires if any single fragment leaves the mention unresolved
- [x] `2026-08-23T02:47:02.371Z` discovery audit-axiom-activation.mjs verified NOT affected by this class of bug: it scans templates/sdd-v2/_.hbs (pre-render Handlebars source) and checks ExecutionPlan/PhaseProcedure text inside that same pre-render source - it never reads an assembled ai/directives/\*\*/_.directive.xml file, so the lazy skeleton+package split (which happens later, in build-directives.ts pass 2) never enters its scan surface; no fix applied there, confirmed by reading the script end to end rather than assumed
- [x] `2026-08-23T02:47:10.481Z` verified regression: temporarily reinserted a real orphan (bare SCOPE_TASKS_INDEX_STRUCTURE mention with no allowlist entry, no local definition, no READ_AND_USE_DIRECTIVE path) into phase-execution-protocol's STEP_2_NARROW_RECON.xml step package, ran npm run audit:contracts - failed exit=1 naming ai/directives/sdd-v2/phase-execution-protocol.directive.xml and the id, confirming the fix still catches a genuine sirota rather than going green by widening the allowlist; reverted (git diff empty after revert), re-ran clean
- [x] `2026-08-23T02:47:22.172Z` ver npm run audit:sdd-templates -> pass exit=0 (check:directives-fresh + audit:axioms + audit:contracts + check:directive-budgets all clean, including the 30 assembled directives contract-activation part2 scan)
- [x] `2026-08-23T02:47:26.931Z` ver npx gennady lint --spec=specs/ai-skills/directive-assembly/directive-assembly.spec.md ai/kit/audit-contract-activation.mjs -> pass exit=0
- [x] `2026-08-23T02:48:28.518Z` ver npm run type-check && npm test && npm run lint -> pass exit=0 (3529 tests, 3524 pass, 0 fail, 5 skipped; lint:contracts clean)
- [x] `2026-08-23T02:48:33.358Z` DONE
    **Handoff →** artifacts: [ai/kit/audit-contract-activation.mjs]; decisions: [fix=readAssembledFragments-reads-skeleton-plus-every-step-package-the-skeleton-step-list-names-when-resolveAssemblyMode-is-lazy, availability-scope=unioned-across-all-fragments-of-one-directive-not-per-step, mention-check=per-fragment-never-joined-per-backtick-lesson, idsDefinedAt-also-fixed=READ_AND_USE_DIRECTIVE-target-chain-reconcile-to-audit-directive-is-itself-a-lazy-pilot, audit-axiom-activation-verified-unaffected=scans-pre-render-hbs-templates-never-assembled-directives-no-fix-applied, regression-verified=real-orphan-reinserted-and-caught-then-reverted, full-ticket-gate-green=npm-type-check-test-lint-pass-exit0-3529-tests-3524-pass-0-fail-5-skipped, audit-sdd-templates-green=check-directives-fresh-audit-axioms-audit-contracts-check-directive-budgets-all-pass]; open: []; deviations: []
<!--/SECTION:EXECUTION_LOG-->

<!--SECTION:DECISION_LOG-->

## Decision Log

- DA-lazy-asm-D-1 · один тикет на весь модуль, 9 фаз, без разбиения на несколько тикетов (почему:
  `AX_DAG_AND_TICKET_BOUNDARIES` — модуль-спека — единица по умолчанию; ни один Deps-путь не
  параллелится между разными исполнителями настолько, чтобы оправдать несколько тикетов, ни один
  из фаз не переполняет контекст одного саб-агента; ↳ отвергнуто: тикет на файл — чистый
  overhead без выигрыша, фазы всё равно исполняются последовательно)
- DA-lazy-asm-D-2 · `check-command` в Verification составлен напрямую из `package.json`
  (`type-check && test && lint`), а не резолвлен из `infra-base` (почему: `infra-base.spec.md` —
  намеренно минимальная спека без секции `## Verification Commands`; блокировать этот тикет из-за
  пробела в спеке зависимости противоречит принципу `AX_PREFLIGHT_BLAST_RADIUS_SCOPED`; ↳
  отвергнуто: остановить скаффолдинг до правки `infra-base` — вне blast radius этой задачи)
- DA-lazy-asm-D-3 · добавлен отдельный `npm run check:directive-budgets`, а не только встроенная
  проверка внутри `build:directives` (почему: спека сама называет его опцией в Module Contracts;
  даёт прямой, самостоятельно вызываемый гейт для CI/pre-commit рядом с `audit:axioms`/
  `audit:contracts`; ↳ отвергнуто: только встроенный провал `build:directives` — не даёт отдельной
  именованной точки входа для pre-commit)
- DA-lazy-asm-D-4 · DA-REQ-16 (переоценка кандидатства) реализован как чистая функция
  `isLazyCandidate` + юнит-тест, а не как процессная заметка без кода (почему: порог полностью
  механический (токены `BeliefState`, доля одношаговых аксиом) — тестируемый код честнее и
  надёжнее декларативного «оператор должен помнить»; ↳ отвергнуто: только текст в AUTHORING.md без
  функции — не проверяется механически)
- DA-lazy-asm-D-5 · 2026-08-23 — `LazyDirectiveAssembler.assemble` классифицирует id блоков
  `<Contract>` из `OutputContracts` тем же `AxiomActivationClassifier.classify`, что и id блоков
  `<Axiom>`, без отдельного классификатора контрактов (почему: DA-REQ-4 явно относит «форматы/
  контракты» шага к его пакету, а Objective фазы P1 называет только один классификатор —
  механизм детекции («id встречается в теле Step») одинаков для обоих типов id, второй класс с
  идентичной логикой был бы чистым дублированием; отвергнуто: отдельный
  `ContractActivationClassifier` — тождественная реализация без дифференцирующего поведения;
  риск: контракт с 0 активаций получает то же безопасное `cross-cutting`-поведение и YAGNI-лог,
  что и аксиома — не проверено на реальном пилоте в этой фазе)
- DA-lazy-asm-D-6 · 2026-08-23 — `resolveAssemblyMode` сам читает и парсит
  `ai/kit/assembly-manifest.json` (fallback на `monolith` при отсутствии файла, explicit throw при
  невалидном JSON), а не принимает уже распарсенный `AssemblyManifest` от вызывающего кода (почему:
  Exit-критерий фазы называет экспортом только `resolveAssemblyMode` — Objective описывает
  `AssemblyManifest` как «чтение/приоритет режима» одним блоком ответственности, а не два отдельных
  экспорта; каждый BDD-сценарий feature «Assembly mode resolution» описывает ровно эту функцию как
  тестируемую единицу; отвергнуто: отдельный экспортируемый loader — не назван в Exit, лишняя
  поверхность API вопреки `AX_EXACT_SCOPE`)
- DA-lazy-asm-D-7 · 2026-08-23 — code-review находка F-05 (сканер `extractTopLevelTagBlocks` не
  маскирует backtick-примеры) закрыта портированием `maskCodeSpans` из
  `ai/inspector/core/parse-directive.ts`, а не текстовой оговоркой об ограничении (почему: этот же
  класс дефекта — рассинхрон парсинга тегов из-за непарных/цитируемых бэктиков — уже дважды бил по
  этой кодовой базе, последний раз в фазе P10 этой же задачи; порт — ~10 строк без риска, с готовым
  прецедентом; отвергнуто: только документирование ограничения — оставляет дёшево устранимое
  нарушение DA-REQ-15 (без потерь) живым для первого автора директивы, который процитирует
  псевдо-тег как пример синтаксиса)
- DA-lazy-asm-D-8 · 2026-08-23 — audit находка F-02 (скоуп `--assembly=lazy`) закрыта
  eligibility-гейтом в `build-directives.ts`: флаг и `defaultMode` манифеста (оба — блэнкет-дефолты
  на весь набор шаблонов) назначают `lazy` только директиве с хотя бы одним `<Step>`; директива без
  `<Step>` при этом остаётся `monolith` и попадает в сводку пропущенных в конце сборки, а явный
  per-directive override `lazy` в манифесте на такую же директиву гейтом не трогается — доходит до
  собственной проверки `LazyDirectiveAssembler.assemble` и проваливает сборку по имени директивы,
  как и требует DA-REQ-3 (почему: Exit-критерий этой же фазы прямо требует, чтобы
  `build:directives -- --assembly=lazy` прошёл сборку всего текущего набора шаблонов без throw —
  воспроизведено на `sdd-v2/agent-inbox/code-lens.directive.xml`, у которой нет override и нет
  Step; override — осознанный сигнал оператора про одну конкретную директиву, а не блэнкет-дефолт,
  и должен продолжать падать громко; отвергнуто: сделать флаг вообще не глобальным — противоречит
  DA-REQ-1, который спека фиксирует буквально текстом приоритета override→флаг→defaultMode→
  monolith, и правка самой спеки вне блэст-радиуса этой fix-фазы; риск: расхождение с Module Usage
  Example спеки (`router.directive.xml` показан `monolith` в том же вызове `--assembly=lazy`) не
  устранено этой правкой — идёт отдельной правкой спеки, не блокирует эту фазу)
- DA-lazy-asm-D-9 · 2026-08-23 — code-review находка F-03 (порядок записи skeleton/packages)
закрыта переменой порядка в `writeLazyDirective`: все пакеты шага пишутся и подтверждаются на
диске первыми, скелет — последним и только если все пакеты подтверждены (было: скелет первым,
затем цикл пакетов) (почему: скелет — единственный артефакт, который печатает пути ко всем
пакетам и тем самым обещает их существование (DA-REQ-12); прерывание процесса между записью
скелета и концом цикла пакетов оставляло на диске скелет с висящими путями — существующая
проверка `existsSync` сразу после `writeFileSync` от этого не защищает, синхронная запись и так
гарантирует наличие файла или бросает исключение; при новом порядке худший случай прерывания —
скелет просто не записан (безопасно: нет скелета — нет обещанных путей); отвергнуто: временные
файлы с переименованием в конце — тот же результат корректности, но вдвое больше файловых
операций и кросс-платформенные вопросы атомарности rename без выигрыша сверх простой перестановки
порядка; риск: не покрывает случай прерывания ПОСЛЕ переименования, но до этой правки такого
случая не было вовсе — не новый риск, а сохранение прежнего покрытия)
<!--/SECTION:DECISION_LOG-->

<!-- AUDIT_ROUNDS appended only after the first reopen-triggering audit (per the audit directive). -->

<!-- AUDIT_ROUNDS appended only after the first reopen-triggering audit (per the audit directive). -->
