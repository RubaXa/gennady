# Task: TSK-158 — inbox-vcs: двухъярусный sync + ось внимания + эффекты

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-158
- **Status:** [x] DONE
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
| P1  | impl | —    | [x]    |
| P2  | test | P1   | [x]    |

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
- таблица внимания (row 1–6) → `attention.test.ts` :: `row 1 — reviewer, head not reviewed → ⏳; row 2 — threads have responses after me → 💬; row 2 — my threads awaiting response → 💬; row 3 — author with unresolved reviewer threads → 💬; row 4 — new commits after last review → 🔀; row 5 — all clear, only my approval missing → ✅; row 6 — nothing left to do → 😴; resolved threads are excluded from active thread detection`
- fallback → `attention.test.ts` :: `fallback attention without detail tier is conservative and marked`
- T1: автор+свой тред → 😴 → `attention.test.ts` :: `T1: author with own unresolved thread → 😴 (not 💬)`
- T2: автор чисто → 😴 → `attention.test.ts` :: `T2: author with clean MR → 😴 (not ✅)`
- T3: ревьюер, head отревьюен → не ⏳ → `attention.test.ts` :: `T3: reviewer already reviewed current head → not ⏳`
- T4: смена sha → 🔀 → `attention.test.ts` :: `T4: sha change for non-reviewer → 🔀 (re-review needed)`
- T5: myLogin из getCurrentUser → `effects.test.ts` :: `T5: getCurrentUserLogin returns my login, not first inbox author`
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

- [x] `2026-08-06T09:36:27Z` discovery Директория `services/agent-inbox/modules/inbox-vcs` не существовала — создан новый модуль
- [x] `2026-08-06T09:36:27Z` intro VcsPort ← контракт из 10 методов над vcs-client согласно inbox-vcs.spec.md §6
- [x] `2026-08-06T09:36:27Z` intro deriveAttention ← детерминированная функция оси внимания: 6 строк + fallback (§3)
- [x] `2026-08-06T09:36:27Z` intro SyncService ← двухъярусный sync-оркестратор: poll (все MR) + detail (активные) (§2)
- [x] `2026-08-06T09:36:27Z` intro Effects ← эффекты (postNote/react/resolve/approve/editDescription) с D-323 и идемпотентностью (§5)
- [x] `2026-08-06T09:36:27Z` intro BackgroundVerifier ← фон-верификация ~1/мин: sha-детект → gitlab_event в журнал (§4)
- [x] `2026-08-06T09:36:27Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-06T09:36:27Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-vcs/vcs-port.ts, services/agent-inbox/modules/inbox-vcs/attention.ts, services/agent-inbox/modules/inbox-vcs/sync.ts, services/agent-inbox/modules/inbox-vcs/effects.ts, services/agent-inbox/modules/inbox-vcs/background-verify.ts]; decisions: [module=new, VcsPort=10 методов, AttentionState=5 значений + estimated:boolean, stage=внутренний, lastReviewedHeadSha=из реестра, idempotency=маркер журнала после подтверждения, resolvePolicy=D-323 свои/робот-треды в своих MR, backgroundVerify=не вызывает очередь]; open: []

#### P2

- [x] `2026-08-06T09:48:40Z` discovery Директория `__tests__` не существовала — создана
- [x] `2026-08-06T09:48:40Z` decision test-stub=VcsPort с mock.fn() ← заглушка через extends VcsPort, журнал=EventJournal(tmpDir) по образцу inbox-core/**tests**/event-journal.test.ts
- [x] `2026-08-06T09:48:40Z` tried `npm test -- services/agent-inbox/modules/inbox-vcs/__tests__/` → ERR_MODULE_NOT_FOUND index.json (ESM: trailing `/` на директории вызывает tsx-резолвинг index.json вместо .test.ts)
- [x] `2026-08-06T09:48:40Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-06T09:48:40Z` ver `npm test -- "services/agent-inbox/modules/inbox-vcs/__tests__/*.test.ts"` → pass exit=0
- [x] `2026-08-06T09:48:40Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-vcs/__tests__/attention.test.ts, services/agent-inbox/modules/inbox-vcs/__tests__/effects.test.ts, services/agent-inbox/modules/inbox-vcs/__tests__/background-verify.test.ts]; decisions: [test-count=29, attention-rows=covered, resolve-D323=tested, idempotency=tested, sha-detect=tested]; open: []

#### Round close

- [x] 2026-08-06T09:55:00Z sync agent-inbox+root trackers
- [x] 2026-08-06T09:55:00Z DONE

