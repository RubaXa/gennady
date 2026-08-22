# Task: DA-lazy-asm — Lazy directive assembly: skeleton + step packages

<!--SECTION:META-->

## Meta

- **Task-ID:** DA-lazy-asm
- **Status:** [ ] TODO
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
  - Constraints: [Module Decision Log DA-DL-1..15](./directive-assembly.spec.md#module-decision-log)
  - Constraints: [Module BDD Scenarios](./directive-assembly.spec.md#bdd-scenarios)
- **Runtime Backing:** `not-implemented`
- **Verification Levels:** `contract`, `unit`, `integration`
- **Deferred Runtime Scope:** `sdd-step` (scope `cli`) — DEFERRED_DECISION (DA-DL-15); `ai/kit/__tests__/skeleton-package-binding.e2e.test.ts` stays `skip` in this task
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## Phases Overview

| ID  | Kind   | Deps       | Status |
| --- | ------ | ---------- | ------ |
| P1  | impl   | —          | [ ]    |
| P2  | impl   | —          | [ ]    |
| P3  | impl   | P1, P2     | [ ]    |
| P4  | test   | P1         | [ ]    |
| P5  | test   | P2         | [ ]    |
| P6  | config | P3         | [ ]    |
| P7  | test   | P1, P3, P6 | [ ]    |
| P8  | config | P2         | [ ]    |
| P9  | doc    | P1         | [ ]    |

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
(using `shared/common/tokens.ts#countTokens`) and every package ≤8000 chars with every line
≤2000 chars; returns one finding per exceeded budget naming the artifact, the limit, and the
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

**Scenario:** an axiom mentioned in zero Steps stays cross-cutting and is flagged [`unit`] `[DA-REQ-9]`

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

**Scenario:** a within-budget skeleton and packages produce no findings [`unit`] `[DA-REQ-6]`

- **Given** a skeleton under 8000 tokens and packages each under 8000 chars with every line under
  2000 chars
- **When** `StepBudgetGate.check` runs
- **Then** it returns an empty finding list

**Scenario:** a skeleton over the hard token cap fails with the overage named [`unit`] `[DA-REQ-6]` `[DA-REQ-14]`

- **Given** a skeleton measuring over 8000 tokens
- **When** `check` runs
- **Then** it returns a finding naming the directive, the 8000-token limit, and the measured
  overage

**Scenario:** a package over the character cap fails with the overage named [`unit`] `[DA-REQ-6]` `[DA-REQ-14]`

- **Given** a package measuring over 8000 characters
- **When** `check` runs
- **Then** it returns a finding naming the directive, the step, the 8000-char limit, and the
  measured overage

**Scenario:** a package line over the line-length cap fails with the overage named [`unit`] `[DA-REQ-6]` `[DA-REQ-14]`

- **Given** a package containing one line over 2000 characters
- **When** `check` runs
- **Then** it returns a finding naming the directive, the step, the 2000-char line limit, and the
  measured overage

**Scenario:** the CI gate fails the build when any budget is exceeded [`integration`] `[DA-REQ-14]`

- **Given** a lazy build producing a package over 8000 characters
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
- Scenario a package over the character cap fails with the overage named → `ai/kit/__tests__/step-budget-gate.test.ts` :: `finds a step package exceeding 8000 characters and names the directive, the step, and the overage`
- Scenario a package line over the line-length cap fails with the overage named → `ai/kit/__tests__/step-budget-gate.test.ts` :: `finds a package line exceeding 2000 characters and names the directive, the step, and the overage`
- Scenario the CI gate fails the build when any budget is exceeded → `ai/kit/__tests__/step-budget-gate.test.ts` :: `exits 1 and prints every violation when a generated directive exceeds a budget`
- Scenario every path a pilot skeleton prints exists on disk after a real build → `ai/kit/__tests__/skeleton-package-binding.guard.test.ts` :: `every path a pilot skeleton prints exists on disk after a real build`
- Scenario a pilot's monolith and lazy builds carry the same version everywhere → `ai/kit/__tests__/skeleton-package-binding.guard.test.ts` :: `each pilot directive's skeleton header version matches every package first line`
- Scenario lazy and monolith renders of a pilot are equivalent modulo housekeeping lines → `ai/kit/__tests__/skeleton-package-binding.guard.test.ts` :: `each pilot directive's monolith and lazy renders are equivalent modulo step-list housekeeping and package version headers`
- Scenario a directive over the token threshold is a lazy candidate → `ai/kit/__tests__/lazy-assembly.test.ts` :: `flags a directive as a lazy candidate when its BeliefState exceeds 6000 tokens`
- Scenario a directive over the single-step-ratio threshold is a lazy candidate → `ai/kit/__tests__/lazy-assembly.test.ts` :: `flags a directive as a lazy candidate when more than 50% of its axioms are single-step`
- Scenario a directive under both thresholds is not a candidate → `ai/kit/__tests__/lazy-assembly.test.ts` :: `does not flag a directive below both thresholds`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## Execution Log

_(Round = one execute-then-audit attempt; per-phase blocks within a Round. Skeleton is minimal — event lines appear only when the event happens. Token vocabulary lives in `directive-assembly.3-tasks.md`. A `[x]` line with an unreplaced `<…>` placeholder is a fabricated DONE — forbidden.)_

### Round 1 — 2026-08-23, initial

#### P1

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P3

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P4

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P5

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P6

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P7

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P8

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P9

- [ ] `<ts>` ver `<cmd>` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE
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
<!--/SECTION:DECISION_LOG-->

<!-- AUDIT_ROUNDS appended only after the first reopen-triggering audit (per the audit directive). -->
