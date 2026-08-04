# Task: TSK-158 — inbox-vcs: двухъярусный sync + ось внимания + эффекты

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-158
- **Status:** [ ] TODO
- **Purpose:** Слой правды GitLab: poll/detail ярусы, роль из GitLab, детерминированная ось внимания + fallback без detail, стадия (внутренняя), фон-верификация ~1/мин, эффекты с правами и failure-матрицей.
- **Scope:** `agent-inbox`
- **Module:** `inbox-vcs`
- **Dependencies:** TSK-156
- **Spec References:**
  - Module spec: [inbox-vcs](../../specs/agent-inbox/inbox-vcs/inbox-vcs.spec.md) §2–§6
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`, `integration`
- **Deferred Runtime Scope:** None
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind | Deps | Status |
| --- | ---- | ---- | ------ |
| P1  | impl | —    | [ ]    |
| P2  | test | P1   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — impl

- **Objective:** VcsPort поверх vcs-client: twoTierSync (poll-поля + detail по расписанию), myRole, attention-функция (6 строк + fallback «оценочно»), stage (внутренний) + маппинг, lastReviewedHeadSha reader, BackgroundVerifier (~1/мин активные → записи gitlab_event в журнал; НЕ вызывает очередь — задачи ставит inbox-queue по событиям, циклической зависимости нет), Effects (postNote/react/resolve/approve/editDescription с правами D-323 и маркером после подтверждения).
- **Rules:**
  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-vcs/vcs-port.ts`
  - `services/agent-inbox/modules/inbox-vcs/sync.ts`
  - `services/agent-inbox/modules/inbox-vcs/attention.ts`
  - `services/agent-inbox/modules/inbox-vcs/effects.ts`
  - `services/agent-inbox/modules/inbox-vcs/background-verify.ts`
- **Inputs:** TSK-156 P1 handoff (EventJournal: gitlab_event writer; JournalPort контракт — inbox-core §2)
- **Exit:** `npm run type-check` exit 0; внимание покрывает все 6 строк + fallback
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** unit/integration тесты внимания, fallback, эффектов (права резолва, идемпотентность, failure-матрица), фон-верификации.
- **Rules:**
  - [node-test](../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-vcs/__tests__/attention.test.ts`
  - `services/agent-inbox/modules/inbox-vcs/__tests__/effects.test.ts`
  - `services/agent-inbox/modules/inbox-vcs/__tests__/background-verify.test.ts`
- **Inputs:** P1 handoff
- **Exit:** все BDD-сценарии §4 покрыты; `npm test` по файлам exit 0
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** детерминированная правда GitLab

**Scenario:** типинг-контракт VcsPort/AttentionState [`contract`]

- **Given** порт (11 методов) и замкнутый AttentionState (5 значений + «оценочно»)
- **When** type-check
- **Then** postNote принимает опциональный discussionId; discussions несут position {path,line,headSha}

**Scenario:** ось внимания по таблице §3 [`unit`]

- **Given** набор фикстурных состояний (мой head не ревьюнут / ответ после меня / автор с тредами / sha≠lastReviewed / только аппрув / остальное)
- **When** deriveAttention(state)
- **Then** ⏳ / 💬 / 💬 / 🔀 / ✅ / 😴 соответственно

**Scenario:** fallback-внимание без detail-яруса [`unit`]

- **Given** MR только с poll-полями (без discussions)
- **When** deriveAttention
- **Then** консервативный вывод с флагом «оценочно» (sha изменился → ⏳, иначе 😴)

**Scenario:** резолв чужого треда запрещён [`integration`]

- **Given** тред чужого автора в чужом MR
- **When** effects.resolve(thread)
- **Then** rejection с причиной; маркер не записан; запись failed в журнал

**Scenario:** rate-limit растягивает sync, не роняет [`integration`]

- **Given** GraphQL отвечает 429 + Retry-After
- **When** poll
- **Then** backoff применён, sync отложен, ошибки нет; syncState остаётся ok

**Scenario:** сбой сети на эффекте → безопасный retry без дублей [`integration`]

- **Given** postNote отправлен, ответ потерян до записи маркера
- **When** задача падает и retry-ится
- **Then** маркер отсутствует до подтверждения; ровно один постинг в GitLab итого

**Scenario:** SSRF — чужой host отклоняется [`unit`]

- **Given** URL MR с host ≠ vcsHost
- **When** валидация входящего URL
- **Then** отказ; ни одного запроса на произвольный host

**Scenario:** пагинация discussions обходится полностью [`integration`]

- **Given** MR со 100+ нотами (несколько страниц)
- **When** detail-sync
- **Then** все треды загружены; внимание вычислено по полному набору
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                         | Required by      |
| --------------------------------------------------------------- | ---------------- |
| `npm run type-check`                                            | typescript-rules |
| `npm test -- services/agent-inbox/modules/inbox-vcs/__tests__/` | node-test        |

<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- типинг-контракт → `attention.test.ts` :: `contract: vcs port surface and attention enum`
- таблица внимания → `attention.test.ts` :: `attention derivation covers all six rows`
- fallback → `attention.test.ts` :: `fallback attention without detail tier is conservative and marked`
- резолв чужого → `effects.test.ts` :: `resolve of foreign thread is rejected deterministically`
- rate-limit → `effects.test.ts` :: `rate limit backs off without failing sync`

- сбой сети на эффекте → `effects.test.ts` :: `network failure on effect leaves no marker and retries safely`
- SSRF → `effects.test.ts` :: `foreign host url is rejected`
- пагинация → `background-verify.test.ts` :: `discussions pagination is fully traversed`
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-07-29, initial

#### P1

- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `npm test -- inbox-vcs/__tests__` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE
<!--/SECTION:EXECUTION_LOG-->
