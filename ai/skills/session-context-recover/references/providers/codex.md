# Codex

Use `~/.codex/state_5.sqlite` as the primary read-only catalog. The `threads` table maps `id`, user-visible `name`, initial `title`, `cwd`, `rollout_path`, `git_branch`, and `git_sha`. Prefer an exact `name` match, then exact initial `title`, then a bounded fuzzy match. The JSONL transcript normally lives at `rollout_path`; archived paths may also occur under `~/.codex/archived_sessions`.

Codex `session_meta.cwd` and `turn_context.cwd` describe where the Codex thread ran, not necessarily the worktree discovered inside a recovered foreign-agent session. If evidence identifies a more specific Git worktree that the operator intends to continue, report both and bind continuation to the recovered target worktree, not automatically to the Codex catalog cwd.

Read the database with `sqlite3 -readonly`; never modify it. If the catalog schema is absent or changed, fall back to conservative ID/filename discovery and disclose the limitation.
