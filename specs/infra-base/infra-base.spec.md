# infra-base: Infrastructure Specification

<!--SECTION:SPEC_ID-->

INFRA-BASE

<!--/SECTION:SPEC_ID-->

## scope-type

infrastructure

## 1. Vision

Минимальный TS-стек: Node.js 22+, npm, tsc, prettier, node:test, vite. Zero-config formatter, детерминированная установка, быстрая сборка в чанки.

## 2. Tool Stack (minimal bootstrap)

| Category           | Tool                                                                       |
| ------------------ | -------------------------------------------------------------------------- |
| vcs                | git                                                                        |
| package-management | npm                                                                        |
| type-check         | tsc                                                                        |
| formatting         | prettier                                                                   |
| linting+formatting | prettier + lint:contracts (tsx cli/gennady.ts lint)                        |
| git-hooks          | shell-скрипт `.git/hooks/pre-commit`: format → type-check → lint:contracts |
| test-unit          | node:test                                                                  |
| bundler            | vite                                                                       |

### 2.1 Formatter Fixture Exclusion

`.prettierignore` **обязан** содержать `**/__tests__/fixtures/**` — тестовые фикстуры могут содержать намеренно сломанный синтаксис (parse-failed scenarios), и prettier не должен их обрабатывать. `tsconfig.json` также исключает фикстуры из type-check (`"exclude": ["**/__tests__/fixtures/**"]`).

> Полный Decision Log (Design Variants, rationale, Effective Rules для cascade) — запусти `discovery infra-base`.

### 2.2 UV-27A — V1-only SDD eradication inventory

Перед main-cutover repository gate `npm run audit:v1-eradication` строит deterministic sorted inventory
всех tracked и non-ignored candidate-файлов по versioned lexical policy
`scripts/v1-eradication.policy.json`. Директивы при этом читаются как opaque text; XML parser/validator
не используется.

Каждый candidate обязан иметь одну причинную классификацию:

- `canonical-v2` — действующий v2 loader/directive/source, который нельзя удалить по историческому
  имени;
- `required-v1-to-v2-migration-boundary` — bootstrap, flow detection, consumer guard и
  grandfathering, нужные для безопасной миграции внешних consumers;
- `historical-test-evidence` — frozen fixture, completed task/spec history либо eval corpus, который не
  является runtime;
- `unrelated-product-version` — schema/API/product `v1`, не обозначающий поколение SDD.

Старые runtime roots (`ai/directives/sdd/`, bundled `sdd-execute/scripts/`, retired standalone skill
directories, consumer `.claude/skills/sdd-*`, repository-root `tasks/` и `verify.sh`) являются
безусловным forbidden residue. Само имя или path prefix не доказывают класс: protected canonical-v2
файлы дополнительно проверяются по causal identity marker. Active canonical/product code не может
содержать old runtime reference даже после принятия нового digest; исключение — только exact
`<!-- source: ai/directives/sdd/... -->` provenance comment в `ai/kit/axiom|anti-pattern`.
Новый marker без policy-classification, исчезновение protected v2, forbidden active reference,
forbidden residue и любое изменение frozen inventory digest fail closed.
Machine report `gennady.v1-eradication-report.v1` отдаёт sorted entries, counts, policy digest и
SHA-256 inventory digest для последующего UV-27B candidate binding. Inventory digest включает
versioned policy и причинные classifications/reasons, поэтому изменение самой разрешающей политики
тоже требует review.

#### Acceptance

- Реальный old-runtime residue даёт `V1_ERADICATION_FORBIDDEN_RESIDUE`.
- `ai/skills/sdd-execute/SKILL.md` остаётся canonical v2 loader; потеря его router identity красная.
- `migration-bootstrap`, sync consumer guard, V1 fixtures/grandfathering и agent-mon product-version
  остаются в своих явных классах и не удаляются.
- Новый classified или unclassified candidate меняет frozen inventory и блокирует gate до явного
  review policy/digest.
- Current inventory содержит zero V1-only runtime files. UV-27A не фабрикует deletion: единственный
  найденный active stale reference в Go skill переведён с удалённого v1 directive path на v2 router.

### 2.3 UV-27B — main-cutover boundary

`npm run release:boundary -- --candidate --json` является read-only inspection одного exact
main-cutover candidate. Versioned projection связывает expected release branch/upstream, local и
upstream HEAD, current `origin/main` full SHA, candidate tree, deterministic raw `--no-renames`
diff identities (status, path, modes и old/new Git object ids), relevant config/spec hashes и
отдельный evidence-only delta.

UV-25 выполняется на clean product commit `evidenceSourceCommit`. Candidate HEAD может быть только
его descendant, добавляющим frozen UV-25 pack (`manifest.json`, `README.md` и ровно declared raw
logs) и exact UV-26 E-18 evidence file. Любой product/config/rules/cutover/policy/package/workflow byte
между этими commits, undeclared evidence file, deletion или mode/blob drift блокирует candidate.
Independent UV-25 checker проверяет manifest/log inventory и hashes; exact manifest/checker bytes,
`generatedAt`, оба full SHA и evidence delta digest входят в candidate identity. UV-26 обязан иметь
schema `gennady.e18-exact-evidence.v1`, `PASS`, `cloud-ios` и ссылаться на тот же
`evidenceSourceCommit`.

