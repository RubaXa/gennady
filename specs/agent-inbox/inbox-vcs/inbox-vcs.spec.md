# Module: inbox-vcs (v2 — новый модуль)

> Parent scope: [`../agent-inbox.spec.md`](../agent-inbox.spec.md) · владеет решениями:
> D-304 (роль из GitLab), D-306 (ось внимания — §6.2 корня), D-323 (права резолва),
> D-324 (фон-верификация) · использует (не владеет) реестр типов inbox-queue §3

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

Слой правды GitLab. Роль, стадия, ось внимания и счётчики карточки вычисляются
**здесь и всегда из живых данных** — не из ручных актов и не из протухшего кэша.
Единственный модуль, которому разрешено менять что-либо в GitLab (эффекты).

Классы реализации: `BackgroundVerifier` (§4), `Effects` (§5).

<!--/SECTION:MODULE_VISION-->

## 2. Двухъярусный набор полей

| Ярус                                        | Когда                                                             | Поля                                                                                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🛰 poll (каждый sync, все MR, один GraphQL) | дёшево, пачкой                                                    | iid, title, webUrl, state, updatedAt, author, reviewers[], approvalState (n/m, approvedBy[]), headPipeline.status, sha, userNotesCount, **myRole** |
| 🔬 detail (активные/видимые MR)             | активные MR — каждый sync (~1/мин); открытый в ленте — немедленно | discussions (треды, resolved, авторы, порядок сообщений, **position {path, line, headSha}**)                                                       |

`myRole`: author > reviewer > mentioned (приоритет как сейчас в inbox-merge).
`mentioned` детектируется на detail-ярусе (упоминание @me в description/нотах/тредах —
GitLab participants/mention notes); до detail-яруса роль mentioned считается
предположительной.

**AttentionState:** 5 значений + флаг `estimated: boolean` (не 6-е значение). Вход `deriveAttention({myRole, lastReviewedHeadSha, headSha, threads[], approvals{n,m,approvedByMe}, estimated})`. Строки 🔀 и ✅ вычисляются из poll-полей (sha, approvals), не из stage.

**Внимание без detail-яруса (fallback):** для MR ещё без detail внимание вычисляется
консервативно по poll-полям: sha изменился/нет моего ревью head → ⏳; остальное → 😴 с
пометкой «оценочно» (карточка показывает, что данные уточняются). Строки оси 💬
уточняются при первом detail-sync — «на каждом sync» читается как «на каждом
detail-sync».

## 2.1 Sync-снимок (DTO для inbox-api и seed-фикстур)

`SyncSnapshot = {mr, role, attention, stage, approvals{n,m,approvedBy[]}, reviewers[], ci, threads{open,total,awaitingMe}, headSha, lastReviewedHeadSha, updatedAt, estimated}` — снимок последнего sync на MR; источник данных BoardProjection и `seedMr` (TSK-166).

## 3. Ось внимания (детерминированная функция)

| Условие                                                                | Внимание               |
| ---------------------------------------------------------------------- | ---------------------- |
| я ревьюер, текущий head не ревьюил                                     | ⏳ ждёт моё ревью      |
| в тредах отвечали после меня / мои треды без ответа                    | 💬 ждёт мой ответ      |
| я автор, неотвеченные/нерезолвнутые треды ревьюеров                    | 💬 ждёт мой ответ/фикс |
| новые коммиты после моего последнего ревью (sha ≠ lastReviewedHeadSha) | 🔀 ждёт ре-ревью       |
| всё чисто, не хватает только моего аппрува                             | ✅ ждёт мой аппрув     |
| остальное                                                              | 😴 ждут других         |

Стадия МР (`review_needed/reply_needed/awaiting_reply/idle`) — **внутренний**
промежуточный словарь inbox-vcs для решений очереди (какой тип задач ставить),
вычисляется из discussions на каждом detail-sync. Наружу (DTO/доска) отдаётся только
**AttentionState** — третьего словаря в UI нет (D-306). Маппинг:
`review_needed→⏳ · reply_needed→💬 · awaiting_reply→😴(ждут других) · idle→😴`.

`lastReviewedHeadSha`: пишет inbox-pipeline при прохождении `gate_verdict` (через
журнал), кэшируется в реестре (inbox-core §3); до первого ревью — отсутствует (строка
🔀 не применяется, действует ⏳).

