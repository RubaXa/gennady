---
name: opencode-get-session
description: Extract opencode session content by title (fuzzy) or by session ID (direct, instant). Two modes — DISCOVERY (find session by name, then dump) and TARGETED (skip search: session ID already known, optional content filter). Repeat calls are instant — pass session ID + optional grep/scope to narrow. Use when user says "найди сессию", "покажи сессию", "что обсуждали в сессии", "opencode get session", "opencode-get-session <имя>", "продолжи ту сессию", "в той же сессии найди про T2".
license: MIT
compatibility: opencode
---

<Skill name="opencode-get-session">
  <Priming>
    DB schema:
    - `session(id, title, time_created, time_updated)` — epoch ms
    - `message(id, session_id, data)` — data is JSON with `role` field
    - `part(message_id, session_id, data)` — data is JSON with `type`, `text`
    Roles: `user`, `assistant`. Join on `message_id`.
    DB path: `~/.local/share/opencode/opencode.db`.
    If DB not found: `find ~ -name "opencode.db" -maxdepth 5 2>/dev/null`.
    Use ONLY sqlite3 CLI — never Read/Glob the DB file.
  </Priming>

  <Mission>
    Extract opencode session content from the local SQLite DB (`~/.local/share/opencode/opencode.db`).
    Two modes:
    1. DISCOVERY — fuzzy search by title, pick session, dump full transcript.
    2. TARGETED — session ID is already known from a prior call: skip search,
       extract instantly. Optionally filter by content keyword (e.g. "найди про T3",
       "покажи только решения 📌").
    Repeat calls with session ID must be instant — zero discovery overhead.
    Read-only; no INSERT/UPDATE/DELETE.
  </Mission>

  <IntakeParsing>
    From the operator message, extract:
    - `sessionId` — if present (starts with `ses_`), TARGETED mode, skip FIND.
    - `name` — session title for fuzzy search (DISCOVERY mode).
    - `filter` — optional content keyword for TARGETED mode
      (e.g. "покажи T2", "найди 📌", "только решения").
    If only a topic keyword is given without name or ID → ask: "В какой сессии искать?".
  </IntakeParsing>

  <ExecutionPlan>
    <Step id="DETECT_MODE">
      - `sessionId` present → jump to EXTRACT_WITH_FILTER (TARGETED, instant).
      - `name` present → FIND session, then EXTRACT_FULL (DISCOVERY).
      - Neither → ask operator for session name.
    </Step>

    <!-- =============== DISCOVERY MODE =============== -->
    <Step id="FIND">
      Fuzzy search by title. Show results to operator:

      ```bash
      sqlite3 ~/.local/share/opencode/opencode.db \
        "SELECT id, title,
                datetime(time_created/1000, 'unixepoch', 'localtime') as created,
                datetime(time_updated/1000, 'unixepoch', 'localtime') as updated
         FROM session
         WHERE title LIKE '%<name>%'
         ORDER BY time_created DESC
         LIMIT 10;"
      ```

      - 0 results → say so, suggest broader query.
      - 1 result → proceed with it.
      - Multiple → ask operator. Show id + title + dates.
      After picking: remember the session ID for subsequent calls.
    </Step>

    <Step id="EXTRACT_FULL">
      Extract all messages:

      ```bash
      sqlite3 ~/.local/share/opencode/opencode.db \
        "SELECT json_extract(m.data, '$.role') as role,
                json_extract(p.data, '$.text') as text
         FROM part p
         JOIN message m ON p.message_id = m.id
         WHERE m.session_id = '<session_id>'
         ORDER BY m.time_created;"
      ```

      Process: `while IFS='|' read role text; do ... done` (bash builtins only).
      Skip if text is empty/null. Truncate > 2000 chars → `... (truncated)`.
      Prefix: `user` → `## 👤 User`, `assistant` → `## 🤖 Assistant`.
    </Step>

    <!-- =============== TARGETED MODE =============== -->
    <Step id="EXTRACT_WITH_FILTER">
      Session ID known — zero discovery time. If `filter` is given, narrow by
      content keyword; otherwise extract all.

      Without filter (fast full dump):
      ```bash
      sqlite3 ~/.local/share/opencode/opencode.db \
        "SELECT json_extract(m.data, '$.role') as role,
                json_extract(p.data, '$.text') as text
         FROM part p
         JOIN message m ON p.message_id = m.id
         WHERE m.session_id = '<session_id>'
         ORDER BY m.time_created;"
      ```

      With filter (e.g. "покажи про T2 в той же сессии"):
      ```bash
      sqlite3 ~/.local/share/opencode/opencode.db \
        "SELECT json_extract(m.data, '$.role') as role,
                substr(json_extract(p.data, '$.text'), 1, 600) as text
         FROM part p
         JOIN message m ON p.message_id = m.id
         WHERE m.session_id = '<session_id>'
           AND json_extract(p.data, '$.text') LIKE '%<filter>%'
         ORDER BY m.time_created;"
      ```

      Also show surrounding context: for each match, optionally extract ±2 messages
      around it by `m.time_created` window.

      Output same format as EXTRACT_FULL. Include a header:
      `## Сессия: <title> (id=<session_id>) — фильтр: "<filter>" — <N> совпадений`
    </Step>

    <Step id="SUMMARIZE">
      After any extraction mode, append a summary:
      - Session ID + title + time range
      - Total messages extracted / matched
      - If filtered: total matches out of total messages
      - Key topics (first line of each user message, truncated to 120 chars)
      - Hint: "Для повторного быстрого доступа используй ID сессии: `<session_id>`"
    </Step>
  </ExecutionPlan>

  <FastPath>
    The operator may chain calls in one conversation. After the first FIND, the
    session ID is known. All subsequent calls MUST skip FIND and go directly to
    EXTRACT_WITH_FILTER. Examples of TARGETED calls:
    - "в сессии ses_05636371affekpzrJDDnb6vTHf найди про T5"
    - "покажи все решения 📌 из той же сессии"
    - "что там было про чеклисты"
    - "дай мне все user-сообщения из ses_05..."
    In the last case (no filter), dump all but keep the summary compact.
  </FastPath>

  <HaltConditions>
    - sqlite3 not available → tell operator to install it.
    - DB not found → suggest `find ~ -name "opencode.db"`.
    - Never write to DB. Read-only queries only.
    - > 200 messages without filter → offer pagination or summarization first.
    - > 50 matches with filter → offer to narrow filter further.
  </HaltConditions>
</Skill>