Fresh UV-27A JSON report исполняется на candidate tree; `policyDigest`, `inventoryDigest` и полный
report digest входят в identity. Candidate также требует clean tree, current main ancestor,
отсутствие embedded npm authority и `NPM_TOKEN`/`NODE_AUTH_TOKEN`/npm auth env в cutover process.
Inspection не checkout/merge/reset/commit/tag/push и не авторизует cutover.

Authorization — отдельная read-only проверка с внешним exact
`gennady-main-cutover-ack-v1:<candidateDigest>`. ACK не хранится в repo, не является подписью и не
заменяется PR merge/plan/boolean `approved=true`; candidate полностью пересчитывается перед
сравнением, поэтому challenge другого дерева/доказательства повторно использовать нельзя. Checker
только наблюдает: reconciliation main остаётся отдельной reviewed операцией.

#### UV-27B acceptance

- Wrong branch/upstream, local/upstream divergence, dirty tree, missing/stale main ref или main,
  который не ancestor candidate, дают typed blocker без mutation.
- Release branch, release upstream и main ref проходят conservative Git-ref grammar validation до
  любого remote observation: option-like/leading-hyphen, empty/dot segments, `..`, `@{`, control,
  backslash, trailing dot/slash/`.lock` запрещены; upstream branch обязан в точности равняться
  release branch, а `git ls-remote` отделяет options literal `--`.
- Arbitrary ancestor не считается evidence source: delta допускает только exact manifest-derived
  UV-25 allowlist и exact UV-26 path; extra/missing evidence и любой product byte fail closed.
- UV-25/UV-26/UV-27A missing, malformed, stale или non-PASS блокируют authorization.
- Candidate digest детерминирован; exact ACK проходит в обе стороны только для одного повторно
  вычисленного eligible candidate.
- Текущая release закономерно `BLOCKED`: она не находится на release branch/upstream, UV-25 относится
  к более раннему source commit, UV-26 отсутствует, а current main не является ancestor дерева v2.

<!--SECTION:ENTITY_INVENTORY-->

## UV-27B Entity Inventory

| Name                        | Type         | Purpose                                                      |
| --------------------------- | ------------ | ------------------------------------------------------------ |
| `ReleaseBoundaryPolicy`     | Value Object | Strict versioned release-boundary policy                     |
| `CutoverCandidateReport`    | Value Object | Safe deterministic candidate identity and blockers           |
| `ReleaseBoundaryPorts`      | Port         | Injectable read-only Git/checker boundary for causal tests   |
| `inspectCutoverCandidate`   | Service      | Read-only exact cutover candidate inspection                 |
| `authorizeCutoverCandidate` | Service      | Exact external ACK comparison against a recomputed candidate |
| `denyNpmPublication`        | Service      | Shared fail-closed npm publication denial                    |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:ENTITY_SURFACES-->

## UV-27B Entity Surfaces

### `inspectCutoverCandidate`

- **Usage Waiver:** один production consumer — `release:boundary --candidate`; export сохраняет
  injectable read-only ports для causal offline Git fixtures, чтобы tests доказывали exact remote
  refs/evidence/ACK без реальной сети или credentials. Это deliberate boundary D-INFRA-010, а не
  будущая abstraction.

### `authorizeCutoverCandidate`

- **Usage Waiver:** один production consumer — `release:boundary --authorize`; export нужен тем же
  causal fixtures для race/recompute и non-reusable ACK proof. Другого authorization consumer быть
  не должно: второй путь нарушил бы single-SSOT D-INFRA-010.

<!--/SECTION:ENTITY_SURFACES-->

## 3. Decision Log

### D-INFRA-009 — Eradication by causal inventory, never by name

- **Status:** accepted; implemented by UV-27A.
- **Decision:** удаляется только доказанный V1-only runtime surface. Историческое имя `sdd-execute`,
  слово `V1`, path prefix или номер schema сами по себе не являются доказательством удаления.
- **Why:** canonical v2 skills сохраняют исторические trigger names; consumer migration и frozen
  A13/D-4/V1 evidence остаются частью поддерживаемой v2 границы; agent-mon и Verify/Rules имеют
  собственные versioned schemas.
- **Enforcement:** versioned policy + protected identities + frozen sorted inventory digest; pre-commit
  вызывает `audit:v1-eradication` после directive audits.

### D-INFRA-010 — One inspection SSOT, external exact cutover ACK

- **Status:** accepted; implemented by UV-27B.
- **Decision:** один shared release-boundary строит immutable main-cutover candidate и отдельно
  проверяет external exact ACK. Npm publication в current track имеет другой outcome — unconditional
  DENY, а не ветвь cutover authorization.
- **Why:** product source и runtime evidence возникают в разные моменты. Bounded evidence-only
  descendant устраняет невозможную Git self-reference, но не разрешает скрыть product drift.
- **Threat boundary:** repo hooks покрывают только supported entrypoints. Намеренный внешний
  `npm publish --ignore-scripts` с пользовательскими credentials технически не перехватывается;
  поэтому cutover process требует отсутствия auth env и repository-owned publish authority.

## 4. Delivery Trace

| Task   | Status | Product                                                                                   |
| ------ | ------ | ----------------------------------------------------------------------------------------- |
| UV-27A | done   | inventory/policy/checker, causal tests, pre-commit gate, zero forbidden runtime residue   |
| UV-27B | done   | read-only candidate/ACK SSOT, bounded evidence descendant and npm publication prohibition |
| UV-26+ | open   | exact E-18 evidence, refreshed UV-25, reviewed candidate/ACK and external main cutover    |