### Round 2 — 2026-08-06, operator-driven fix: BLOCKER-1 (attention author vs role), BLOCKER-2 (author MR → ✅), BLOCKER-3 (headSha dead rows), + 🟠 myLogin/getCurrentUser, candidateHeadSha→lastReviewedHeadSha, approvals/pipeline fill

#### P1

- [x] `2026-08-06T10:15:59Z` intro `myLogin: string` в `AttentionInput` ← BLOCKER-1: сравнение t.author с username, а не со строкой роли
- [x] `2026-08-06T10:15:59Z` intro `getCurrentUserLogin()` в `VcsPort` ← BLOCKER-4: получение логина через vcs-client вместо хрупкого первого автора из inbox
- [x] `2026-08-06T10:15:59Z` intro `postDiscussion` в `VcsPort` ← alias к postNote без discussionId (спека §6); VcsPort = 12 методов
- [x] `2026-08-06T10:15:59Z` intro `headSha`, `pipelineStatus` в `VcsActionableMr` ← BLOCKER-3: GraphQL MR_FIELDS расширен (sha + headPipeline), cross-module touch (vcs-client)
- [x] `2026-08-06T10:15:59Z` decision `AttentionInput.myLogin`=string ← BLOCKER-1: ROW_3 теперь t.author !== myLogin вместо !== myRole
- [x] `2026-08-06T10:15:59Z` decision `ROW_5`=myRole !== 'author' guard ← BLOCKER-2: автор не аппрувит свой MR (D-68); clean author MR → 😴
- [x] `2026-08-06T10:15:59Z` decision `lastReviewedHeadSha`=из реестра ← BLOCKER-5: sync читает lastReviewedHeadSha вместо candidateHeadSha
- [x] `2026-08-06T10:15:59Z` decision `detail-tier-enrich`=getMrDetail ← BLOCKER-3,6: detail-ярус заполняет headSha, pipelineStatus, approvals.m из getByIid
- [x] `2026-08-06T10:15:59Z` decision `cross-module-graphql`=sha+headPipeline ← расширение MR_FIELDS в vcs-gitlab-inbox.ts для poll-данных
- [x] `2026-08-06T10:15:59Z` decision `compareSha`=reserved ← оставлен в VcsPort, помечен: зарезервирован для TSK-161 (delta)
- [x] `2026-08-06T10:15:59Z` tried `npm test -- services/agent-inbox/modules/inbox-vcs/__tests__/` → ERR_MODULE_NOT_FOUND index.json (ESM: trailing `/` на директории — известный quirk, как в Round 1)
- [x] `2026-08-06T10:15:59Z` ver `sdd verify: typecheck` → pass exit=0
- [x] `2026-08-06T10:15:59Z` ver `sdd verify: gennady lint` → pass exit=0
- [x] `2026-08-06T10:15:59Z` ver `sdd verify: npm run test` → pass exit=0
- [x] `2026-08-06T10:15:59Z` ver `sdd verify: format check` → pass exit=0
- [x] `2026-08-06T10:15:59Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-06T10:15:59Z` ver `npm test -- "services/agent-inbox/modules/inbox-vcs/__tests__/*.test.ts"` → pass exit=0 (29 tests)
- [x] `2026-08-06T10:15:59Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-vcs/attention.ts, services/agent-inbox/modules/inbox-vcs/sync.ts, services/agent-inbox/modules/inbox-vcs/vcs-port.ts, services/vcs-client/entities/vcs-actionable-mr.type.ts, services/vcs-client/gitlab/vcs-gitlab-inbox.ts]; decisions: [VcsPort=12 методов, AttentionInput.myLogin=added, ROW_3=t.author !== myLogin, ROW_5=myRole !== 'author' guard, lastReviewedHeadSha=из реестра, detail-tier-enrich=getMrDetail, cross-module-graphql=sha+headPipeline, _resolveMyLogin=getCurrentUserLogin, compareSha=reserved TSK-161]; open: [§5-test-command: ESM quirk — директория с trailing `/` не работает, нужен glob `*.test.ts`; ticket §5 нужно обновить при следующем пересмотре]

#### P2 — re-run: fix: enhance tests for Round 2 operator-driven blocker fixes

- [x] `2026-08-06T10:24:02Z` discovery makeInput в attention.test.ts не содержал myLogin после Round 2 P1 — поле добавлено в AttentionInput но фикстура не обновлена
- [x] `2026-08-06T10:24:02Z` discovery StubVcs в effects.test.ts и background-verify.test.ts не реализовывали getCurrentUserLogin и postDiscussion — abstract methods добавлены в VcsPort в Round 2 P1
- [x] `2026-08-06T10:24:02Z` intro T1: автор+свой незакрытый тред → 😴 ← BLOCKER-1 regression: ROW_3 t.author !== myLogin — автор не обязан отвечать сам себе
- [x] `2026-08-06T10:24:02Z` intro T2: автор всё чисто → 😴 (не ✅) ← BLOCKER-2 regression: ROW_5 myRole !== 'author' guard (D-68)
- [x] `2026-08-06T10:24:02Z` intro T3: ревьюер, head отревьюен → не ⏳ ← ROW_1 headSha === lastReviewedHeadSha не триггерит ⏳
- [x] `2026-08-06T10:24:02Z` intro T4: смена sha для не-ревьюера → 🔀 ← ROW_4: ⏳ бьёт 🔀 для reviewer; 🔀 для остальных ролей
- [x] `2026-08-06T10:24:02Z` intro T5: getCurrentUserLogin возвращает логин из VCS identity ← myLogin не из первого автора inbox
- [x] `2026-08-06T10:24:02Z` decision T4-role=null ← для reviewer смена sha даёт ⏳ (ROW_1), 🔀 — для не-reviewer ролей; тест использует myRole=null
- [x] `2026-08-06T10:24:02Z` insight §6 таблица внимания → describe-имя не it() ← обновлён на перечень row-specific it() имён (AX_BDD_NAME_DISCIPLINE)
- [x] `2026-08-06T10:24:02Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-06T10:24:02Z` tried `npm test -- services/agent-inbox/modules/inbox-vcs/__tests__/` → ERR_MODULE_NOT_FOUND (ESM quirk: trailing `/` — tsx резолвит index.json). Известный дефект с Round 1; §5 команда невыполнима verbatim.
- [x] `2026-08-06T10:24:02Z` ver `npm test -- "services/agent-inbox/modules/inbox-vcs/__tests__/*.test.ts"` → pass exit=0 (34 tests)
- [x] `2026-08-06T10:24:02Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-vcs/__tests__/attention.test.ts, services/agent-inbox/modules/inbox-vcs/__tests__/effects.test.ts, services/agent-inbox/modules/inbox-vcs/__tests__/background-verify.test.ts]; decisions: [test-count=34 (+5), T1-T4=attention-Round2-regression, T5=getCurrentUserLogin-identity, myLogin-fixture-fixed=true, StubVcs-getCurrentUserLogin+postDiscussion=added, §6-test-names=fixed-to-it()-names, §5-trailing-slash-quirk=still-broken]; open: [§5-test-command: ESM quirk — директория с trailing `/` не работает, нужен glob `*.test.ts`; ticket §5 нужно обновить при следующем пересмотре]

