# Claude Code and Claude Desktop

Claude Code read-only transcript storage is `~/.claude/projects/<encoded-workspace>/<session-id>.jsonl`. This is provider session data, not an installed skill or executable entry point. Claude Desktop local-agent metadata on macOS lives under `~/Library/Application Support/Claude/claude-code-sessions/**/local_*.json` and can map a displayed `title` and desktop `sessionId` to `cliSessionId`, worktree, cwd, and branch.

Prefer exact title matches in Desktop metadata. Use its exact `cliSessionId` mapping to locate the transcript. Treat title-only matches in other transcripts as references or related sessions; an absent or conflicting metadata mapping leaves session identity unknown.

Claude subagent transcripts and compaction summaries may contain copied material. Do not count repeated text matches as independent evidence.

