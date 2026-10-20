# Claude Code and Claude Desktop

Claude Code transcripts normally live under `~/.claude/projects/<encoded-workspace>/<session-id>.jsonl`. Claude Desktop local-agent metadata on macOS lives under `~/Library/Application Support/Claude/claude-code-sessions/**/local_*.json` and can map a displayed `title` and desktop `sessionId` to `cliSessionId`, worktree, cwd, and branch.

Prefer exact title matches in Desktop metadata. Use `cliSessionId` to locate the transcript. Treat other transcript files containing the title as references or related sessions until metadata proves identity.

Claude subagent transcripts and compaction summaries may contain copied material. Do not count repeated text matches as independent evidence.