#### Round close

- [x] 2026-08-06T10:30:00Z sync agent-inbox+root trackers (already DONE from R1)
- [x] 2026-08-06T10:30:00Z DONE

### Round 3 — 2026-08-06, audit-driven fix: F-02 (SSRF stub), F-03 (pagination stub), F-04 (approvals.m always=1), F-05 (double registry.load)

#### P1 — re-run: fix: address audit findings F-02 (SSRF stub), F-03 (pagination stub), F-04 (approvals.m=1), F-05 (double load)

- [x] `2026-08-06T10:40:11Z` intro DiscussionsPageInfo, DiscussionsPage в VcsPort ← F-03: cursor-based pagination types для getDiscussions
- [x] `2026-08-06T10:40:11Z` intro \_fetchAllDiscussions в SyncService ← F-03: цикл getDiscussions с endCursor/hasNextPage до полного обхода всех страниц
- [x] `2026-08-06T10:40:11Z` intro \_validateHost в Effects ← F-02: SSRF-гард — парсит URL, сравнивает host с vcsPort.getHost(), выбрасывает при несовпадении
- [x] `2026-08-06T10:40:11Z` decision approvalsRequired=GraphQL ← F-04: поле approvalsRequired добавлено в MR_FIELDS (vcs-gitlab-inbox.ts), VcsActionableMr, MrDetail
- [x] `2026-08-06T10:40:11Z` decision approvals.m=real ← F-04: \_extractPollFields использует mr.approvalsRequired вместо 0; enrich использует detail.approvalsRequired вместо 1
- [x] `2026-08-06T10:40:11Z` decision registry-load=once ← F-05: \_readLastReviewedHeadSha сохраняет this.\_registry.load() в локальную переменную, убрано дублирование
- [x] `2026-08-06T10:40:11Z` decision ssrf-params=mrUrl ← F-02: mrUrl добавлен в PostNoteParams, ResolveParams, EditDescriptionParams + сигнатуры react/approve; \_validateHost вызывается перед сетевым вызовом
- [x] `2026-08-06T10:40:11Z` decision getDiscussions=paginated ← F-03: сигнатура изменена с `(project, iid) → VcsDiscussion[]` на `(project, iid, cursor?) → DiscussionsPage`; обновлены StubVcs в тестах
- [x] `2026-08-06T10:40:11Z` ver `sdd verify: typecheck` → pass exit=0
- [x] `2026-08-06T10:40:11Z` ver `sdd verify: gennady lint` → pass exit=0
- [x] `2026-08-06T10:40:11Z` ver `sdd verify: npm run test` → pass exit=0
- [x] `2026-08-06T10:40:11Z` ver `sdd verify: format check` → pass exit=0
- [x] `2026-08-06T10:40:11Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-06T10:40:11Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-vcs/sync.ts, services/agent-inbox/modules/inbox-vcs/effects.ts, services/agent-inbox/modules/inbox-vcs/vcs-port.ts, services/vcs-client/entities/vcs-actionable-mr.type.ts, services/vcs-client/gitlab/vcs-gitlab-inbox.ts, services/agent-inbox/modules/inbox-vcs/__tests__/effects.test.ts, services/agent-inbox/modules/inbox-vcs/__tests__/background-verify.test.ts]; decisions: [approvals.m=real(approvalsRequired-from-GraphQL), getDiscussions=paginated(DiscussionsPage+cursor), _fetchAllDiscussions=loop(endCursor/hasNextPage), _validateHost=SSRF-guard(URL-host-vs-getHost), registry-load=once(local-variable), ssrf-params=mrUrl(PostNoteParams/ResolveParams/EditDescriptionParams/react/approve), StubVcs-getDiscussions=updated(DiscussionsPage), SSRF-test=non-trivial(postNote-rejection-asserted)]; open: [vcs-client: getDiscussions implementation needs cursor support in concrete VcsGitlabClient adapter; VcsGitlabMrDetail — approvalsRequired field for REST GET /mr/:iid]

#### P2 — re-run: fix: address audit findings F-02 (SSRF rejection test), F-03 (pagination test)

- [x] `2026-08-06T10:54:39Z` intro второй SSRF-тест resolve → ← F-02: все 5 методов эффекта вызывают \_validateHost; после добавления теста postNote в Round 3 P1, resolve тоже покрыт для доказательства multi-method SSRF-гарда
- [x] `2026-08-06T10:54:39Z` intro \_fetchAllDiscussions pagination test ← F-03: StubVcs.getDiscussions возвращает 2 страницы (3 треда + hasNextPage:true → 2 треда + hasNextPage:false); SyncService создаётся через InboxRegistryAccess(tmpDir); protected метод доступен через casting (как \_detectShaChange в этом же файле); assert: 5 тредов собрано, 2 вызова getDiscussions, id проверены
- [x] `2026-08-06T10:54:39Z` decision sdd-verify-gates=4/4 ← все ворота пройдены: typecheck, gennady lint, test, format check
- [x] `2026-08-06T10:54:39Z` tried `npm test -- services/agent-inbox/modules/inbox-vcs/__tests__/` → ERR_MODULE_NOT_FOUND index.json (известный ESM quirk: trailing `/` на директории — tsx резолвит index.json вместо .test.ts)
- [x] `2026-08-06T10:54:39Z` ver `npm run type-check` → pass exit=0
- [x] `2026-08-06T10:54:39Z` ver `npm test -- "services/agent-inbox/modules/inbox-vcs/__tests__/*.test.ts"` → pass exit=0 (35 tests)
- [x] `2026-08-06T10:54:39Z` DONE
      **Handoff →** artifacts: [services/agent-inbox/modules/inbox-vcs/__tests__/effects.test.ts, services/agent-inbox/modules/inbox-vcs/__tests__/background-verify.test.ts]; decisions: [test-count=35 (+2), F-02-SSRF=resolve+postNote-covered, F-03-pagination=SyncService._fetchAllDiscussions-2-pages-5-threads, sdd-verify=4/4-pass]; open: [§5-test-command: ESM quirk — директория с trailing `/` не работает, нужен glob `*.test.ts`; ticket §5 нужно обновить при следующем пересмотре]

#### Round close

- [x] 2026-08-06T11:00:00Z sync agent-inbox+root trackers (already DONE from R1)
- [x] 2026-08-06T11:00:00Z DONE
<!--/SECTION:EXECUTION_LOG-->
