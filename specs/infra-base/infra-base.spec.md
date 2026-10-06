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

## 4. Delivery Trace

| Task    | Status | Product                                                                                     |
| ------- | ------ | ------------------------------------------------------------------------------------------- |
| UV-27A  | done   | inventory/policy/checker, causal tests, pre-commit gate, zero forbidden runtime residue     |
| UV-27B+ | open   | bind exact UV-27A report digest into reviewed main-cutover authorization/candidate evidence |
