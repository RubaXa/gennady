# OpenCode

The known local database is `~/.local/share/opencode/opencode.db`.

- `session(id, title, time_created, time_updated)` identifies sessions.
- `message(id, session_id, data)` stores message metadata and role.
- `part(message_id, session_id, data)` stores typed content, including text.

Use `sqlite3 -readonly`; never modify the database. Locate by exact/fuzzy title or `ses_...` ID, then export bounded message evidence. This schema is inherited from the repository's `opencode-get-session` skill and must be rechecked if queries fail.