## 4. Фон-верификация (D-324)

Активные MR (есть очередь/работа) опрашиваются ~1/мин (дешёвый poll по sha/updatedAt):

- sha изменился → `compareSha` → запись `gitlab_event(new_commits)` в журнал.
- новые discussions → запись `gitlab_event(new_threads)` в журнал.

BackgroundVerifier **не вызывает очередь** (нет циклической зависимости vcs↔queue): события читает inbox-queue и сама ставит `verify_fix`/`delta_review`/`thread_triage` со supersede по dedupKey.

- изменился pipeline → 🦊-событие в ленту (failed → enqueue разбор падения).

## 5. Эффекты (единственная точка записи в GitLab)

| Эффект                                                 | Правила                                                                                                                                             |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `postNote(mr, body, discussionId?)` / `postDiscussion` | `postDiscussion` = postNote без discussionId (новый тред); идемпотентность по маркеру журнала; только по решению оператора/auto-mode                |
| `react` (👍)                                           | идемпотентно                                                                                                                                        |
| `resolve`                                              | **только свои треды и треды бота — и только в своих MR** (D-323); чужие — запрещено детерминированно; гонка (уже резолвнут руками) → no-op + журнал |
| `approve`                                              | по гейту оператора или auto-mode capability                                                                                                         |
| `editDescription`                                      | по решению оператора                                                                                                                                |

Все эффекты — задачи типа `effect_*` в inbox-queue (последовательные, exclusiveWith).
Маркер идемпотентности пишется в журнал **после** подтверждения GitLab; сбой сети на
эффекте → задача `failed` + видимая причина (маркер не записан — безопасный retry).

**Failure-матрица steady-state:** rate-limit GraphQL → backoff по Retry-After (sync
растягивается, не падает) · пагинация discussions → полный обход (MR со 100+ нотами) ·
частичные данные (`headPipeline=null` → CI «—»; draft → исключён из активных) ·
GitLab недоступен → syncState: degraded (корень §6.5).

## 6. Поверхности

| Порт      | Методы                                                                                                                                                                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VcsPort` | 12 методов: getCurrentUserLogin (identity), getInbox, getMrDetail, getDiscussions, compareSha, postNote(…, discussionId?), postDiscussion (alias нового треда), react, resolve, approve, editDescription, getHost (SSRF-валидация входящих URL, deeplink) |

## 7. Приёмка

1. На реальном MR роль подхвачена без единого ручного акта; «без роли» — только
   mentioned-only.
2. Ось внимания совпадает с фактическим состоянием GitLab на контрольном наборе MR
   (таблица §3 как тест-кейсы).
3. Стадия пересчитывается на sync: после ответа в треде стадия меняется без CLI-запусков.
4. Попытка резолва чужого треда отклоняется детерминированно (аудит + видимая причина).
5. Фон-верификация: пуш в ветку MR → verify_fix в очереди ≤ 2 мин.

## Critic Rounds

### Round 1 — 2026-07-29 (добивочная волна)

- Verdict: CRITICAL (1 CRITICAL, 7 MAJOR, 2 MINOR)
- Accepted: 10 — CRITICAL: ленивый detail-ярус против «внимание на каждом sync» → политика detail-fetch (активные каждый sync, открытый немедленно) + fallback-внимание по poll-полям + «на каждом detail-sync»; lastReviewedHeadSha (писатель = pipeline при gate_verdict, кэш = реестр); «стадия» = внутренний словарь + маппинг в AttentionState (третьего словаря в UI нет); postDiscussion = postNote без discussionId; шапка-владение (§6.2, реестр — не владеет); failure-матрица (rate-limit/пагинация/частичные/эффект-fail/гонка резолва); детекция mentioned (detail-ярус); position {path,line,headSha} в detail; getHost — JUSTIFY (SSRF + deeplink)
- Rejected: 0
- Reconcile: lastReviewedHeadSha → REUSE поле реестра inbox-core §3
- Changes: §2 ярусы/fallback/mentioned/position; §3 маппинг стадии + источник SHA; §5 эффекты + failure-матрица; §6 порт; шапка

## Handoff Rules Additions

- [typescript-rules](../../../ai/directives/coding/typescript-rules.xml) — impl-фазы (\*.ts)
- [node-test](../../../ai/directives/testing/node-test.xml) (+ testing-common) — test-фазы
